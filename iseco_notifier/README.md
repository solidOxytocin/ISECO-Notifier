# ISECO Notifier (Flutter app)

Unofficial Android/iOS client for [ISECO Notifier](../README.md). Shows upcoming power interruptions from Supabase and receives FCM push alerts on topic `iseco_outages`.

## What it displays

| Outage kind | UI |
|-------------|-----|
| **Scheduled** | Red bolt icon, date + time range, area chips |
| **Emergency** | Orange “Emergency” badge, “As of {time} — ongoing”, reason line |
| **Cancelled** | Grey card, “Cancelled” badge, strikethrough time, cancellation note |

Active and emergency outages sort above cancelled ones. Optional barangay filter highlights **Affects you** / **Some parts** chips.

## Setup

See [`SETUP.md`](SETUP.md) for Firebase, `.env`, and first run.

```bash
cp .env.example .env   # SUPABASE_URL, SUPABASE_ANON_KEY
flutter pub get
flutter run
```

## Project layout

| Path | Purpose |
|------|---------|
| `lib/main.dart` | App entry, FCM, disclaimer |
| `lib/models/outage.dart` | `OutageType`, `OutageStatus`, area matching helpers |
| `lib/screens/outages_screen.dart` | Outage list + cards |
| `lib/screens/settings_screen.dart` | Barangay watch list |
| `lib/services/supabase_service.dart` | Fetch outages from Supabase |
| `lib/services/fcm_service.dart` | Topic subscription + device registration |
| `lib/data/ilocos_sur_districts.dart` | District expansion (mirrors backend) |
| `test/outage_test.dart` | District / partial / emergency / cancelled tests |

## Data from Supabase

Reads `outages` where `outage_date >= today` (RLS). Expects columns:

- `outage_type` — `scheduled` \| `emergency`
- `status` — `active` \| `cancelled`
- `start_time`, `end_time` (nullable for emergency)
- `district`, `areas`, `partial_areas`, `exclusions`, `purpose`
- `cancelled_at` (optional, for cancelled rows)

## Tests

```bash
flutter test
```

## Release

```bash
flutter build apk --release
```

Output: `build/app/outputs/flutter-apk/app-release.apk`

See root [`DEPLOYMENT.md`](../DEPLOYMENT.md) for Firebase and store checklist.
