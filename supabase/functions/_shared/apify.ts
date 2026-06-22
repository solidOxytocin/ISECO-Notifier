import type { RssItem } from "./rss.ts";

interface ApifyPhotoImage {
  uri?: string;
}

interface ApifyMedia {
  thumbnail?: string;
  __typename?: string;
  photo_image?: ApifyPhotoImage;
  url?: string;
}

interface ApifyPost {
  postId?: string;
  url?: string;
  topLevelUrl?: string;
  time?: string;
  text?: string;
  media?: ApifyMedia[];
}

export interface ApifyFetchOptions {
  token: string;
  pageUrl: string;
  /** Apify actor id, tilde-separated (e.g. "apify~facebook-posts-scraper"). */
  actorId?: string;
  /** Max posts to pull per run. */
  resultsLimit?: number;
  /**
   * Only fetch posts newer than this. Accepts an absolute date (YYYY-MM-DD),
   * an ISO timestamp, or a relative value like "14 days". Bounds the scrape to
   * recent posts so we don't pull (and waste Gemini calls on) a stale backlog.
   */
  onlyPostsNewerThan?: string;
}

const DEFAULT_ACTOR_ID = "apify~facebook-posts-scraper";
const DEFAULT_RESULTS_LIMIT = 20;

function isImageUrl(url: string): boolean {
  // fbcdn image URLs don't always carry a clean extension, so accept the
  // common image hosts/extensions but reject obvious non-images.
  if (/\.(jpg|jpeg|png|webp)/i.test(url)) return true;
  return /scontent|fbcdn|cdninstagram/i.test(url);
}

function extractApifyImages(media?: ApifyMedia[]): string[] {
  if (!media) return [];
  const urls: string[] = [];
  for (const m of media) {
    const candidate = m.photo_image?.uri ?? m.thumbnail;
    if (candidate && isImageUrl(candidate)) urls.push(candidate);
  }
  return [...new Set(urls)];
}

/** Stable id that mirrors the RSS parser's `fb_<digits>` scheme for dedup continuity. */
function buildSourcePostId(post: ApifyPost): string {
  if (post.postId) return `fb_${post.postId}`;
  const link = post.url ?? post.topLevelUrl ?? "";
  const fbMatch = link.match(/\/posts\/(\d+)/) ?? link.match(/fbid=(\d+)/);
  if (fbMatch) return `fb_${fbMatch[1]}`;
  return `post_${btoa(link || crypto.randomUUID()).slice(0, 32)}`;
}

/** Maps raw Apify Facebook Posts Scraper output to the shared feed item shape. */
export function mapApifyPostsToItems(posts: ApifyPost[]): RssItem[] {
  return posts.map((post) => ({
    sourcePostId: buildSourcePostId(post),
    title: "",
    caption: post.text ?? "",
    publishedAt: post.time ?? "",
    imageUrls: extractApifyImages(post.media),
    link: post.url ?? post.topLevelUrl ?? "",
  }));
}

/**
 * Runs the Apify Facebook Posts Scraper synchronously and returns mapped feed
 * items. Uses the run-sync-get-dataset-items endpoint, which blocks until the
 * actor finishes and returns the dataset as a JSON array.
 */
export async function fetchApifyPosts(opts: ApifyFetchOptions): Promise<RssItem[]> {
  const actorId = opts.actorId ?? DEFAULT_ACTOR_ID;
  const resultsLimit = opts.resultsLimit ?? DEFAULT_RESULTS_LIMIT;
  const endpoint =
    `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items` +
    `?token=${encodeURIComponent(opts.token)}`;

  const input: Record<string, unknown> = {
    startUrls: [{ url: opts.pageUrl }],
    resultsLimit,
  };
  if (opts.onlyPostsNewerThan) {
    input.onlyPostsNewerThan = opts.onlyPostsNewerThan;
  }

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Apify run failed: ${res.status} ${body.slice(0, 300)}`);
  }

  const data = await res.json();
  if (!Array.isArray(data)) {
    throw new Error("Apify returned a non-array dataset");
  }

  return mapApifyPostsToItems(data as ApifyPost[]);
}
