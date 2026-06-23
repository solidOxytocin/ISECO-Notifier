import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  buildDedupKey,
  parseOutageFromCaption,
  parseOutageFromImage,
  PARSER_VERSION,
  TransientGeminiError,
} from "../_shared/parser.ts";
import { shouldSkipNonOutagePost } from "../_shared/post_filter.ts";
import { outageMatchesStored } from "../_shared/outage_match.ts";
import { parseRssFeed, type RssItem } from "../_shared/rss.ts";
import { fetchApifyPosts } from "../_shared/apify.ts";
import { isOutagePassed } from "../_shared/outage_time.ts";

const RSS_FEED_URL = Deno.env.get("ISECO_RSS_FEED_URL") ?? "";
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

// Apify Facebook Posts Scraper (primary source). Falls back to RSS when unset.
const APIFY_TOKEN = Deno.env.get("APIFY_TOKEN") ?? "";
const ISECO_FB_PAGE_URL = Deno.env.get("ISECO_FB_PAGE_URL") ??
  "https://www.facebook.com/ISECO.Official";
const APIFY_ACTOR_ID = Deno.env.get("APIFY_ACTOR_ID") || undefined;
const APIFY_RESULTS_LIMIT = Number(Deno.env.get("APIFY_RESULTS_LIMIT") ?? "20");
// Only scrape posts newer than this (absolute date, ISO timestamp, or relative
// like "14 days"). Bounds the fetch to recent posts; dedup handles exact precision.
const ISECO_FETCH_WINDOW = Deno.env.get("ISECO_FETCH_WINDOW") ?? "14 days";

// Cap Gemini calls per invocation to stay under the free-tier 10 req/min limit
// and the edge function time budget. Backlogs drain across cron runs.
const MAX_GEMINI_CALLS_PER_RUN = Number(
  Deno.env.get("MAX_GEMINI_CALLS_PER_RUN") ?? "8",
);

// Facebook's CDN rejects requests that don't look like a browser.
const IMAGE_FETCH_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept": "image/avif,image/webp,image/png,image/jpeg,*/*",
};

/**
 * Fetches the latest posts from the configured source. Apify is preferred when
 * APIFY_TOKEN is present; otherwise we fall back to the RSS feed. Both return
 * the same RssItem shape so the rest of the pipeline is source-agnostic.
 */
async function fetchFeedItems(): Promise<{ source: string; items: RssItem[] }> {
  if (APIFY_TOKEN) {
    const items = await fetchApifyPosts({
      token: APIFY_TOKEN,
      pageUrl: ISECO_FB_PAGE_URL,
      actorId: APIFY_ACTOR_ID,
      resultsLimit: APIFY_RESULTS_LIMIT,
      onlyPostsNewerThan: ISECO_FETCH_WINDOW || undefined,
    });
    return { source: "apify", items };
  }

  if (!RSS_FEED_URL) {
    throw new Error("No source configured: set APIFY_TOKEN or ISECO_RSS_FEED_URL");
  }

  const feedRes = await fetch(RSS_FEED_URL);
  if (!feedRes.ok) {
    throw new Error(`RSS fetch failed: ${feedRes.status}`);
  }
  const feedXml = await feedRes.text();
  return { source: "rss", items: parseRssFeed(feedXml) };
}

function mediaTypeFromUrl(url: string): string {
  const lower = url.toLowerCase();
  if (lower.includes(".png")) return "image/png";
  if (lower.includes(".webp")) return "image/webp";
  return "image/jpeg";
}

