# Kerbside

Urban refuse reporting and management. React 18 + TypeScript + Vite, Supabase (Auth, Postgres, Storage, Realtime), Leaflet maps.

## Run it
1. Create a free project at supabase.com.
2. In the SQL Editor, run `supabase/schema.sql` (tables, security rules, photo bucket, realtime).
   - For an existing database, run `supabase/update-3.sql` if not already applied, then `supabase/update-4.sql`.
3. Copy `.env.example` to `.env` and paste your project URL and anon key (Project Settings > API).
4. `npm install` then `npm run dev` and open the address it prints.

## Roles & Permissions
Everyone who signs up is a **citizen** (resident).
- **Staff creation:** Admins can create collector accounts directly from the Admin tab without touching the database, or assign roles via the in-app User Roles manager.
- **Role changes:** Strictly restricted to administrators.

## Password recovery
On the sign-in page, choose **Forgot password?** and enter your account email. Follow the email link, enter and confirm a new password (at least 6 characters), then continue to the dashboard.

In Supabase **Authentication → URL Configuration**, set **Site URL** to your app's production URL and add these **Redirect URLs**:

- `http://localhost:5173/reset-password` (use the actual port printed by Vite)
- `https://your-app-domain/reset-password`

Keep the Supabase **Reset Password** email template's confirmation link (`{{ .ConfirmationURL }}`), which verifies the link before returning to the app. Expired or invalid links require a new reset email. Supabase's email rate limits and password policy still apply. See the [Supabase password recovery documentation](https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail).

## Features

The signed-in workspace uses role-specific navigation. Residents can open **My neighborhood**, **Report an issue**, **Community**, and **Saved reports**. Collectors have **My route**, **Completed jobs**, and **Saved cleanups**. Administrators have **Overview**, **All reports**, **City map**, **Hotspots**, and **Team & access**. On mobile, open the navigation menu at the top left. Dashboard views can be bookmarked through the `view` query parameter.

### 1. Categories, Priorities & Targets
Six report categories with base priorities and resolution target windows:
- **Hazardous or medical waste:** High priority, 4 hours target
- **Dead animal:** High priority, 6 hours target
- **Overflowing bin:** Medium priority, 24 hours target
- **Illegal dumping:** Medium priority, 48 hours target
- **Missed pickup:** Low priority, 24 hours target
- **Other:** Medium priority (provisional, flagged "Awaiting admin review"), 24 hours target

Every report displays a priority badge and resolution countdown ("Target: clear within N h" based on `due_at`).

### 2. Resident Levels, Points & Community Voting
- **Resident Levels:**
  - *Newcomer* (0–29 points, vote weight 1)
  - *Neighbour* (30–99 points, vote weight 2)
  - *Green Guardian* (100–249 points, vote weight 3)
  - *Kerbside Champion* (250+ points, vote weight 4)
  *(Level points thresholds can be changed in `src/lib/levels.ts` and `vote_weight()` in `supabase/update-3.sql` / `supabase/schema.sql`).*
- **Points rules:**
  - `+2` points for submitting a new report.
  - `+10` points to the reporter when a crew clears the issue.
  - `-5` points (floor 0) if an admin marks a report as fake.
  - Supporting another report awards no points.
- **Priority Elevation:**
  - Priority elevates by +1 tier when voters $\ge$ 2 and support $\ge$ 3.
  - Priority elevates by +2 tiers when voters $\ge$ 2 and support $\ge$ 5 (capped at High).
  *(Priority thresholds 3 and 5 are configured as constants `c_threshold_1` and `c_threshold_2` at the top of `compute_priority()` in `supabase/update-3.sql` / `supabase/schema.sql`).*

### 3. Community Tab (Residents Only)
- Displays open reports within 2 km of the resident's GPS or pinned location with a 2 km coverage circle.
- Residents can upvote nearby reports with their weighted vote (`+W`).
- 30-meter duplicate detection on submission prompts residents to support the existing report instead of duplicating it.
- Auto-refreshes every 15 seconds.

### 4. Collector Routing & Live Location
- **Priority-first routing:** Crew job queues and map routes order High $\rightarrow$ Medium $\rightarrow$ Low priority jobs, with nearest-neighbour ordering within each tier.
- **Live Location:** Crew members share their GPS location every 30 seconds with pause/resume support and a tap-the-map manual fallback.
- **Nearest-Crew Assignment:** New reports automatically dispatch to the nearest collector active within the last 30 minutes with $<5$ assigned jobs (fallback to least busy collector).

