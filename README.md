# Kerbside

Urban refuse reporting and management. React 18 + TypeScript + Vite, Supabase (Auth, Postgres, Storage, Realtime), Leaflet maps.

## Run it
1. Create a free project at supabase.com.
2. In the SQL Editor, run `supabase/schema.sql` (tables, security rules, photo bucket, realtime).
   - If migrating an existing database, run `supabase/update-3.sql` (after `supabase/update-2.sql` or `supabase/update-1.sql`).
3. Copy `.env.example` to `.env` and paste your project URL and anon key (Project Settings > API).
4. `npm install` then `npm run dev` and open the address it prints.

## Roles & Permissions
Everyone who signs up is a **citizen** (resident).
- **Staff creation:** Admins can create collector accounts directly from the Admin tab without touching the database, or assign roles via the in-app User Roles manager.
- **Role changes:** Strictly restricted to administrators.

## Features

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
