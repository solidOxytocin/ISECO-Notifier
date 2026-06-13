# ISECO Outage Notifier – Cursor Prompt (Copy-Paste Ready)

Use this prompt in Cursor or Claude Code. Start with Phase 1, then move to Phase 2, etc. based on your Saturday schedule.

---

## PHASE 1: Image Parsing Test Script (Saturday 1)

### Your Request to Cursor:

```
I'm building a Flutter mobile app that notifies me of power outages from ISECO (Ilocos Sur Electric Cooperative). 

PROBLEM: ISECO only posts outage info on Facebook. When they post, they include an image with the outage details (date, time, affected areas) and sometimes a text caption.

SOLUTION ARCHITECTURE:
- Supabase Edge Function polls rss.app (RSS feed of ISECO FB page) every 6 hours
- Downloads the image attachment
- Sends both image + caption to Claude API to extract structured data
- Stores in PostgreSQL, triggers FCM notification to Flutter app

MY GOAL: Validate that Claude API can correctly parse ISECO outage images into structured JSON before I build the rest.

TASK 1: Write a Node.js test script that:
1. Takes an ISECO outage image (I'll provide a sample)
2. Takes the caption text (if any)
3. Calls Claude API with both inputs
4. Returns JSON: { date: string, start_time: string, end_time: string, areas: string[] }

TASK 2: Provide the Claude system prompt I should use for parsing

TASK 3: Show how to handle errors (invalid image, Claude timeout, malformed JSON)

TASK 4: Give me a checklist to verify:
- [ ] My Anthropic API key is valid
- [ ] Node.js and npm are set up
- [ ] I can run the script locally

CONSTRAINTS:
- I want to test with REAL ISECO posts, not fake data
- I need to understand what the prompt is doing (not just copy-paste)
- I want to catch parsing edge cases early

PROVIDE:
- Full working code (ready to run)
- Line-by-line explanation of the Claude prompt
- 2-3 test cases with expected outputs
- Debugging tips if it fails
```

### What Cursor Will Generate:
- Working Node.js script
- Claude system prompt optimized for image + text parsing
- Error handling code
- Setup checklist

### Your Next Step:
- Run the script with the ISECO image you provided
- Test with 2-3 other ISECO posts
- If parsing is wrong, iterate the Claude prompt with Cursor
- Once good: move to Phase 2

---

## PHASE 2: Supabase Setup + Poller (Saturday 2)

### Your Request to Cursor:

```
I've validated that Claude API can parse ISECO outage images correctly. Now I need to build the backend that:
1. Runs every 6 hours
2. Fetches new posts from rss.app RSS feed
3. Downloads images, calls Claude for parsing
4. Stores in PostgreSQL
5. Prevents duplicate posts
6. Triggers FCM notifications (we'll wire FCM in next phase)

SETUP CONTEXT:
- Supabase project created (I have the URL and anon key)
- Supabase CLI installed locally
- I'm using Deno for Edge Functions (Supabase default)
- PostgreSQL will be the database

TASK 1: Generate the Supabase SQL schema for the outages table
- Columns: id (uuid), created_at, post_date (date), start_time (time), end_time (time), areas (jsonb array), raw_post_id (string, unique)
- Always filter queries: WHERE post_date >= TODAY()
- Include indexes for performance

TASK 2: Create the Supabase Edge Function: functions/poll_iseco_feed
- Triggered by cron: every 6 hours (show me the cron syntax)
- Flow:
  a) Fetch rss.app RSS feed
  b) Parse feed, get new posts (compare with raw_post_id in DB)
  c) For each new post: download image, call Claude API (reuse Phase 1 prompt)
  d) Insert to outages table
  e) Log any errors

TASK 3: Deduplication strategy
- Option A: Store raw_post_id from RSS, check before insert
- Option B: Hash the post content
- Which is better? Why?
- Provide the code for your recommendation

TASK 4: Error handling
- What if Claude API times out? (Retry logic)
- What if RSS feed is down? (Skip and try next cycle)
- What if image URL is broken? (Log and skip)
- What if JSON parsing fails? (Validate before insert)

TASK 5: Local testing
- How do I test this Edge Function locally before deploying?
- How do I view logs?
- How do I trigger it manually for testing?

PROVIDE:
- Full Edge Function code (ready to deploy)
- SQL schema (ready to paste in Supabase console)
- Cron configuration
- Local testing instructions
- Debugging checklist
```

### What Cursor Will Generate:
- PostgreSQL schema
- Deno Edge Function with error handling
- Deduplication logic
- Local testing workflow