async function sendFcmForNewOutage(outage: Record<string, unknown>) {
  const fcmUrl = `${SUPABASE_URL}/functions/v1/send_outage_notification`;
  await fetch(fcmUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify(outage),
  }).catch((err) => console.error("FCM trigger failed:", err));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, content-type",
      },
    });
  }

  try {
    if (!GEMINI_API_KEY) {
      throw new Error("Missing GEMINI_API_KEY");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { source, items } = await fetchFeedItems();

    const { data: processed } = await supabase
      .from("processed_posts")
      .select("source_post_id");

    const processedIds = new Set((processed ?? []).map((p) => p.source_post_id));

    const results = {
      source,
      scanned: items.length,
      new_posts: 0,
      skipped_posts: 0,
      outages_inserted: 0,
      outages_cancelled: 0,
      outages_skipped_past: 0,
      gemini_calls: 0,
      stopped_early: false,
      stop_reason: "" as string,
      errors: [] as string[],
    };

    // Insert each parsed outage (idempotent via dedup_key) and fire FCM for new rows.
    const insertOutages = async (
      outages: Awaited<ReturnType<typeof parseOutageFromImage>>["outages"],
      item: typeof items[number],
      imageIndex: number,
    ) => {
      for (const outage of outages) {
        if (outage.status === "cancelled") {
          const { data: candidates } = await supabase
            .from("outages")
            .select("*")
            .eq("outage_date", outage.outage_date)
            .eq("status", "active");

          const match = (candidates ?? []).find((row) =>
            outageMatchesStored(
              {
                outage_date: row.outage_date,
                start_time: row.start_time,
                end_time: row.end_time,
                outage_type: row.outage_type,
                district: row.district,
                areas: row.areas ?? [],
                partial_areas: row.partial_areas ?? [],
                exclusions: row.exclusions ?? [],
              },
              outage,
            )
          );

          if (match) {
            const { data: updated, error: updateErr } = await supabase
              .from("outages")
              .update({
                status: "cancelled",
                cancelled_at: new Date().toISOString(),
                cancellation_source_post_id: item.sourcePostId,
              })
              .eq("id", match.id)
              .select()
              .single();

            if (updateErr) throw updateErr;

            results.outages_cancelled++;
            if (updated) {
              await sendFcmForNewOutage({
                ...updated,
                use_barangay_filter:
                  Deno.env.get("USE_BARANGAY_FILTER") === "true",
              });
            }
            continue;
          }

          const dedupKey = buildDedupKey({
            sourcePostId: item.sourcePostId,
            imageIndex,
            outageDate: outage.outage_date,
            startTime: outage.start_time,
            endTime: outage.end_time,
            outageType: outage.outage_type,
            status: "cancelled",
            areas: outage.areas,
            partial_areas: outage.partial_areas,
            district: outage.district,
            exclusions: outage.exclusions,
          });

          const { data: inserted, error: insertErr } = await supabase
            .from("outages")
            .insert({
              status: "cancelled",
              outage_type: outage.outage_type,
              outage_date: outage.outage_date,
              start_time: outage.start_time,
              end_time: outage.end_time,
              district: outage.district,
              areas: outage.areas,
              partial_areas: outage.partial_areas,
              areas_raw: outage.areas_raw,
              exclusions: outage.exclusions,
              purpose: outage.purpose,
              source_post_id: item.sourcePostId,
              image_index: imageIndex,
              dedup_key: dedupKey,
              confidence: outage.confidence,
              parser_version: PARSER_VERSION,
              raw_caption: item.caption,
              cancelled_at: new Date().toISOString(),
              cancellation_source_post_id: item.sourcePostId,
            })
            .select()
            .single();

          if (insertErr) {
            if (insertErr.code === "23505") continue;
            throw insertErr;
          }

          results.outages_cancelled++;
          if (inserted) {
            await sendFcmForNewOutage({
              ...inserted,
              use_barangay_filter:
                Deno.env.get("USE_BARANGAY_FILTER") === "true",
            });
          }
          continue;
        }

        // Skip active outages that have already ended — no point storing or notifying.
        if (isOutagePassed(outage)) {
          results.outages_skipped_past++;
          continue;
        }

        const dedupKey = buildDedupKey({
          sourcePostId: item.sourcePostId,
          imageIndex,
          outageDate: outage.outage_date,
          startTime: outage.start_time,
          endTime: outage.end_time,
          outageType: outage.outage_type,
          status: "active",
          areas: outage.areas,
          partial_areas: outage.partial_areas,
          district: outage.district,
          exclusions: outage.exclusions,
        });

        const { data: inserted, error: insertErr } = await supabase
          .from("outages")
          .insert({
            status: "active",
            outage_type: outage.outage_type,
            outage_date: outage.outage_date,
            start_time: outage.start_time,
            end_time: outage.end_time,
            district: outage.district,
            areas: outage.areas,
            partial_areas: outage.partial_areas,
            areas_raw: outage.areas_raw,
            exclusions: outage.exclusions,
            purpose: outage.purpose,
            source_post_id: item.sourcePostId,
            image_index: imageIndex,
            dedup_key: dedupKey,
            confidence: outage.confidence,
            parser_version: PARSER_VERSION,
            raw_caption: item.caption,
          })
          .select()
          .single();

        if (insertErr) {
          if (insertErr.code === "23505") continue; // duplicate dedup_key
          throw insertErr;
        }

        results.outages_inserted++;
        if (inserted) {
          await sendFcmForNewOutage({
            ...inserted,
            use_barangay_filter: Deno.env.get("USE_BARANGAY_FILTER") === "true",
          });
        }
      }
    };

    for (const item of items) {
      if (processedIds.has(item.sourcePostId)) continue;

      // Stop before starting a new post once the per-run Gemini budget is spent;
      // remaining posts stay unprocessed and are picked up on the next run.
      if (results.gemini_calls >= MAX_GEMINI_CALLS_PER_RUN) {
        results.stopped_early = true;
        results.stop_reason = "max_gemini_calls_per_run";
        break;
      }

      results.new_posts++;

      const postFilter = shouldSkipNonOutagePost(item.caption);
      if (postFilter.skip) {
        results.skipped_posts++;
        await supabase.from("processed_posts").upsert({
          source_post_id: item.sourcePostId,
          image_count: item.imageUrls.length,
          status: "skipped",
          error_message: postFilter.reason ?? "non_outage_post",
          processed_at: new Date().toISOString(),
        });
        continue;
      }

      // Text-only post with no usable image: try caption-only parse if there's
      // text, otherwise skip cleanly (not an error).
      if (item.imageUrls.length === 0) {
        if (!item.caption || item.caption.trim().length === 0) {
          results.skipped_posts++;
          await supabase.from("processed_posts").upsert({
            source_post_id: item.sourcePostId,
            image_count: 0,
            status: "skipped",
            error_message: "no_content",
            processed_at: new Date().toISOString(),
          });
          continue;
        }

        try {
          results.gemini_calls++;
          const { outages } = await parseOutageFromCaption(
            item.caption,
            GEMINI_API_KEY,
          );
          await insertOutages(outages, item, 0);
          await supabase.from("processed_posts").upsert({
            source_post_id: item.sourcePostId,
            image_count: 0,
            status: "complete",
            processed_at: new Date().toISOString(),
          });
        } catch (err) {
          if (err instanceof TransientGeminiError) {
            results.stopped_early = true;
            results.stop_reason = err.reason;
            break; // leave this post unprocessed for the next run
          }
          const msg = err instanceof Error ? err.message : String(err);
          results.errors.push(`${item.sourcePostId}[caption]: ${msg}`);
          await supabase.from("parse_failures").insert({
            source_post_id: item.sourcePostId,
            image_url: null,
            image_index: 0,
            error: msg,
          });
          await supabase.from("processed_posts").upsert({
            source_post_id: item.sourcePostId,
            image_count: 0,
            status: "partial",
            processed_at: new Date().toISOString(),
          });
        }
        continue;
      }

      let imageCount = 0;
      let hadError = false;
      let rateLimited = false;

      for (let imageIndex = 0; imageIndex < item.imageUrls.length; imageIndex++) {
        if (results.gemini_calls >= MAX_GEMINI_CALLS_PER_RUN) {
          rateLimited = true; // budget exhausted mid-post: resume next run
          results.stopped_early = true;
          results.stop_reason = "max_gemini_calls_per_run";
          break;
        }

        const imageUrl = item.imageUrls[imageIndex];
        imageCount++;

        try {
          const imgRes = await fetch(imageUrl, { headers: IMAGE_FETCH_HEADERS });
          if (!imgRes.ok) {
            throw new Error(`Image download failed: ${imgRes.status}`);
          }

          const imageBytes = new Uint8Array(await imgRes.arrayBuffer());
          const mediaType = mediaTypeFromUrl(imageUrl);

          results.gemini_calls++;
          const { outages } = await parseOutageFromImage(
            imageBytes,
            mediaType,
            item.caption,
            GEMINI_API_KEY,
          );

          await insertOutages(outages, item, imageIndex);
        } catch (err) {
          if (err instanceof TransientGeminiError) {
            rateLimited = true;
            results.stopped_early = true;
            results.stop_reason = err.reason;
            break; // stop this post's remaining images
          }
          hadError = true;
          const msg = err instanceof Error ? err.message : String(err);
          results.errors.push(`${item.sourcePostId}[${imageIndex}]: ${msg}`);

          await supabase.from("parse_failures").insert({
            source_post_id: item.sourcePostId,
            image_url: imageUrl,
            image_index: imageIndex,
            error: msg,
          });
        }
      }

      // Rate-limited / budget-capped posts are NOT marked processed, so the next
      // run retries them. Outage inserts are idempotent (dedup_key), so partial
      // progress won't create duplicates.
      if (rateLimited) break;

      await supabase.from("processed_posts").upsert({
        source_post_id: item.sourcePostId,
        image_count: imageCount,
        status: hadError ? "partial" : "complete",
        processed_at: new Date().toISOString(),
      });
    }

    return new Response(JSON.stringify(results, null, 2), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
