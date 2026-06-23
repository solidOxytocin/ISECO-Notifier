# ISECO Notifier — AI context

**Purpose:** Single reference for AI assistants working on this repo. Covers architecture, outage types, data model, pipeline behavior, key files, and how to test.

**Human docs:** [README.md](../README.md) (setup), [DEPLOYMENT.md](../DEPLOYMENT.md) (production), [TODO.md](../TODO.md) (roadmap).

**Parser version:** `2.4.0-cancelled` (`supabase/functions/_shared/parser.ts`, `scripts/gemini-parser.js`)

---

## What this project does

Polls the [ISECO Facebook page](https://www.facebook.com/ISECO.Official), extracts power outage information with Gemini vision/NLP, stores structured rows in Supabase PostgreSQL, pushes FCM notifications, and displays them in a Flutter app.

Unofficial — not affiliated with ISECO.

---

## Pipeline (end to end)

```
Facebook post
    ↓
Apify scraper (preferred) or RSS fallback  →  RssItem { sourcePostId, caption, imageUrls[] }
    ↓
processed_posts dedup (skip already-seen post IDs)
    ↓
post_filter.ts — skip holiday/PR/billing posts by caption
    ↓
Gemini (parser.ts)
  • image + caption  → parseOutageFromImage()
  • caption only     → parseOutageFromCaption()  (no images)
    ↓
validateOutages() + normalize.ts (districts, areas, partial_areas, exclusions)
    ↓
poll_iseco_feed insertOutages()
  • status active     → INSERT (skip if isOutagePassed)
  • status cancelled  → MATCH active row (outage_match.ts) → UPDATE status
                        OR INSERT standalone cancelled row
    ↓
send_outage_notification → FCM topic iseco_outages (HTTP v1)
    ↓
Flutter app (Supabase read + local FCM refresh)
```

**Cron:** `poll_iseco_feed` every ~2 hours. **Rate limits:** `MAX_GEMINI_CALLS_PER_RUN` (default 8); 429/503 leave post unprocessed for next run.

---

## ISECO post categories

### 1. Scheduled power interruption (`outage_type: scheduled`, `status: active`)

**Source:** Red poster — header **“NOTICE OF POWER INTERRUPTION”**. Three columns: Date and Time | Areas Affected | Purpose/s.

**Fields:** `start_time`, `end_time` (both required), `purpose` from Purpose/s column.

**Examples:** NGCP district-wide poster, Vigan week carousel, barangay-specific schedules.

**UI:** Bolt icon, time range `8:00 AM – 5:00 PM`.

**Push title:** `ISECO Power Interruption`

---

### 2. Emergency power outage (`outage_type: emergency`, `status: active`)

**Source:** Facebook caption text (image often unrelated — utility pole photo, etc.). Keywords: **Emergency Power Interruption**, **Power Advisory**, **As of {time}**, **Reason:**.

**Fields:** `start_time` = “as of” time; `end_time: null`. `purpose` = Reason line. “Parts of …” → `partial_areas`. Feeder/substation headers → **not** in `areas`.

**UI:** Orange **Emergency** badge, “As of {time} — ongoing”.

**Push title:** `ISECO Emergency Outage`

---

### 3. Cancelled interruption (`status: cancelled`)

**Source:**
- Poster with large **CANCELLED** stamp over a scheduled notice, **or**
- Caption: “cancelled”, “postponed”, “will not push through”, “called off”

**Parser:** Still extracts **original** `outage_date`, `start_time`, `end_time`, `district`, `areas`, `exclusions` so the cancellation can be matched.

**Backend behavior:**
1. Query active rows on same `outage_date`
2. `outageMatchesStored()` — match date, start time, district, area signatures (end_time optional on cancellation)
3. **Match found** → `UPDATE status='cancelled'`, set `cancelled_at`, `cancellation_source_post_id`
4. **No match** → `INSERT` standalone cancelled row

**UI:** Grey card, **Cancelled** badge, strikethrough time, “This power interruption has been cancelled.”

**Push title:** `ISECO Outage Cancelled` (sent even if original window passed)

**Sample captions:**
- `Scheduled Power Interruption by NGCP on June 3, 2026 … is cancelled.`
- `…the scheduled Power Interruption today was CANCELLED due to our current weather condition.`

**Sample images:** `samples/cancelled-june3.png`, `samples/cancelled-june5.png`

---

### 4. Non-outage posts (filtered, never parsed)

**Skipped by** `post_filter.ts` before Gemini (saves API cost).

| Pattern examples | Reason tag |
|------------------|--------------|
| Holiday advisory, office closed, in observance of | `holiday_advisory`, `office_closure` |
| Bill payment, ECPay | `billing_notice` |
| Celebration, GM's month, hiring | `celebration`, `pr_post`, `job_posting` |

**Rules:**
- Empty caption → **not** skipped (image may be outage poster)
- Outage caption patterns checked **first** — outage signal overrides billing keywords in same caption
- Stored in `processed_posts` with `status: skipped`

---

## Data model

### `outages`

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | PK |
| `created_at` | TIMESTAMPTZ | Insert time |
| `outage_date` | DATE | Event date |
| `start_time` | TIME | Start or “as of” |
| `end_time` | TIME, **nullable** | Null for emergency |
| `outage_type` | TEXT | `scheduled` \| `emergency` (default `scheduled`) |
| `status` | TEXT | `active` \| `cancelled` (default `active`) |
| `district` | TEXT | `1st` \| `2nd` \| null |
| `areas` | JSONB | Full-coverage locations (qualified: `Baluarte, Vigan City`) |
| `partial_areas` | JSONB | “Some parts of:” only |
| `exclusions` | JSONB | EXCEPT locations only |
| `areas_raw` | JSONB | Raw poster bullets |
| `purpose` | TEXT | Purpose/s or Reason |
| `cancelled_at` | TIMESTAMPTZ | When cancellation recorded |
| `cancellation_source_post_id` | TEXT | FB post ID of cancellation |
| `source_post_id` | TEXT | FB post ID of source |
| `image_index` | INT | Carousel index |
| `dedup_key` | TEXT UNIQUE | See below |
| `confidence` | TEXT | Parser confidence |
| `parser_version` | TEXT | e.g. `2.4.0-cancelled` |
| `raw_caption` | TEXT | RSS/Apify caption |

**RLS:** Anon read `outage_date >= CURRENT_DATE`. Service role full access.

**Migrations:** `20250612000000_initial_schema.sql` → `13000000_district` → `14000000_partial_areas` → `15000000_emergency_outages` → `16000000_cancelled_outages`

### `dedup_key` format

```
{sourcePostId}:{imageIndex}:{scheduled|emergency}:{active|cancelled}:{date}:{start}:{end|ongoing}:{d:district}:{areasHash}:p:{partialHash}:{exclHash}
```

Built by `buildDedupKey()` in `parser.ts`. Duplicate inserts hit unique constraint → skipped.

### Other tables

| Table | Role |
|-------|------|
| `processed_posts` | One row per FB post; `status`: `complete` \| `partial` \| `skipped` |
| `parse_failures` | Gemini/parse errors per image |
| `devices` | FCM tokens + optional `barangays[]` for push filtering |

---

## District & area rules (parser + normalize)

**Two districts (Ilocos Sur):**
- **1st:** Vigan City, Bantay, Cabugao, Caoayan, Magsingal, San Ildefonso, San Juan, San Vicente, Santa Catalina, Santo Domingo, Sinait
- **2nd:** Candon City, Alilem, Banayoyo, Burgos, Cervantes, Galimuyod, Gregorio del Pilar, Lidlidda, Nagbukel, Narvacan, Quirino, Salcedo, San Emilio, San Esteban, Santa, Santa Cruz, Santa Lucia, Santa Maria, Santiago, Sigay, Sugpon, Suyo, Tagudin

**Normalization (`normalize.ts`, `ilocos-sur-districts.ts`):**
- `Whole 1st District EXCEPT Puro, Caoayan` → `district: "1st"`, `exclusions: ["Puro, Caoayan"]`, `areas: []`
- `Whole Area of Vigan` → `district: null`, `areas: ["Vigan City"]`
- Barangay headers (e.g. “Barangays of VIGAN CITY”) → not in `areas`
- Always qualify barangays with municipality
- `partial_areas` only for “Some parts of:” / “Parts of …” lines

**User notification matching:** `filter.ts` → `shouldNotifyUser()` expands district to municipalities, respects exclusions and partial_areas.

---

## Key source files

| File | Responsibility |
|------|----------------|
| `supabase/functions/poll_iseco_feed/index.ts` | Feed pull, filter, parse, insert/update, FCM trigger |
| `supabase/functions/_shared/parser.ts` | Gemini prompt, `ParsedOutage`, `buildDedupKey`, validation |
| `supabase/functions/_shared/post_filter.ts` | Caption pre-filter |
| `supabase/functions/_shared/outage_match.ts` | Cancellation → active row matching |
| `supabase/functions/_shared/normalize.ts` | Post-parse area normalization |
| `supabase/functions/_shared/outage_time.ts` | `isOutagePassed()` (Asia/Manila) |
| `supabase/functions/_shared/apify.ts` | Apify Facebook scraper adapter |
| `supabase/functions/_shared/rss.ts` | RSS parser → `RssItem` |
| `supabase/functions/send_outage_notification/index.ts` | FCM v1 push |
| `scripts/parser-prompt.js` | Mirror of parser prompt for local Node scripts |
| `scripts/gemini-parser.js` | Local Gemini wrapper |
| `scripts/parse-outage.js` | CLI: parse one image |
| `iseco_notifier/lib/models/outage.dart` | `OutageType`, `OutageStatus`, area helpers |
| `iseco_notifier/lib/screens/outages_screen.dart` | Card UI per type |
| `iseco_notifier/lib/services/supabase_service.dart` | Fetch + sort (active/emergency before cancelled) |

**Keep in sync when changing parser:** `parser.ts` ↔ `parser-prompt.js` ↔ `gemini-parser.js` (validation + `PARSER_VERSION`).

---

## Environment variables

| Variable | Used by | Notes |
|----------|---------|-------|
| `GEMINI_API_KEY` | Poller, scripts | Required |
| `GEMINI_MODEL` | Optional | Default `gemini-2.5-flash-lite` |
| `MAX_GEMINI_CALLS_PER_RUN` | Poller | Default `8` |
| `APIFY_TOKEN` | Poller | Preferred feed source |
| `ISECO_FB_PAGE_URL` | Poller | Default ISECO official page |
| `ISECO_FETCH_WINDOW` | Poller | Default `14 days` |
| `ISECO_RSS_FEED_URL` | Poller | Fallback if no Apify |
| `FIREBASE_SERVICE_ACCOUNT` | send_outage_notification | Full JSON |
| `USE_BARANGAY_FILTER` | send_outage_notification | Default `false` |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Edge functions | |
| `SUPABASE_ANON_KEY` | Flutter app only | |

---

## Testing

### Unit tests (no Gemini)

```bash
# Deno (from repo root)
deno test supabase/functions/_shared/post_filter_test.ts
deno test supabase/functions/_shared/outage_match_test.ts
deno test supabase/functions/_shared/outage_time_test.ts
deno test supabase/functions/_shared/filter_test.ts

# Node
cd scripts && node test/dedup.test.js && node test/normalize.test.js

# Flutter
cd iseco_notifier && flutter test
```

### Parser integration (needs `GEMINI_API_KEY` in `.env`)

```bash
cd scripts

# Scheduled
node parse-outage.js ../samples/ngcp-district-outage.png --caption "NGCP RESCHEDULED POWER INTERRUPTION"

# Cancelled — expect status: "cancelled" in JSON
node parse-outage.js ../samples/cancelled-june3.png --caption "Scheduled Power Interruption by NGCP on June 3, 2026, affecting the whole 1st District of Ilocos Sur is cancelled."

node parse-outage.js ../samples/cancelled-june5.png --caption "ISECO Narvacan June 5, 2026 ... scheduled Power Interruption today was CANCELLED ..."

npm test   # scripts/test-cases/cases.json
```

### Backend cancellation flow

1. `supabase db push`
2. Insert active row (SQL) matching a cancellation’s date/time/areas
3. `supabase functions invoke poll_iseco_feed` (or delete from `processed_posts` to re-process a cancellation post)
4. Verify: `status = 'cancelled'`, `cancelled_at` set, poller `outages_cancelled: 1`

### Push notification smoke test

```bash
# Cancelled
curl -X POST "$SUPABASE_URL/functions/v1/send_outage_notification" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"status":"cancelled","outage_type":"scheduled","outage_date":"2026-06-03","start_time":"05:30","end_time":"13:30","district":"1st","areas":[],"exclusions":["Puro, Caoayan"]}'
```

### Flutter manual

`flutter run` → pull to refresh → verify scheduled / emergency / cancelled card styles.

---

## Parsed JSON schema (Gemini output)

```json
{
  "outages": [{
    "status": "active",
    "outage_type": "scheduled",
    "outage_date": "YYYY-MM-DD",
    "start_time": "HH:MM",
    "end_time": "HH:MM",
    "district": null,
    "areas": ["string"],
    "partial_areas": ["string"],
    "areas_raw": ["string"],
    "exclusions": ["string"],
    "purpose": "string",
    "confidence": "high"
  }]
}
```

- Emergency: `outage_type: "emergency"`, `end_time: null`
- Cancelled: `status: "cancelled"` (still include date/time/areas)
- Non-outage: `{ "outages": [] }`

---

## Common AI edit patterns

| Task | Touch |
|------|-------|
| New post type / parser rule | `parser.ts`, `parser-prompt.js`, `validateOutages`, tests |
| Skip new non-outage pattern | `post_filter.ts`, `post_filter_test.ts` |
| Cancellation matching logic | `outage_match.ts`, `outage_match_test.ts`, `poll_iseco_feed` |
| Area/district normalization | `normalize.ts`, `ilocos-sur-districts.ts`, Flutter mirror |
| Push copy | `send_outage_notification/index.ts` |
| App display | `outage.dart`, `outages_screen.dart` |
| New DB column | new migration in `supabase/migrations/` |
| Sample / regression test | `samples/`, `scripts/test-cases/cases.json` |

**Do not** embed service role keys in Flutter. **Do not** mark rate-limited posts as processed (poller leaves them for retry).

---

## Known limitations / roadmap

See [TODO.md](../TODO.md): cron verification, barangay GPS picker, multi-tab UI (calendar, countdown), app icon/splash, production deploy.

**Edge case:** Cancellation arrives before original scheduled post → standalone cancelled row; later active insert may duplicate until matched manually.

**Edge case:** Cancellation with incomplete parse (date only, no areas) → may not match existing row → standalone cancelled row inserted.
