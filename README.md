# Kerbside

Urban refuse reporting and management. React + TypeScript + Vite, Supabase (Auth, Postgres, Storage, Realtime), Leaflet maps.

## Run it
1. Create a free project at supabase.com.
2. In the SQL Editor, run `supabase/schema.sql` (tables, security rules, photo bucket, realtime).
3. Copy `.env.example` to `.env` and paste your project URL and anon key (Project Settings > API).
4. `npm install` then `npm run dev` and open the address it prints.

## Seeing the crew and admin screens
New accounts are residents, so you only get the report form until a role changes. Two ways:
- **Demo switcher (easiest):** run `supabase/demo-roles.sql`, set `VITE_DEMO_MODE=true` in `.env`, restart. A dropdown in the top bar switches your account between resident, collector and admin.
- **Proper way:** in Supabase open Table Editor, `profiles`, and change `role` for a user.

Quick test with two accounts: account A becomes a collector; account B (resident) reports a problem. It is auto-assigned to A and shows on A's route. Then make B an admin to see the map, hotspots and CSV.

If you ran an older `schema.sql`, also run `supabase/update-1.sql` (adds auto-assignment).

## Roles
Everyone who signs up is a **citizen**. To create staff, sign up, then in the Table Editor open `profiles` and set `role` to `collector` or `admin`.

## What it does
- Citizens: report with category, note, photo and GPS or map pin. Duplicate reports within about 30 m are merged. Status changes show live, and points are awarded.
- Collectors: see assigned jobs on a route ordered by distance, then close each with a remark and photo.
- Admins: map of bins and complaints, hotspots, crew performance, manual or workload-based assignment, CSV export.

## Deploy
Push to GitHub, import into Vercel, add the two `VITE_` variables. `vercel.json` handles page routing.

## Known limits
Routing is straight-line distance, not road networks. Notifications are in-app only. Bin fill levels are entered in the database, not read from sensors.
