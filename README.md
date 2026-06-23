# ISECO Notifier

Unofficial mobile app that notifies Ilocos Sur residents of power interruptions from **Ilocos Sur Electric Cooperative, Inc. (ISECO)**.

ISECO publishes outages on Facebook as image posters and text posts. This project polls their public feed, filters non-outage content, extracts structured data with **Gemini Flash** vision, stores rows in Supabase, and pushes alerts via Firebase Cloud Messaging.

> **Disclaimer:** This app is not affiliated with or endorsed by ISECO. Always verify outage schedules on the [official ISECO Facebook page](https://www.facebook.com/ISECO.Official).

## Architecture

```
ISECO Facebook → Apify FB Posts Scraper (or RSS fallback)
                        ↓
              poll_iseco_feed (Edge Function)
                        ↓
         post_filter.ts — skip holiday/PR/billing posts
                        ↓
         Gemini Flash — parse scheduled / emergency / cancelled
                        ↓
         normalize.ts + outage_match.ts (cancellations)
                        ↓
              PostgreSQL (outages table)
                        ↓
         send_outage_notification → FCM topic iseco_outages
                        ↓
              Flutter app (list + push)
```

## Project structure

| Path | Purpose |
|------|---------|
| [`scripts/`](scripts/) | Node.js Gemini parsing validation (`parse-outage.js`, test cases) |
| [`supabase/`](supabase/) | Schema, migrations, Edge Functions |
| [`supabase/functions/_shared/`](supabase/functions/_shared/) | Parser, normalizer, post filter, outage matcher, district data |
| [`iseco_notifier/`](iseco_notifier/) | Flutter mobile app |
| [`samples/`](samples/) | Real ISECO images for local parser testing |

## Outage types

ISECO posts fall into four categories. The parser (`parser.ts`, version **2.4.0-cancelled**) handles three; the fourth is filtered out before Gemini runs.

| Type | Source | Key fields | App / notification |
|------|--------|------------|-------------------|
| **Scheduled** | Red “Notice of Power Interruption” poster | `outage_type: scheduled`, `start_time`, `end_time`, `status: active` | Time range card; “ISECO Power Interruption” push |
| **Emergency** | Caption text / Power Advisory (often photo unrelated) | `outage_type: emergency`, `start_time` = “As of …”, `end_time: null` | Orange “Emergency” badge; “ISECO Emergency Outage” push |
| **Cancelled** | “CANCELLED” stamp on poster or caption says cancelled | `status: cancelled`, original date/time/areas preserved | Grey strikethrough card; “ISECO Outage Cancelled” push |
| **Non-outage** (skipped) | Holiday advisory, PR, billing, job posts | Not stored | Skipped via `post_filter.ts` → `processed_posts.status: skipped` |

### Cancellation matching

When a cancellation is parsed, `poll_iseco_feed` searches for an **active** row with the same date, start time, district, and areas (`outage_match.ts`). If found, it updates that row to `status: cancelled` and sets `cancelled_at`. If not found, it inserts a standalone cancelled row.

## Data model

Each row in `outages` represents one interruption (or its cancellation):

| Column | Type | Notes |
|--------|------|-------|
| `outage_date` | DATE | Event date |
| `start_time` | TIME | Window start, or “as of” time for emergencies |
| `end_time` | TIME, nullable | Null for emergency outages |
| `outage_type` | TEXT | `scheduled` \| `emergency` |
| `status` | TEXT | `active` \| `cancelled` |
| `district` | TEXT | `1st` \| `2nd` \| null |
| `areas` | JSONB | Full-coverage locations |
| `partial_areas` | JSONB | “Some parts of:” locations only |
| `exclusions` | JSONB | EXCEPT locations |
| `areas_raw` | JSONB | Raw poster bullets |
| `purpose` | TEXT | Purpose/s or Reason line |
| `cancelled_at` | TIMESTAMPTZ | When cancellation was recorded |
| `cancellation_source_post_id` | TEXT | Facebook post that cancelled it |
| `dedup_key` | TEXT UNIQUE | `{postId}:{imageIndex}:{type}:{status}:{date}:{start}:{end}:…` |
| `source_post_id`, `image_index`, `confidence`, `parser_version`, `raw_caption` | | Provenance |

**RLS:** Public read where `outage_date >= CURRENT_DATE`. Service role writes.

**Related tables:** `processed_posts`, `parse_failures`, `devices` (FCM tokens + watched barangays).

## Prerequisites

- Node.js 18+
- [Flutter SDK](https://docs.flutter.dev/get-started/install) (3.2+)
- [Supabase CLI](https://supabase.com/docs/guides/cli)
- [Deno](https://deno.land/) (optional, for Edge Function unit tests)
- Accounts: Supabase, Firebase, Google AI (Gemini), Apify (preferred) or rss.app

## Quick start

### 1. Clone and configure secrets

```bash
cp .env.example .env
# Fill in API keys (see table below)
```

| Secret | Where to get it |
|--------|-----------------|
| `GEMINI_API_KEY` | [Google AI Studio](https://aistudio.google.com/apikey) |
| `SUPABASE_URL` / keys | Supabase project Settings → API |
| `APIFY_TOKEN` | [Apify](https://console.apify.com/account/integrations) (preferred feed source) |
| `ISECO_RSS_FEED_URL` | Fallback when `APIFY_TOKEN` is unset |
| `FIREBASE_SERVICE_ACCOUNT` | Firebase → Service accounts → Generate private key (full JSON) |

See [`.env.example`](.env.example) for optional vars: `GEMINI_MODEL`, `MAX_GEMINI_CALLS_PER_RUN`, `ISECO_FETCH_WINDOW`, `USE_BARANGAY_FILTER`, `APIFY_RESULTS_LIMIT`.

### 2. Phase 1 — Validate parsing (local)

```bash
cd scripts
npm install

# Scheduled outage
node parse-outage.js ../samples/ngcp-district-outage.png --caption "NGCP RESCHEDULED POWER INTERRUPTION"

# Cancelled outage (save samples/cancelled-june3.png first)
node parse-outage.js ../samples/cancelled-june3.png --caption "Scheduled Power Interruption by NGCP on June 3, 2026, affecting the whole 1st District of Ilocos Sur is cancelled."

# Unit tests (no API key)
node test/dedup.test.js
node test/normalize.test.js

# Integration test cases (needs GEMINI_API_KEY)
npm test
```

**Deno tests** (from repo root):

```bash
deno test supabase/functions/_shared/post_filter_test.ts
deno test supabase/functions/_shared/outage_match_test.ts
deno test supabase/functions/_shared/outage_time_test.ts
deno test supabase/functions/_shared/filter_test.ts
```

**Flutter tests:**

```bash
cd iseco_notifier
flutter test
```

### 3. Phase 2 — Supabase backend

```bash
supabase link --project-ref your-project-ref
supabase db push

supabase secrets set GEMINI_API_KEY=AIza...
supabase secrets set APIFY_TOKEN=apify_api_...
supabase secrets set ISECO_FB_PAGE_URL=https://www.facebook.com/ISECO.Official
supabase secrets set FIREBASE_SERVICE_ACCOUNT="$(cat service-account.json)"
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=eyJ...

supabase functions deploy poll_iseco_feed
supabase functions deploy send_outage_notification

supabase functions invoke poll_iseco_feed
```

Poller response fields include: `outages_inserted`, `outages_cancelled`, `outages_skipped_past`, `skipped_posts`, `gemini_calls`.

See [`DEPLOYMENT.md`](DEPLOYMENT.md) for cron, monitoring, and production checklist.

### 4. Phase 3 — Flutter app

See [`iseco_notifier/SETUP.md`](iseco_notifier/SETUP.md).

```bash
cd iseco_notifier
cp .env.example .env   # SUPABASE_URL + SUPABASE_ANON_KEY
flutter pub get
flutter run
```

### 5. End-to-end tests

**Active scheduled notification:**

```bash
curl -X POST "https://YOUR_PROJECT.supabase.co/functions/v1/send_outage_notification" \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"status":"active","outage_type":"scheduled","outage_date":"2026-06-15","start_time":"05:30","end_time":"13:30","areas":["Vigan City"]}'
```

**Cancelled notification:**

```bash
curl -X POST "https://YOUR_PROJECT.supabase.co/functions/v1/send_outage_notification" \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"status":"cancelled","outage_type":"scheduled","outage_date":"2026-06-03","start_time":"05:30","end_time":"13:30","district":"1st","areas":[],"exclusions":["Puro, Caoayan"]}'
```

**Cancellation DB flow:** Insert an active row in SQL, run the poller on a matching cancellation post (or re-parse after deleting the row from `processed_posts`), verify `status` flips to `cancelled`.

## Features

### Core
- Scheduled, emergency, and cancelled outage support
- Non-outage post filtering (holiday advisories, PR, billing)
- Upcoming outages list with pull-to-refresh
- Push notifications via FCM topic `iseco_outages`
- Multi-image carousel support (one DB row per schedule)
- Dedup via `dedup_key`; cancellation matching via `outage_match.ts`
- Unofficial app disclaimer on first launch

### Barangay filter (optional)
- Settings → select barangays/municipalities
- UI highlights “Affects you” / “Some parts” on matching outages
- Server-side filtering: `USE_BARANGAY_FILTER=true` on `send_outage_notification`

### Incremental fetch & stale handling
- Apify bounded by `ISECO_FETCH_WINDOW` (default `14 days`)
- Post-level dedup in `processed_posts`
- Active outages past end time are not stored or notified (`outage_time.ts`)
- Cancellation notifications are sent even if the original window has passed

## Key source files

| File | Role |
|------|------|
| `supabase/functions/poll_iseco_feed/index.ts` | Feed pull, filter, parse, insert/update |
| `supabase/functions/_shared/parser.ts` | Gemini prompt + validation |
| `supabase/functions/_shared/post_filter.ts` | Skip non-outage captions |
| `supabase/functions/_shared/outage_match.ts` | Match cancellations to active rows |
| `supabase/functions/_shared/normalize.ts` | District/area normalization |
| `supabase/functions/send_outage_notification/index.ts` | FCM v1 push |
| `iseco_notifier/lib/models/outage.dart` | Flutter model |
| `iseco_notifier/lib/screens/outages_screen.dart` | Outage cards UI |

## Troubleshooting

| Issue | Fix |
|-------|-----|
| No outages in app | Check RLS; verify `outage_date >= today` |
| FCM not received | Confirm `FIREBASE_SERVICE_ACCOUNT` JSON; topic `iseco_outages` |
| Parse failures | Inspect `parse_failures`; retry with updated prompt |
| Cancellation didn’t update row | Active row date/time/district/areas must match parsed cancellation |
| Post skipped incorrectly | Check `processed_posts.error_message`; adjust `post_filter.ts` |
| `Gemini API 429` | Free tier ~10 req/min; poller caps `MAX_GEMINI_CALLS_PER_RUN`, resumes next run |
| `Gemini API 503` | Transient; post left unprocessed for retry |
| `Image download failed: 403` | fbcdn blocks non-browser fetches; poller sends browser User-Agent |
| Feed has no images | Text-only posts use caption-only parsing |
| `flutter` not found | Install Flutter SDK and add to PATH |

## Roadmap

See [`TODO.md`](TODO.md) for planned UI and deployment tasks.

## AI assistant context

For coding tasks, start with **[`docs/AI_CONTEXT.md`](docs/AI_CONTEXT.md)** — single reference for outage types (scheduled/emergency/cancelled), data model, pipeline, key files, and testing.

## License

MIT — unofficial community tool. ISECO name and logos belong to Ilocos Sur Electric Cooperative, Inc.