### Your Next Step:
- Run `supabase start` locally
- Deploy the schema to your local Supabase
- Test the Edge Function with a manual trigger
- Check logs for errors
- Once working: move to Phase 3

---

## PHASE 3: Flutter App + FCM Integration (Saturday 3)

### Your Request to Cursor:

```
Backend is working (polls, parses, stores). Now I need the mobile app:
- Flutter app that displays upcoming outages
- Receives push notifications when new outage is detected
- Works on Android (tested on emulator or real device)

SETUP CONTEXT:
- Flutter SDK installed (flutter doctor passes)
- Android Studio or emulator ready
- Firebase project created, google-services.json in android/app/
- Supabase anon key ready

TASK 1: Flutter project scaffold
- New Flutter project: iseco_notifier
- Add packages: supabase_flutter (for DB queries), firebase_messaging (for FCM)
- Set up main.dart with:
  a) Supabase initialization
  b) Firebase initialization
  c) FCM token registration on app startup

TASK 2: State management (Cubit recommended)
- Create Cubit for outages: OutagesCubit
- State: Loading, Loaded([outages]), Empty, Error
- Actions: fetchOutages(), subscribeToUpdates()

TASK 3: Build the Outages List Screen
- Query Supabase: SELECT * FROM outages WHERE post_date >= today() ORDER BY post_date ASC
- Display as cards:
  - Date (formatted nicely)
  - Time range (start_time - end_time)
  - Areas (comma-separated or as chips)
  - Empty state: "No outages scheduled"

TASK 4: Firebase FCM integration
- Background message handler: show notification when app is closed
- Foreground handler: show notification in-app
- When user taps notification: navigate to outages screen
- Store FCM token in Supabase devices table (for backend to send to)

TASK 5: Testing checklist
- [ ] Run on emulator: flutter run
- [ ] Check Supabase queries work
- [ ] Check FCM token is registered
- [ ] Test receiving a notification (how do I trigger one?)
- [ ] Test on real device (adb setup)

PROVIDE:
- Complete main.dart with initialization
- OutagesCubit code
- Outages list screen widget
- FCM setup code
- Firebase configuration checklist
- Testing instructions

CONSTRAINTS:
- I want to understand the code, not just copy-paste
- I want to know what can break (Firebase setup is known to be fragile)
- I want clear error messages if something is wrong
```

### What Cursor Will Generate:
- Scaffold Flutter project
- Cubit state management
- Outages list UI
- FCM setup with error handling
- Testing guide

### Your Next Step:
- Run `flutter pub get`
- Deploy to emulator: `flutter run`
- Test Supabase queries in the app
- Fix Firebase setup issues (google-services.json, package name)
- Send a test FCM message from Supabase
- Once working: move to Phase 4

---

## PHASE 4: Production Ready + Deploy (Saturday 4)

### Your Request to Cursor:

```
App is working locally on emulator. Now production-ready:
- Deploy Edge Function to production Supabase
- Deploy Flutter app to real device (or keep on emulator)
- Verify full end-to-end flow works with real ISECO data
- Create documentation

TASK 1: Final testing on real device
- Build APK: flutter build apk --release
- Install on real Android phone
- Verify all features work end-to-end

TASK 2: Supabase production deployment
- Deploy Edge Function: supabase functions deploy poll_iseco_feed
- Verify cron is running (check Supabase dashboard)
- Monitor logs for errors

TASK 3: Environment setup
- Create .env file with keys (local only, never commit)
- Create .env.example as template (no real keys)
- Ensure .gitignore includes:
  - .env
  - google-services.json
  - build/
  - .flutter-plugins

TASK 4: GitHub setup
- Initialize git repo
- Create README with:
  - Problem statement
  - Solution overview (diagram)
  - Tech stack and why
  - Setup instructions
  - How to use
  - Future features
- Add architecture diagram (ASCII or SVG)

TASK 5: Verify the FULL flow (this is your interview story)
- A new ISECO post is published to Facebook
- RSS feed updates (within 30 min)
- Your Edge Function polls and detects it
- Claude parses the image
- Data is inserted to Supabase
- FCM notification fires to your phone
- Your Flutter app shows the outage
- You can explain each step

PROVIDE:
- Production deployment checklist
- README template
- .env.example template
- Architecture diagram (ASCII)
- End-to-end testing procedure
- Troubleshooting guide

SUCCESS CRITERIA:
- App is running on a real Android device
- You've received at least 1 notification from a real ISECO post
- Code is on GitHub with good documentation
- You can demo the full flow in 2 minutes
```

### What Cursor Will Generate:
- Deployment checklist
- README template
- .env examples
- Architecture documentation
- Troubleshooting tips

