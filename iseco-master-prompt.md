# ISECO Outage Notifier – Master Build Prompt

## Context & Goals

**Project:** Mobile app that notifies me of power outages from ISECO (Ilocos Sur Electric Cooperative) via push notifications. I WFH and ISECO only posts on Facebook.

**Tech Stack:** Flutter, Supabase (Edge Functions + PostgreSQL), Firebase FCM, Claude API, rss.app

**Timeline:** 4 Saturdays to MVP, then interview prep during weekdays

**Job Search Priority:** Remote/foreign company role, 100k–120k+ PHP/month. This is portfolio + interview story.

**Approach:** Vibe code it fast (Cursor + Claude Code), but deeply understand the critical path.

---

## Part 1: Prerequisites Checklist

Generate a detailed setup checklist that includes:

### 1.1 Accounts to Create
- [ ] Supabase (free tier) — which region? (Recommend: Singapore ap-southeast-1)
- [ ] Firebase Console — what exactly needs to be configured?
- [ ] Anthropic API — where do I get my API key?
- [ ] rss.app — how do I convert ISECO Facebook page to RSS?

For each, provide:
- Direct link
- Exact steps (bullet points)
- What to save/screenshot
- Common mistakes to avoid

### 1.2 Local Machine Setup
- [ ] Flutter SDK (flutter doctor must be green)
- [ ] Android Studio / VS Code + extensions
- [ ] Node.js >= 18 (for test scripts + Supabase CLI)
- [ ] Supabase CLI (`npm i -g supabase`)
- [ ] Cursor or Claude Code configured

For each tool:
- Installation command
- Verification command (how do I know it worked?)
- Common issues + fixes

### 1.3 Keys & Secrets to Collect
Create a table with columns:
| Secret Name | Where to get | Where to store | Never commit? |
|---|---|---|---|
| SUPABASE_URL | ... | ... | ... |
| SUPABASE_ANON_KEY | ... | ... | ... |
| (etc) | | | |

### 1.4 Android / Firebase Config
- [ ] google-services.json — download procedure
- [ ] Android emulator or real device setup
- [ ] `flutter devices` command to verify

---

## Part 2: Full Development Roadmap

Generate a 4-Saturday roadmap with these components:

### 2.1 Saturday 1: Phase 1 (Image Parsing Validation)
**Goal:** Validate Claude API can parse ISECO outage images correctly

**Tasks:**
1. Download a real ISECO outage image (use the one provided)
2. Create a Node.js test script that:
   - Reads the image + caption text
   - Calls Claude API with both inputs
   - Returns structured JSON: `{ date, start_time, end_time, areas[] }`
3. Test with 2–3 real ISECO posts
4. Document any parsing edge cases

**Decision Points:**
- Option A: Use local image files
- Option B: Fetch directly from rss.app RSS feed
- Recommendation: Start with local files, then iterate to RSS

**Vibe Code Level:** Medium (understand the Claude prompt, not just run it)

**Time Estimate:** 2–3 hours

**Interview Prep During This Phase:**
- Understand: Why send both image and caption to Claude? (redundancy, accuracy)
- Be ready to explain: How would you handle if Claude returns malformed JSON?

---

### 2.2 Saturday 2: Phases 2 (Supabase Setup + Polling Edge Function)

**Goal:** RSS poller → Claude parsing → Database insert

**Tasks:**
1. Create Supabase PostgreSQL table: `outages`
   - Columns: id, created_at, post_date, start_time, end_time, areas[], raw_post_id
   - Constraints: Filter always `post_date >= TODAY()`
2. Write Supabase Edge Function: `poll_iseco_feed`
   - Cron trigger: every 6 hours
   - Logic: fetch RSS → download image → call Claude → insert to DB → deduplicate
3. Deploy locally + test with Supabase CLI
4. Check logs for errors

**Decision Points:**
- Option A: Use rss.app feed directly
- Option B: Parse Facebook page with Puppeteer (harder)
- Recommendation: rss.app (simpler, no auth)

