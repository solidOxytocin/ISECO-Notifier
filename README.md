# ISECO Notifier

Unofficial mobile app that notifies Ilocos Sur residents of scheduled power interruptions from **Ilocos Sur Electric Cooperative, Inc. (ISECO)**.

ISECO publishes outages on Facebook as image posters. This project polls their public feed, extracts structured schedules with **Gemini Flash** vision, stores them in Supabase, and pushes alerts via Firebase Cloud Messaging.

> **Disclaimer:** This app is not affiliated with or endorsed by ISECO. Always verify outage schedules on the [official ISECO Facebook page](https://www.facebook.com/ISECO.Official).

## Architecture

```
ISECO Facebook → Apify FB Posts Scraper → Supabase Edge Function (poll_iseco_feed)
              (or rss.app/FetchRSS RSS)        ↓
                              Gemini Flash API (parse images)
                                      ↓
                              PostgreSQL (outages table)
                                      ↓
                              FCM topic: iseco_outages
                                      ↓
                              Flutter app (list + push)
```

## Project structure

| Path | Purpose |
|------|---------|
| [`scripts/`](scripts/) | Phase 1: Node.js Gemini Flash parsing validation |
| [`supabase/`](supabase/) | Schema, migrations, Edge Functions |
| [`iseco_notifier/`](iseco_notifier/) | Flutter mobile app |
| [`samples/`](samples/) | Real ISECO outage images for testing |

## Prerequisites

- Node.js 18+
- [Flutter SDK](https://docs.flutter.dev/get-started/install) (3.2+)
- [Supabase CLI](https://supabase.com/docs/guides/cli)
- Accounts: Supabase, Firebase, Google AI (Gemini), and a feed source — [Apify](https://apify.com/) (preferred) or rss.app/FetchRSS

## Quick start

### 1. Clone and configure secrets

```bash
cp .env.example .env
# Fill in API keys (see table below)
```

| Secret | Where to get it |
|--------|-----------------|
| `GEMINI_API_KEY` | [Google AI Studio](https://aistudio.google.com/apikey) (free tier available) |
| `SUPABASE_URL` / keys | Supabase project Settings → API |
| `APIFY_TOKEN` | [Apify](https://console.apify.com/account/integrations) — Console → Settings → API tokens (preferred source) |
| `ISECO_RSS_FEED_URL` | _Fallback only._ [rss.app](https://rss.app/) / [FetchRSS](https://fetchrss.com/) — used when `APIFY_TOKEN` is unset |
| `FIREBASE_SERVICE_ACCOUNT` | Firebase Console → Project Settings → Service accounts → Generate new private key (paste full JSON) |

> **Feed source:** The puller prefers Apify's [Facebook Posts Scraper](https://apify.com/apify/facebook-posts-scraper) when `APIFY_TOKEN` is set (reliable, no item cap, ~free monthly credit). If it's empty, it falls back to the RSS feed at `ISECO_RSS_FEED_URL`. Both produce the same internal item shape, so the rest of the pipeline is source-agnostic.

> **Incremental fetch & stale outages:** Apify scrapes are bounded by `ISECO_FETCH_WINDOW` (default `14 days`) so only recent posts are pulled; post-level dedup (`processed_posts`) handles exact precision. The poller also drops outages whose end time has already passed (Asia/Manila), and `send_outage_notification` refuses to broadcast a passed outage — so no late/expired alerts.

### 2. Phase 1 — Validate image parsing

```bash
cd scripts
npm install

# Parse a single sample image
node parse-outage.js ../samples/ngcp-district-outage.png --caption "NGCP RESCHEDULED POWER INTERRUPTION"

# Run test cases (requires GEMINI_API_KEY in root .env)
npm test

# Unit test dedup logic (no API key needed)
node test/dedup.test.js
```

### 3. Phase 2 — Supabase backend

```bash
# Link your project
supabase link --project-ref your-project-ref

# Apply schema
supabase db push

# Set Edge Function secrets
supabase secrets set GEMINI_API_KEY=AIza...
supabase secrets set APIFY_TOKEN=apify_api_...
supabase secrets set ISECO_FB_PAGE_URL=https://www.facebook.com/ISECO.Official
# (Fallback) supabase secrets set ISECO_RSS_FEED_URL=https://rss.app/feeds/...
supabase secrets set FIREBASE_SERVICE_ACCOUNT="$(cat service-account.json)"
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Deploy functions
supabase functions deploy poll_iseco_feed
supabase functions deploy send_outage_notification

# Manual test
supabase functions invoke poll_iseco_feed
```

#### Cron schedule (every 2 hours)

In Supabase Dashboard → Database → Extensions, enable `pg_cron`, then:

```sql
SELECT cron.schedule(
  'poll-iseco-feed',
  '0 */2 * * *',
  $$
  SELECT net.http_post(
    url := 'https://YOUR_PROJECT.supabase.co/functions/v1/poll_iseco_feed',
    headers := '{"Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
  );
  $$
);
```

Or use Supabase Dashboard → Edge Functions → Schedules.

### 4. Phase 3 — Flutter app

```bash
cd iseco_notifier

# Generate platform folders if missing (first time only)
flutter create . --org com.iseco --project-name iseco_notifier

cp .env.example .env
# Add SUPABASE_URL and SUPABASE_ANON_KEY

# Firebase: add google-services.json to android/app/
# Follow https://firebase.google.com/docs/flutter/setup

flutter pub get
flutter run
```

### 5. End-to-end test

1. Ensure `poll_iseco_feed` runs and inserts rows into `outages`
2. Open the app — outages list should populate
3. Trigger a test notification:

```bash
curl -X POST https://YOUR_PROJECT.supabase.co/functions/v1/send_outage_notification \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"outage_date":"2026-06-15","start_time":"05:30","end_time":"13:30","areas":["Vigan City"],"purpose":"Test"}'
```

## Features

### MVP
- Upcoming outages list with pull-to-refresh
- Push notifications via FCM topic `iseco_outages`
- Multi-image carousel support (one DB row per schedule)
- Dedup via `dedup_key` to prevent duplicate alerts
- Unofficial app disclaimer on first launch

### Barangay filter (Phase 5)
- Settings → select your barangays/municipalities
- UI highlights "Affects you" on matching outages
- Server-side filtering: set `USE_BARANGAY_FILTER=true` on `send_outage_notification`

## Data model

Each **outage row** represents one schedulable interruption:

- `outage_date`, `start_time`, `end_time`
- `district` (`"1st"` | `"2nd"` | null), `areas[]`, `exclusions[]`
- `dedup_key` = `postId:imageIndex:date:start:end:areasHash`

## Troubleshooting

| Issue | Fix |
|-------|-----|
| No outages in app | Check Supabase RLS; verify `outage_date >= today` |
| FCM not received | Confirm topic subscription; check `FIREBASE_SERVICE_ACCOUNT` is valid JSON |
| Parse failures | Inspect `parse_failures` table; retry with updated prompt |
| `Gemini API 429` / `RESOURCE_EXHAUSTED` | Free tier is ~10 req/min. The puller caps calls per run (`MAX_GEMINI_CALLS_PER_RUN`), backs off on 429, and resumes the backlog next cron run — rate-limited posts are **not** marked processed. Just invoke again, or raise the cap with paid Gemini billing. |
| `Gemini API 503` / `UNAVAILABLE` | Gemini-side overload (temporary). The puller retries with short backoff, then stops gracefully and resumes next run — affected posts are **not** marked processed, so nothing is lost. Just re-invoke later. |
| `Image download failed: 403` | fbcdn blocks non-browser fetches; the puller sends a browser `User-Agent`. If it persists, the image URL has expired — the post will be retried with a fresh scrape. |
| Feed has no images | Apify carousels expose `media[].photo_image.uri`; for RSS, try different rss.app/FetchRSS settings. Text-only posts fall back to caption parsing. |
| `flutter` not found | Install Flutter SDK and add to PATH |

## License

MIT — unofficial community tool. ISECO name and logos belong to Ilocos Sur Electric Cooperative, Inc.