### Your Next Step:
- Deploy to production
- Wait for next ISECO outage post (or create a fake one in RSS for testing)
- Verify notification fires
- Push to GitHub
- **Start interviewing with this portfolio piece**

---

## INTERVIEW PREP (Parallel to Saturday work, weekday evenings)

### Your Request to Cursor (use after Phase 1):

```
I'm preparing for backend/fullstack interviews while building this ISECO app.

I need interview Q&A for these topics (specific to my implementation):

1. SYSTEM DESIGN: "Design a notification system for scheduled outages"
   - Draw architecture (poller → DB → trigger → notifier → client)
   - Explain deduplication
   - What happens if the poller crashes?
   - How do you scale to 100k users?

2. YOUR IMPLEMENTATION: Image parsing with Claude API
   - Why send both image AND caption to Claude?
   - How do you handle if Claude returns invalid JSON?
   - What if the image format changes (different layout)?
   - Edge cases you found?

3. YOUR IMPLEMENTATION: Firebase FCM
   - How does the token lifecycle work?
   - What if a token becomes invalid?
   - How do you prevent duplicate notifications?

4. YOUR IMPLEMENTATION: Database design
   - Why use raw_post_id for dedup?
   - How do you query only future outages?
   - What if areas are inconsistent (spelling, language)?

5. EDGE CASES & FAILURES
   - What if Claude API times out? (retry strategy)
   - What if Supabase Edge Function times out?
   - What if RSS feed is down for 24 hours?
   - What if user is offline when notification arrives?

FOR EACH Q&A:
- Expected answer (2-3 sentences)
- Follow-up question they might ask
- Code snippet if relevant
- How to explain you "shipped fast" without sounding unprepared

ALSO PROVIDE:
- NeetCode 150 Java study plan (1 problem per weekday)
- System design reading: Notification systems, database triggers
- LeetCode problem types to focus on: JSON parsing, caching, event-driven design
```

### What Cursor Will Generate:
- Interview Q&A with expected answers
- Follow-up questions
- Code snippets for technical questions
- Study plan for NeetCode
- System design reading list

### Your Study Workflow:
- **Weekday evenings:** 1 NeetCode 150 problem (30 min)
- **Weekday evenings:** 1 interview Q&A deep dive (30 min)
- **Saturday morning before coding:** Review 1-2 interview topics
- **Friday evening:** Practice the "Tell me about your project" pitch

---

## How to Use This Document

**Start Here:**
1. Pick Phase 1 prompt above
2. Copy into Cursor
3. Tell Cursor: "I'm ready for Phase 1. Here's my context: [paste relevant parts]"
4. Let Cursor generate code
5. Test locally
6. Move to next phase

**Decision Points:**
When Cursor asks you a question, think about:
- What's the simplest choice that works? (Pick that)
- What's the most scalable choice? (For Phase 4, pick that)
- Can I test this locally first? (Yes, always)

**Iteration:**
If something breaks:
1. Copy the error into Cursor
2. Ask: "Why is this failing and how do I fix it?"
3. Cursor will debug with you
4. Test again

**Interview Prep:**
Don't memorize answers. Understand concepts:
- Why did I make this choice?
- What would break if I removed this?
- How would you scale this?

---

## Actual Command to Start Now

Open Cursor and paste this:

```
I'm building ISECO Outage Notifier, a Flutter app that notifies me of power outages from ISECO (Ilocos Sur Electric Cooperative). They only publish on Facebook, so I'm automating notifications.

ARCHITECTURE:
- Supabase Edge Function polls rss.app (ISECO FB RSS) every 6 hours
- Downloads images, sends to Claude API for OCR/parsing
- Stores structured data (date, time, areas) in PostgreSQL
- Triggers FCM notification to Flutter app

I'm starting with Phase 1: Image parsing validation.

PROVIDE:
1. Node.js test script that calls Claude API with ISECO image + caption
2. Claude system prompt optimized for parsing outage notices
3. Error handling code
4. Setup checklist

I want to run this locally first before building the backend.
```

That's it. Cursor will start generating Phase 1 code.

---

## Success Metrics

By end of Saturday 4:
- ✅ App runs on your phone
- ✅ You've received notification from ISECO
- ✅ Code on GitHub with README
- ✅ Can explain full flow in 2 minutes

By end of interview prep (2 weeks):
- ✅ Comfortable explaining system design
- ✅ Ready to code a REST API in an interview
- ✅ NeetCode 150 through problem 30+
- ✅ Can demo your app live

Then: Start interviewing.

