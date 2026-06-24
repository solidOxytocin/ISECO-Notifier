# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Unofficial mobile app that notifies Ilocos Sur residents of ISECO power interruptions. A Supabase Edge Function polls ISECO's public Facebook feed, filters non-outage posts, extracts structured outage data with Gemini vision/NLP, stores it in PostgreSQL, and pushes FCM alerts to a Flutter app.

**Start here for any coding task:** [`docs/AI_CONTEXT.md`](docs/AI_CONTEXT.md) is the canonical reference — outage types, full data model, pipeline behavior, parser JSON schema, and edit-pattern → files-to-touch table. This file is the quick orientation; AI_CONTEXT.md is the depth.

## Three sub-projects, three toolchains

| Path | Stack | Runtime |
|------|-------|---------|
| `supabase/functions/` | TypeScript Edge Functions | Deno |
| `scripts/` | Node.js (ESM) Gemini parser validation harness | Node 18+ |
| `iseco_notifier/` | Flutter app (BLoC/Cubit, supabase_flutter, firebase_messaging) | Flutter 3.2+ |

## Pipeline

```
Facebook → Apify scraper (preferred) or RSS fallback → RssItem{sourcePostId, caption, imageUrls[]}
  → processed_posts dedup → post_filter.ts (skip holiday/PR/billing)
  → Gemini parser.ts (image+caption OR caption-only)
  → validateOutages() + normalize.ts (districts/areas/exclusions)
  → poll_iseco_feed insertOutages(): active→INSERT (skip if isOutagePassed); cancelled→match active row (outage_match.ts) & UPDATE, else INSERT standalone
  → send_outage_notification → FCM topic iseco_outages (HTTP v1)
  → Flutter app
```

Cron runs `poll_iseco_feed` ~every 2h. Gemini calls are capped per run (`MAX_GEMINI_CALLS_PER_RUN`, default 8); backlog drains across cron ticks.

## Outage categories

Four ISECO post types. Parser handles three; the fourth is filtered before Gemini.
- **scheduled** (`status: active`) — red "Notice of Power Interruption" poster; `start_time`+`end_time` required.
- **emergency** (`status: active`) — caption text ("As of {time}", "Power Advisory"); `start_time` only, `end_time: null`.
- **cancelled** (`status: cancelled`) — CANCELLED stamp or caption; parser still extracts original date/time/areas so `outage_match.ts` can flip the matching active row.
- **non-outage** — holiday/billing/PR posts, skipped by `post_filter.ts`, recorded in `processed_posts` with `status: skipped`.

## Commands

```bash
# Node parser harness (cd scripts)
npm install
npm run test:unit                          # dedup + rss + normalize tests, no API key
npm test                                    # integration cases (needs GEMINI_API_KEY in repo .env)
node parse-outage.js ../samples/ngcp-district-outage.png --caption "..."   # parse one image

# Deno Edge Function unit tests (from repo root)
deno test supabase/functions/_shared/post_filter_test.ts
deno test supabase/functions/_shared/outage_match_test.ts
deno test supabase/functions/_shared/outage_time_test.ts
deno test supabase/functions/_shared/filter_test.ts
deno test supabase/functions/_shared/apify_test.ts

# Flutter (cd iseco_notifier)
flutter pub get
flutter test                                # or: flutter test test/outage_test.dart
flutter run
flutter build apk --release

# Supabase deploy
supabase db push
supabase functions deploy poll_iseco_feed
supabase functions deploy send_outage_notification
supabase functions invoke poll_iseco_feed   # response: outages_inserted, outages_cancelled, gemini_calls, ...
```

## Critical invariants

- **Parser logic is mirrored in three files — keep them in sync:** `supabase/functions/_shared/parser.ts` (Deno, production) ↔ `scripts/parser-prompt.js` + `scripts/gemini-parser.js` (Node, local validation). Changing the prompt, the `ParsedOutage` shape, `buildDedupKey()`, or `validateOutages()` in one means updating the others and bumping `PARSER_VERSION` (currently `2.4.0-cancelled`). District/area normalization is likewise mirrored: `_shared/normalize.ts` + `_shared/ilocos-sur-districts.ts` ↔ `scripts/normalize-outage.js` + `scripts/ilocos-sur-districts.js`, and again in Flutter (`lib/data/ilocos_sur_districts.dart`).
- **Do not mark rate-limited posts as processed.** On Gemini 429/503 the poller leaves the post unprocessed so the next cron run retries it. Marking it `processed` silently drops outages.
- **Never put the service role key in the Flutter app.** The app uses `SUPABASE_ANON_KEY` only (bundled via `.env` asset). The service role key belongs to Edge Functions only.
- **RLS:** anon reads are restricted to `outage_date >= CURRENT_DATE`; only the service role writes. New tables/columns need matching policies.
- **`dedup_key`** (built in `parser.ts`) is the UNIQUE constraint that makes inserts idempotent — duplicate parses hit it and are skipped. Carousel posts produce one row per image (`image_index`).
- **Time logic is Asia/Manila.** `isOutagePassed()` in `outage_time.ts` decides whether an active outage is stored/notified; cancellation pushes are sent even if the original window has passed.

## Where things live

- Feed pull + orchestration: `supabase/functions/poll_iseco_feed/index.ts`
- Push delivery (FCM v1, optional per-device barangay filter via `USE_BARANGAY_FILTER`): `supabase/functions/send_outage_notification/index.ts`
- Feed adapters: `_shared/apify.ts`, `_shared/rss.ts`
- Cancellation matching: `_shared/outage_match.ts`; user-notification matching: `_shared/filter.ts` (`shouldNotifyUser()`)
- Flutter: model `lib/models/outage.dart`, UI `lib/screens/outages_screen.dart`, data `lib/services/supabase_service.dart`, state `lib/cubit/outages_cubit.dart`, push `lib/services/fcm_service.dart`
- Migrations: `supabase/migrations/` (initial → district → partial_areas → emergency → cancelled)

## Environment

Secrets live in repo-root `.env` (see `.env.example`) for scripts, and as `supabase secrets set` for Edge Functions. The Flutter app has its own `iseco_notifier/.env` (only `SUPABASE_URL` + `SUPABASE_ANON_KEY`). Feed source: set `APIFY_TOKEN` (preferred, takes priority) or `ISECO_RSS_FEED_URL` (fallback). Gemini default model is `gemini-2.5-flash-lite`.