- Option A: Store raw post ID for deduplication
- Option B: Hash the post to detect duplicates
- Recommendation: raw post ID (easier to debug)

**Vibe Code Level:** High (you don't need to memorize Deno syntax, Cursor writes it)

**But Understand:**
- How the poller detects new posts (RSS comparison)
- How deduplication works (don't insert same post twice)
- Error handling (what if Claude times out? Retry logic?)

**Time Estimate:** 3–4 hours

**Interview Prep During This Phase:**
- System design: "Design a notification system that polls external data"
- Concept: Database triggers and how they work
- Failure modes: What if the Edge Function crashes?

---

### 2.3 Saturday 3: Phase 3 (Flutter App + FCM Integration)

**Goal:** Mobile app that displays outages + receives push notifications

**Tasks:**
1. Flutter project scaffold (with Cursor)
2. Add packages: `supabase_flutter`, `firebase_messaging`
3. Build outages list screen (YOU build this, not vibe code):
   - Fetch from `outages` table
   - Display as cards: date, time range, areas list
   - Empty state ("No outages scheduled")
4. Firebase FCM setup:
   - Register FCM token on app startup
   - Store token in Supabase `devices` table
   - Handle background notifications
5. Test on emulator or real device

**Decision Points:**
- Option A: Use Cubit for state management
- Option B: Use Provider
- Option C: Use Riverpod
- Recommendation: Cubit (simpler, Cursor knows it well)

**Vibe Code Level:** Medium-High (scaffold with Cursor, but own the UI screen)

**But Understand:**
- FCM token lifecycle (why register on startup?)
- How push notifications wake up the app
- JSON parsing from Supabase queries

**Time Estimate:** 3–4 hours

**Interview Prep During This Phase:**
- Flutter state management (they might ask your preference and why)
- Push notification architecture (why Firebase FCM?)
- Real device debugging (adb commands, logcat)

---

### 2.4 Saturday 4: Phase 4 (Polish + Test + Deploy)

**Goal:** Production-ready, tested, documented

**Tasks:**
1. Firebase setup debugging (google-services.json, package name matching)
2. Deploy Edge Function to Supabase prod
3. Test full flow on real device:
   - Post a test outage to RSS
   - Verify FCM notification fires
   - Verify app displays correct info
4. Create `.env.example` (never commit real keys)
5. Write README with setup instructions
6. Screenshot for portfolio

**Decision Points:**
- Option A: Deploy immediately
- Option B: Keep in staging for 1 week
- Recommendation: Deploy, but have staging for testing new features

**Vibe Code Level:** Low (mostly debugging + documentation)

**But Own:**
- Understand why Firebase setup breaks (package names, service.json)
- Be ready to explain the full end-to-end flow

**Time Estimate:** 2–3 hours

**Interview Prep During This Phase:**
- End-to-end walkthrough: "I have a real outage post, watch the notification fire"
- Deployment strategy: "How would you test this safely in prod?"

---

## Part 3: Critical Path Questions & Decision Trees

Generate decision flowcharts for:

### 3.1 "What if Claude API fails?"
Decision tree:
- Retry with exponential backoff?
- Fall back to raw OCR?
- Log and skip that post?
- (Include code examples for each)

### 3.2 "What if FCM token is invalid?"
Decision tree:
- Refresh token automatically?
- Notify user in app?
- Delete stale token from DB?

### 3.3 "What if ISECO image format changes?"
Decision tree:
- Update Claude system prompt?
- Add image validation?
- Alert me manually?

### 3.4 "Should I add barangay filter now or later?"
- Now: adds 2 hours, increases complexity
- Later: simpler MVP, add Saturday 5
- (Recommendation with tradeoffs)

---

## Part 4: Interview Prep During Weekdays

Generate interview Q&A for each topic:

### 4.1 System Design
**Q:** Design a notification system that polls external sources  
**Expected Answer:**  
- Architecture diagram (poller → DB → trigger → notifier → client)
- Failure modes (deduplication, retries, idempotency)
- Scaling (what if 100k users?)

Provide 3 follow-up questions they might ask.

### 4.2 Your Specific Implementation
**Q:** Walk me through how you detect duplicate posts  
**Expected Answer:**  
- Store raw post ID from RSS
- Before insert, check `WHERE raw_post_id = ?`
- If exists, skip; if new, insert

Provide code snippet.

**Q:** What happens if Claude times out?  
**Expected Answer:**  
- Edge Function has try/catch
- Retry up to 3 times with exponential backoff
- If all fail, log error and continue next poll cycle
- Don't block subsequent RSS posts

Provide error handling code.

### 4.3 Firebase FCM
**Q:** How does your push notification flow work?  
**Expected Answer:**  
- Device registers token on app startup
- Token stored in Supabase `devices` table
- When outage inserted, Edge Function sends to Firebase FCM
- FCM delivers to device, background handler shows notification

Diagram included.

**Q:** What if a user uninstalls the app?  
**Expected Answer:**  
- Stale token stays in DB
- Firebase silently fails on next send
- Periodically clean up invalid tokens (lazy cleanup)

### 4.4 Flutter Mobile
**Q:** How do you handle state when notification arrives while app is closed?  
**Expected Answer:**  
- Background message handler in main.dart
- Shows local notification
- When user taps, navigates to outages screen
- Fresh query from Supabase gets latest data

Code snippet included.

---

## Part 5: Fast Track Checklist

Generate a prioritized checklist for "I have only 4 Saturdays":

### Must-Do (MVP):
- [ ] Phase 1: Claude parsing works on real images
- [ ] Phase 2: Poller runs, DB populates
- [ ] Phase 3: Flutter app lists outages
- [ ] Phase 3: FCM notifications fire
- [ ] Saturday 4: Full end-to-end test on device

### Nice-to-Have (Skip if running out of time):
- [ ] Barangay filter
- [ ] WFH guard (work hours alert)
- [ ] Calendar view
- [ ] Polished UI/UX

### Interview Prep (Do in parallel, weeknights):
- [ ] NeetCode 150 (1 problem/day Java)
- [ ] System design: Notification systems
- [ ] Firebase/FCM architecture
- [ ] Database design patterns
- [ ] Error handling & retries

---

## Part 6: Code Templates to Generate

For each phase, provide starter code:

### Phase 1: Node.js Test Script
```javascript
// Template for Claude API call with image + caption
```

### Phase 2: Supabase Edge Function
```typescript
// Template for poll_iseco_feed function
// Template for FCM trigger function
```

### Phase 3: Flutter App
```dart
// Template for main.dart with FCM setup
// Template for outages list screen
// Template for state management (Cubit)
```

---

## Part 7: Common Pitfalls & How to Avoid

Generate warnings for:
1. **Firebase google-services.json in wrong folder** → How to fix
2. **Package name mismatch** → How to verify
3. **Supabase Edge Function times out** → Solutions (increase timeout, async tasks)
4. **FCM token not registering** → Debugging steps
5. **Duplicate notifications** → Deduplication logic
6. **Image parsing returns invalid JSON** → Validation code

---

## Part 8: Portfolio Documentation

Generate templates for:

### README.md
- Problem statement
- Solution architecture (diagram)
- Tech stack with why each choice
- Setup instructions
- How to use
- Future features

### GitHub Discussion Points
- Most interesting technical challenge? (Image parsing edge cases)
- What would you do differently? (Add X, remove Y, use Z)
- How did you ship so fast? (Vibe code + focus)

---

## Execution Workflow

When ready to start each Saturday:

1. **Copy the Phase-specific prompt** from this document
2. **Paste into Cursor**
3. **Follow the decision trees**
4. **Vibe code the templates**
5. **Test locally first**
6. **Deploy**
7. **Document what you learned for interviews**

---

## Success Criteria

You're done when:
- ✅ App runs on your phone
- ✅ You've received at least 1 real notification from ISECO
- ✅ You can explain the full flow in 2 minutes
- ✅ You can answer all interview Q&A
- ✅ Code is on GitHub with good README
- ✅ You're using it daily for WFH protection

Then: Start interviewing while building features 2–4.

