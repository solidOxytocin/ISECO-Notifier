# Flutter app setup

Flutter SDK is required. If platform folders (`android/`, `ios/`) are incomplete, run:

```bash
cd iseco_notifier
flutter create . --org com.iseco --project-name iseco_notifier
```

Then:

1. Copy `.env.example` to `.env` with Supabase URL and anon key
2. Add `google-services.json` from Firebase to `android/app/` (see `google-services.json.example`)
3. Apply Firebase Gradle plugin per [FlutterFire docs](https://firebase.google.com/docs/flutter/setup)
4. `flutter pub get && flutter run`

## Firebase Android checklist

- Package name: `com.iseco.iseco_notifier`
- Enable Cloud Messaging
- Subscribe to topic `iseco_outages` happens automatically on app start
