# Deployment checklist

## Supabase production

- [x] Create project in `ap-southeast-1` (Singapore) for PH latency
- [ ] Run migration: `supabase db push`
- [ ] Set secrets (see `.env.example`)
- [ ] Deploy `poll_iseco_feed` and `send_outage_notification`
- [ ] Schedule cron every 2 hours
- [ ] Invoke poller manually and verify `outages` table

## Firebase

- [ ] Create Firebase project linked to Android app `com.iseco.iseco_notifier`
- [ ] Download `google-services.json` → `iseco_notifier/android/app/`
- [ ] Enable Cloud Messaging; generate a service-account key → set `FIREBASE_SERVICE_ACCOUNT`
- [ ] Test topic message to `iseco_outages`

## Flutter release build

```bash
cd iseco_notifier
flutter build apk --release
# Output: build/app/outputs/flutter-apk/app-release.apk
```

- [ ] Package name matches Firebase: `com.iseco.iseco_notifier`
- [ ] `.env` bundled via assets (anon key only — never service role key)
- [ ] Disclaimer screen shown on first launch

## Feed source (Apify — preferred)

- [ ] Create an [Apify](https://console.apify.com/) account and copy an API token (Settings → API tokens)
- [ ] Set `APIFY_TOKEN` and `ISECO_FB_PAGE_URL` secrets
- [ ] Run `supabase functions invoke poll_iseco_feed` and confirm `"source": "apify"` in the response
- [ ] Verify carousel posts return multiple `imageUrls` (check `processed_posts.image_count`)
- [ ] (Optional) tune `APIFY_RESULTS_LIMIT` / `APIFY_ACTOR_ID`

### Fallback: rss.app / FetchRSS

- [ ] Only used when `APIFY_TOKEN` is empty
- [ ] Create feed for [https://www.facebook.com/ISECO.Official](https://www.facebook.com/ISECO.Official)
- [ ] Verify feed includes image enclosures for carousel posts
- [ ] Copy feed URL to `ISECO_RSS_FEED_URL`

## Monitoring

- [ ] Check `parse_failures` weekly
- [ ] Alert if no new `processed_posts` in 7 days (ISECO may have changed feed format)
- [ ] Review Gemini API usage in Google AI Studio / Cloud Console

## Public app requirements

- [ ] Disclaimer visible before use
- [ ] Link to official ISECO Facebook in app store listing
- [ ] Privacy policy (collects FCM token only; no personal accounts in MVP)