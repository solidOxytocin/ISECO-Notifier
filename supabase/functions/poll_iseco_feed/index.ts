import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  buildDedupKey,
  parseOutageFromImage,
  PARSER_VERSION,
} from "../_shared/parser.ts";
import { shouldSkipNonOutagePost } from "../_shared/post_filter.ts";
import { parseRssFeed } from "../_shared/rss.ts";

const RSS_FEED_URL = Deno.env.get("ISECO_RSS_FEED_URL") ?? "";
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

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
    if (!RSS_FEED_URL || !GEMINI_API_KEY) {
      throw new Error("Missing ISECO_RSS_FEED_URL or GEMINI_API_KEY");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const feedRes = await fetch(RSS_FEED_URL);
    if (!feedRes.ok) {
      throw new Error(`RSS fetch failed: ${feedRes.status}`);
    }

    const feedXml = await feedRes.text();
    const items = parseRssFeed(feedXml);

    const { data: processed } = await supabase
      .from("processed_posts")
      .select("source_post_id");

    const processedIds = new Set((processed ?? []).map((p) => p.source_post_id));

    const results = {
      scanned: items.length,
      new_posts: 0,
      skipped_posts: 0,
      outages_inserted: 0,
      errors: [] as string[],
    };

    for (const item of items) {
      if (processedIds.has(item.sourcePostId)) continue;

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

      let imageCount = 0;
      let hadError = false;

      if (item.imageUrls.length === 0) {
        await supabase.from("parse_failures").insert({
          source_post_id: item.sourcePostId,
          image_url: null,
          image_index: 0,
          error: "No images found in RSS item",
        });
        hadError = true;
      }

      for (let imageIndex = 0; imageIndex < item.imageUrls.length; imageIndex++) {
        const imageUrl = item.imageUrls[imageIndex];
        imageCount++;

        try {
          const imgRes = await fetch(imageUrl);
          if (!imgRes.ok) {
            throw new Error(`Image download failed: ${imgRes.status}`);
          }

          const imageBytes = new Uint8Array(await imgRes.arrayBuffer());
          const mediaType = mediaTypeFromUrl(imageUrl);

          const { outages, raw_response } = await parseOutageFromImage(
            imageBytes,
            mediaType,
            item.caption,
            GEMINI_API_KEY,
          );

          for (const outage of outages) {
            const dedupKey = buildDedupKey({
              sourcePostId: item.sourcePostId,
              imageIndex,
              outageDate: outage.outage_date,
              startTime: outage.start_time,
              endTime: outage.end_time,
              areas: outage.areas,
              partial_areas: outage.partial_areas,
              district: outage.district,
              exclusions: outage.exclusions,
            });

            const { data: inserted, error: insertErr } = await supabase
              .from("outages")
              .insert({
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
                use_barangay_filter:
                  Deno.env.get("USE_BARANGAY_FILTER") === "true",
              });
            }
          }
        } catch (err) {
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
