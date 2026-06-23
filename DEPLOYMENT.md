# Deployment checklist

## Supabase production

- [ ] Create project in `ap-southeast-1` (Singapore) for PH latency
- [ ] Run all migrations: `supabase db push`
  - Initial schema, district field, partial_areas, emergency_outages, cancelled_outages
- [ ] Set secrets (see [`.env.example`](.env.example))
- [ ] Deploy `poll_iseco_feed` and `send_outage_notification`
- [ ] Schedule cron every 2 hours (see [README.md](README.md))
- [ ] Invoke poller manually and verify response:

```bash
supabase functions invoke poll_iseco_feed
```

Expected JSON fields: `source`, `outages_inserted`, `outages_cancelled`, `skipped_posts`, `gemini_calls`.

- [ ] Verify `outages` table has expected columns: `outage_type`, `status`, `partial_areas`, `cancelled_at`

## Firebase

- [ ] Create Firebase project linked to Android app
- [ ] Download `google-services.json` → `iseco_notifier/android/app/`
- [ ] Enable Cloud Messaging; generate service-account key → set `FIREBASE_SERVICE_ACCOUNT` (full JSON, single line)
- [ ] Test topic message to `iseco_outages`
- [ ] Test cancellation payload:

```bash
curl -X POST "https://YOUR_PROJECT.supabase.co/functions/v1/send_outage_notification" \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"status":"cancelled","outage_type":"scheduled","outage_date":"2026-06-03","start_time":"05:30","end_time":"13:30","district":"1st","areas":[],"exclusions":["Puro, Caoayan"]}'
```

## Flutter release build

```bash
cd iseco_notifier
flutter build apk --release
# Output: build/app/outputs/flutter-apk/app-release.apk
```

- [ ] Package name matches Firebase (see `iseco_notifier/SETUP.md`)
- [ ] `.env` bundled via assets (anon key only — never service role key)
- [ ] Disclaimer screen shown on first launch
- [ ] Verify UI: scheduled cards, emergency badge, cancelled strikethrough

## Feed source (Apify — preferred)

- [ ] Create an [Apify](https://console.apify.com/) account and copy an API token
- [ ] Set `APIFY_TOKEN`, `ISECO_FB_PAGE_URL`, and optionally `ISECO_FETCH_WINDOW` (default `14 days`)
- [ ] Run `supabase functions invoke poll_iseco_feed` and confirm `"source": "apify"`
- [ ] Verify carousel posts return multiple `imageUrls` (`processed_posts.image_count`)
- [ ] Confirm non-outage posts land in `processed_posts` with `status: skipped`
- [ ] (Optional) tune `APIFY_RESULTS_LIMIT`, `MAX_GEMINI_CALLS_PER_RUN`

### Fallback: rss.app / FetchRSS

- [ ] Only used when `APIFY_TOKEN` is empty
- [ ] Create feed for [ISECO Official Facebook](https://www.facebook.com/ISECO.Official)
- [ ] Verify feed includes image enclosures for carousel posts
- [ ] Copy feed URL to `ISECO_RSS_FEED_URL`

## Parser & cancellation smoke test

Before go-live, validate locally (see [README.md](README.md)):

```bash
cd scripts
node parse-outage.js ../samples/cancelled-june3.png --caption "Scheduled Power Interruption ... is cancelled."
# Expect status: "cancelled" in JSON output
```

Optional DB smoke test:

1. Insert an active scheduled row for a future date (SQL Editor)
2. Delete matching post from `processed_posts` if already scraped
3. Re-run poller or wait for cron
4. Confirm row `status` → `cancelled` and `cancelled_at` is set

## Monitoring

- [ ] Check `parse_failures` weekly
- [ ] Check `processed_posts` where `status = skipped` — confirm no real outages filtered wrongly
- [ ] Alert if no new `processed_posts` in 7 days (ISECO may have changed feed format)
- [ ] Review Gemini API usage in Google AI Studio
- [ ] Watch poller `stopped_early` / `stop_reason` for rate-limit backlogs

## Public app requirements

- [ ] Disclaimer visible before use
- [ ] Link to official ISECO Facebook in app store listing
- [ ] Privacy policy (collects FCM token + optional barangay list; no personal accounts in MVP)