### 5. Admin Dashboard
- **Stat Cards:** Real-time counts for Unassigned, Overdue (highlighted in red when $>0$), Open now, and Cleared this week.
- **Oldest Open Complaints:** Immediate access to the 5 oldest open reports with quick assignment and "Mark fake" moderation.
- **Interactive Map:** Status and category filter chips, map legend, square bin indicators ($>80\%$ full in red), crew ring indicators (grey if inactive $>30$ mins), and clickable pins with detail cards.
- **7-Day Analytics:** Plain SVG bar chart showing daily complaint volume alongside category percentage breakdown.
- **Crew Workload:** Open jobs, weekly clears, average clearance time, workload visualizer, and last seen location timestamp.
- **Priority Overrides:** Admins can manually set priority overrides with documented reasons.

## Deploy
Push to GitHub, import into Vercel, add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. `vercel.json` handles page routing.

## Timelines, proof photos, comments, hotspots & offline use

For existing projects, run **`supabase/update-4.sql`** in the Supabase SQL Editor before using these features. It runs in a transaction and can be applied again safely. Fresh installations already include it in `schema.sql`. The public anon key cannot run migrations.

- **Report details:** Residents, assigned collectors, and administrators can expand **Timeline, photos & comments**. Database triggers record submissions, status/assignment changes, priority changes, and resolution updates. Older reports show only known timestamps and a migration-time status snapshot; earlier assignment history cannot be reconstructed. Comments are limited to 2,000 characters and visible only to report participants and administrators.
- **Cleanup proof:** New clearances require a completion photo, resolution remark, and a GPS tag captured **within 100 metres** of the fixed report pin, with reported accuracy of **100 metres or better**. Cleanup reuses a valid live GPS reading from the last 30 seconds; otherwise it requests high-accuracy positioning and retries standard positioning if that provider times out or is unavailable (up to 60 seconds total). Every reading still passes the same age, accuracy, and distance checks. Supabase validates the coordinates, capture timestamp, assignment permissions, and existence of the uploaded photo. Original and completion photos appear together in report details. Existing reports retain their old photos.
- **Offline reports:** Every submission is saved in IndexedDB with its photo before sending. Failed sends retain the draft. Reopening the app or reconnecting retries pending submissions while the same account is signed in. Request IDs prevent duplicate complaints and point rewards after a lost response. Duplicate reports stay saved until the resident supports the existing report or explicitly discards the draft.
- **Offline cleanup & geotags:** Collectors can capture GPS, photo, and remarks without internet. The captured coordinates, accuracy, and time are stored with the local photo; reconnecting submits the original tag, rather than requiring the collector to remain on site. The report remains open on the server until sync succeeds. Reassigned or closed jobs retain local evidence and show an error instead of silently losing it. **Retry saved cleanups** retries errors; discarding requires confirmation.
- **Offline startup:** Open the production app online once and wait for its service worker to install. The app shell, last fetched profile, and visible reports then work offline while a valid saved Supabase session remains available. Offline shell caching runs in `npm run build` + `npm run preview` and production, not Vite development mode. GPS needs HTTPS (or localhost), location permission, and a device capable of acquiring an offline fix. Map tiles, remote photos, sign-in, comments, and new server data require internet. Browser storage clearing removes unsent drafts; nothing syncs while the app is closed.
- **Hotspots:** The admin dashboard groups at least three non-rejected reports from the last 30 days within 100 metres of a report location. Cleared reports count toward recurring activity; open counts are shown separately. Overlapping groups appear once, starting with the densest group. Aggregation runs on the database rather than the first page of loaded reports.

Browser GPS readings can be spoofed; this verifies submitted location data, not tamper-proof physical presence. Offline drafts and cached reports are stored locally per account; use a trusted device.

Run `npm test` and `npm run build` for the automated frontend checks. `tests/reporting.sql` checks database permissions, timeline events, comments, retry idempotency, GPS restrictions, offline capture timestamps, cleanup proof, rewards, and hotspot aggregation. Run it as the schema owner against a disposable database with `schema.sql` installed; its fixtures roll back.
