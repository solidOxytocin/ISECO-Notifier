# Flutter app setup

## Prerequisites

- [Flutter SDK](https://docs.flutter.dev/get-started/install) 3.2+
- Android Studio or VS Code with Flutter extension
- Supabase project (see root [README.md](../README.md))
- Firebase project with Cloud Messaging enabled

## First-time project setup

If platform folders are incomplete:

```bash
cd iseco_notifier
flutter create . --org com.iseco --project-name iseco_notifier
```

## Configuration

### 1. Supabase

```bash
cp .env.example .env
```

Edit `.env`:

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
```

Use the **anon** key only — never embed the service role key in the app.

### 2. Firebase (Android)

1. Create a Firebase project (or use existing)
2. Add an Android app — package name must match `android/app/build.gradle` (`applicationId`)
3. Download `google-services.json` → `android/app/`
4. Apply FlutterFire Gradle setup: [FlutterFire docs](https://firebase.google.com/docs/flutter/setup)

### 3. Run

```bash
flutter pub get
flutter run
```

On first launch you should see the unofficial-app disclaimer, then the outages list (empty until Supabase has rows).

## Firebase checklist

- [ ] Cloud Messaging enabled
- [ ] `google-services.json` in `android/app/`
- [ ] App subscribes to FCM topic `iseco_outages` on start (`fcm_service.dart`)
- [ ] Push works with a test call to `send_outage_notification` (see root README)

## Optional: barangay watch list

1. Open **Settings** (gear icon)
2. Select barangays/municipalities you care about
3. Matching outages show **Affects you** or **Some parts** on the card

Server-side push filtering requires `USE_BARANGAY_FILTER=true` on the Supabase edge function (device tokens + barangays stored in `devices` table).

## Verifying outage types in the UI

After backend has data (or seed rows in Supabase):

| Type | What to look for |
|------|------------------|
| Scheduled | Bolt icon, `8:00 AM – 5:00 PM` style range |
| Emergency | Orange **Emergency** chip, “As of … — ongoing” |
| Cancelled | **Cancelled** chip, strikethrough, grey card |

Pull down on the list to refresh from Supabase.

## Tests

```bash
flutter test
```

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Empty list | Confirm Supabase RLS, future `outage_date`, correct URL/anon key |
| No push | Check `google-services.json`, Firebase topic, device online |
| Build fails on Firebase | Re-run FlutterFire configure; verify Gradle plugin |
| Package name mismatch | Align Firebase app ID with `applicationId` in `build.gradle` |

## Release build

```bash
flutter build apk --release
```

See [`DEPLOYMENT.md`](../DEPLOYMENT.md) for production checklist.
