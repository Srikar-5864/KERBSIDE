-- Run this whole file in Supabase: SQL Editor > New query > Run.

-- 1. Profiles Table
create table if not exists profiles(
  id uuid primary key references auth.users on delete cascade,
  name text not null default '',
  email text,
  role text not null default 'citizen' check(role in('citizen','collector','admin')),
  points int not null default 0,
  lat double precision,
  lng double precision,
  location_at timestamptz
);

-- 2. Complaints Table
create table if not exists complaints(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id),
  category text not null,
  description text not null,
  lat double precision not null,
  lng double precision not null,
  image_url text,
  status text not null default 'reported' check(status in('reported','assigned','cleared','rejected')),
  collector_id uuid references profiles(id),
  resolution_note text,
  done_image_url text,
  upvotes int not null default 1,
  support int not null default 1,
  voters int not null default 1,
  base_priority text not null default 'medium' check(base_priority in('low','medium','high')),
  priority text not null default 'medium' check(priority in('low','medium','high')),
  priority_override text check(priority_override in('low','medium','high')),
  override_reason text,
  needs_review boolean not null default false,
  due_at timestamptz not null default (now() + interval '24 hours'),
  cleared_at timestamptz,
  created_at timestamptz not null default now()
);

-- 3. Bins Table
create table if not exists bins(
  id uuid primary key default gen_random_uuid(),
  lat double precision not null,
  lng double precision not null,
  fill int not null default 0 check(fill between 0 and 100)
);

-- 4. Votes Table
create table if not exists votes(
  complaint_id uuid not null references complaints(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  weight int not null check (weight >= 1),
  created_at timestamptz not null default now(),
  primary key(complaint_id, user_id)
);

create index if not exists complaints_status_idx on complaints(status);
create index if not exists complaints_collector_idx on complaints(collector_id);

insert into bins(lat,lng,fill) values
  (12.9716,77.5946,90),
  (12.9760,77.6010,40),
  (12.9680,77.5880,75),
  (12.9800,77.5900,30)
on conflict do nothing;

-- 5. Helper Functions & Auth Trigger
create or replace function my_role() returns text language sql stable security definer set search_path=public as $$
  select role from profiles where id=auth.uid()
$$;

create or replace function handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into profiles(id, name, email, role)
  values(
    new.id,
    coalesce(new.raw_user_meta_data->>'name', ''),
    new.email,
    coalesce(new.raw_user_meta_data->>'role', 'citizen')
  )
  on conflict(id) do update set
    name = excluded.name,
    email = excluded.email,
    role = coalesce(nullif(excluded.role, 'citizen'), profiles.role);
  return new;
end$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function handle_new_user();

create or replace function set_role(target_user_id uuid, new_role text) returns void language plpgsql security definer set search_path=public as $$
begin
  if my_role() <> 'admin' then
    raise exception 'Only administrators can change roles.';
  end if;
  if new_role in ('citizen','collector','admin') then
    update profiles set role=new_role where id=target_user_id;
  end if;
end$$;

create or replace function vote_weight(points int)
returns int language sql immutable security definer set search_path=public as $$
  select case
    when coalesce(points, 0) < 30 then 1
    when points < 100 then 2
    when points < 250 then 3
    else 4
  end;
$$;

create or replace function compute_priority(base text, p_support int, p_voters int, p_override text)
returns text language plpgsql immutable security definer set search_path=public as $$
-- Elevation thresholds:
-- Elevation requires at least 2 distinct voters
-- +1 priority level threshold: support >= 3
-- +2 priority levels threshold: support >= 5
declare
  c_threshold_1 constant int := 3;
  c_threshold_2 constant int := 5;
  v_elev int := 0;
  v_base_rank int;
  v_final_rank int;
begin
  if p_override is not null and p_override in ('low', 'medium', 'high') then
    return p_override;
  end if;

  if coalesce(p_voters, 1) >= 2 then
    if coalesce(p_support, 1) >= c_threshold_2 then
      v_elev := 2;
    elsif coalesce(p_support, 1) >= c_threshold_1 then
      v_elev := 1;
    end if;
  end if;

  v_base_rank := case base when 'low' then 1 when 'medium' then 2 when 'high' then 3 else 2 end;
  v_final_rank := least(3, v_base_rank + v_elev);

  return case v_final_rank when 1 then 'low' when 2 then 'medium' when 3 then 'high' else 'medium' end;
end$$;

create or replace function set_priority(p_id uuid, p_priority text, p_reason text)
returns void language plpgsql security definer set search_path=public as $$
declare
  v_base text;
  v_support int;
  v_voters int;
begin
  if my_role() <> 'admin' then
    raise exception 'Only administrators can set priority overrides.';
  end if;
  if p_priority is not null and p_priority not in ('low', 'medium', 'high') then
    raise exception 'Priority must be low, medium, high or null.';
  end if;

  select base_priority, support, voters into v_base, v_support, v_voters
  from complaints where id = p_id;

  if not found then
    raise exception 'Complaint not found.';
  end if;

  update complaints set
    priority_override = p_priority,
    override_reason = p_reason,
    needs_review = false,
    priority = compute_priority(v_base, v_support, v_voters, p_priority)
  where id = p_id;
end$$;

create or replace function mark_fake(p_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare
  v_reporter uuid;
begin
  if my_role() <> 'admin' then
    raise exception 'Only administrators can mark reports as fake.';
  end if;

  select user_id into v_reporter from complaints where id = p_id;
  if not found then
    raise exception 'Complaint not found.';
  end if;

  update complaints set status = 'rejected' where id = p_id;
  update profiles set points = greatest(0, points - 5) where id = v_reporter;
end$$;

create or replace function update_my_location(p_lat float8, p_lng float8)
returns void language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null then raise exception 'Sign in required.'; end if;
  update profiles
  set lat = p_lat, lng = p_lng, location_at = now()
  where id = auth.uid() and role = 'collector';
end$$;

create or replace function pause_my_location()
returns void language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null then raise exception 'Sign in required.'; end if;
  update profiles
  set location_at = null
  where id = auth.uid() and role = 'collector';
end$$;

drop function if exists pick_crew(float8, float8);
drop function if exists pick_crew(double precision, double precision);
create or replace function pick_crew(p_lat float8, p_lng float8)
returns uuid language plpgsql stable security definer set search_path=public as $$
declare
  v_crew uuid;
begin
  select p.id into v_crew
  from profiles p
  where p.role = 'collector'
    and p.location_at is not null
    and p.location_at >= now() - interval '30 minutes'
    and p.lat is not null and p.lng is not null
    and (select count(*) from complaints c where c.collector_id = p.id and c.status = 'assigned') < 5
  order by ((p.lat - p_lat)^2 + ((p.lng - p_lng) * cos(radians((p.lat + p_lat)/2)))^2) asc
  limit 1;

  if v_crew is not null then
    return v_crew;
  end if;

  select p.id into v_crew
  from profiles p
  where p.role = 'collector'
  order by (select count(*) from complaints c where c.collector_id = p.id and c.status = 'assigned') asc
  limit 1;

  return v_crew;
end$$;

create or replace function auto_assign_unassigned()
returns int language plpgsql security definer set search_path=public as $$
declare
  r record;
  v_crew uuid;
  v_count int := 0;
begin
  if my_role() <> 'admin' then
    raise exception 'Only administrators can auto-assign reports.';
  end if;

  for r in select id, lat, lng from complaints where status = 'reported' order by created_at asc loop
    v_crew := pick_crew(r.lat, r.lng);
    if v_crew is not null then
      update complaints set collector_id = v_crew, status = 'assigned' where id = r.id;
      v_count := v_count + 1;
    end if;
  end loop;

  return v_count;
end$$;

drop function if exists submit_complaint(text, text, float8, float8, text);
drop function if exists submit_complaint(text, text, double precision, double precision, text);
create or replace function submit_complaint(p_category text, p_description text, p_lat float8, p_lng float8, p_image text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  d complaints;
  nid uuid;
  c_crew uuid;
  v_base text;
  v_target_hours int;
  v_weight int;
begin
  if auth.uid() is null then raise exception 'Sign in to report a problem.'; end if;
  if length(trim(p_description)) = 0 then raise exception 'Add a short note.'; end if;

  case p_category
    when 'Hazardous or medical waste' then v_base := 'high'; v_target_hours := 4;
    when 'Dead animal' then v_base := 'high'; v_target_hours := 6;
    when 'Overflowing bin' then v_base := 'medium'; v_target_hours := 24;
    when 'Illegal dumping' then v_base := 'medium'; v_target_hours := 48;
    when 'Missed pickup' then v_base := 'low'; v_target_hours := 24;
    when 'Other' then v_base := 'medium'; v_target_hours := 24;
    else raise exception 'Invalid report category: %', p_category;
  end case;

  select * into d from complaints
  where status in ('reported', 'assigned')
    and category = p_category
    and abs(lat - p_lat) < 0.00027
    and abs(lng - p_lng) < 0.00027
  limit 1;

  if found then
    return jsonb_build_object('result', 'duplicate', 'id', d.id);
  end if;

  insert into complaints(
    user_id, category, description, lat, lng, image_url,
    base_priority, priority, needs_review, due_at, support, voters
  ) values (
    auth.uid(), p_category, trim(p_description), p_lat, p_lng, p_image,
    v_base, v_base, (p_category = 'Other'), now() + (v_target_hours * interval '1 hour'), 1, 1
  ) returning id into nid;

  update profiles set points = points + 2 where id = auth.uid();

  select vote_weight(points) into v_weight from profiles where id = auth.uid();
  v_weight := coalesce(v_weight, 1);
  insert into votes(complaint_id, user_id, weight) values (nid, auth.uid(), v_weight) on conflict do nothing;
  update complaints set support = v_weight where id = nid;

  c_crew := pick_crew(p_lat, p_lng);
  if c_crew is not null then
    update complaints set collector_id = c_crew, status = 'assigned' where id = nid;
  end if;

  return jsonb_build_object('result', 'created', 'id', nid);
end$$;

create or replace function nearby_complaints(p_lat float8, p_lng float8)
returns table (
  id uuid,
  category text,
  description text,
  lat double precision,
  lng double precision,
  status text,
  priority text,
  due_at timestamptz,
  support int,
  voters int,
  created_at timestamptz,
  voted boolean,
  mine boolean
) language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in to view community reports.';
  end if;

  return query
  select
    c.id,
    c.category,
    c.description,
    c.lat,
    c.lng,
    c.status,
    c.priority,
    c.due_at,
    c.support,
    c.voters,
    c.created_at,
    exists(select 1 from votes v where v.complaint_id = c.id and v.user_id = auth.uid()) as voted,
    (c.user_id = auth.uid()) as mine
  from complaints c
  where c.status in ('reported', 'assigned')
    and (12742 * asin(sqrt(sin(radians((c.lat - p_lat)/2))^2 + cos(radians(p_lat)) * cos(radians(c.lat)) * sin(radians((c.lng - p_lng)/2))^2))) <= 2.05
  order by
    case c.priority when 'high' then 1 when 'medium' then 2 when 'low' then 3 else 4 end asc,
    c.support desc,
    c.created_at desc;
end$$;

create or replace function cast_vote(p_complaint uuid, p_lat float8, p_lng float8)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  c complaints;
  v_weight int;
  v_support int;
  v_voters int;
  v_new_priority text;
  v_dist float8;
begin
  if auth.uid() is null then
    raise exception 'Sign in to vote.';
  end if;
  if my_role() <> 'citizen' then
    raise exception 'Only residents can support reports.';
  end if;

  select * into c from complaints where id = p_complaint;
  if not found or c.status not in ('reported', 'assigned') then
    raise exception 'This report is closed or does not exist.';
  end if;

  v_dist := 12742 * asin(sqrt(sin(radians((c.lat - p_lat)/2))^2 + cos(radians(p_lat)) * cos(radians(c.lat)) * sin(radians((c.lng - p_lng)/2))^2));
  if v_dist > 2.05 then
    raise exception 'You must be within 2 km of the report to support it.';
  end if;

  if exists(select 1 from votes where complaint_id = p_complaint and user_id = auth.uid()) then
    raise exception 'You have already supported this report.';
  end if;

  select vote_weight(points) into v_weight from profiles where id = auth.uid();
  v_weight := coalesce(v_weight, 1);

  insert into votes(complaint_id, user_id, weight) values (p_complaint, auth.uid(), v_weight);

  select coalesce(sum(weight), 0), count(*) into v_support, v_voters
  from votes where complaint_id = p_complaint;

  v_new_priority := compute_priority(c.base_priority, v_support, v_voters, c.priority_override);

  update complaints set
    support = v_support,
    voters = v_voters,
    upvotes = v_voters,
    priority = v_new_priority
  where id = p_complaint;

  return jsonb_build_object('support', v_support, 'voters', v_voters, 'priority', v_new_priority);
end$$;

create or replace function reward_on_clear() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.status = 'cleared' and old.status <> 'cleared' then
    update profiles set points = points + 10 where id = new.user_id;
    new.cleared_at := coalesce(new.cleared_at, now());
  end if;
  return new;
end$$;

drop trigger if exists complaint_cleared on complaints;
create trigger complaint_cleared before update on complaints for each row execute function reward_on_clear();

-- 6. Row Level Security Policies
alter table profiles enable row level security;
alter table complaints enable row level security;
alter table bins enable row level security;
alter table votes enable row level security;

create policy "profiles read" on profiles for select using(id=auth.uid() or my_role()='admin');
create policy "profiles admin update" on profiles for update using(my_role()='admin');
create policy "complaints read" on complaints for select using(user_id=auth.uid() or collector_id=auth.uid() or my_role()='admin');
create policy "complaints crew update" on complaints for update using(collector_id=auth.uid() or my_role()='admin');
create policy "bins read" on bins for select to authenticated using(true);
create policy "bins admin" on bins for all using(my_role()='admin');

-- 7. Storage Bucket & Realtime
insert into storage.buckets(id,name,public) values('photos','photos',true) on conflict do nothing;
create policy "photos upload" on storage.objects for insert to authenticated with check(bucket_id='photos');
create policy "photos read" on storage.objects for select using(bucket_id='photos');
alter publication supabase_realtime add table complaints;

-- Additional reporting features (also available separately as update-4.sql).
-- Run after schema.sql (or update-3.sql). Safe to run again.
begin;

alter table public.complaints add column if not exists done_image_path text;
alter table public.complaints add column if not exists cleared_lat float8;
alter table public.complaints add column if not exists cleared_lng float8;
alter table public.complaints add column if not exists cleared_accuracy float8;
alter table public.complaints add column if not exists cleared_location_at timestamptz;
alter table public.complaints add column if not exists client_request_id uuid;
create unique index if not exists complaints_request_idx on public.complaints(user_id,client_request_id);
create index if not exists complaints_created_idx on public.complaints(created_at);

create table if not exists public.complaint_events(
 id bigint generated always as identity primary key,
 complaint_id uuid not null references public.complaints(id) on delete cascade,
 event text not null,
 status text not null,
 note text,
 actor_name text not null default 'System',
 created_at timestamptz not null default now()
);
create index if not exists complaint_events_report_idx on public.complaint_events(complaint_id,created_at);

create table if not exists public.complaint_comments(
 id uuid primary key default gen_random_uuid(),
 complaint_id uuid not null references public.complaints(id) on delete cascade,
 user_id uuid references public.profiles(id) on delete set null,
 author_name text not null,
 author_role text not null,
 body text not null check(length(trim(body)) between 1 and 2000),
 created_at timestamptz not null default now()
);
create index if not exists complaint_comments_report_idx on public.complaint_comments(complaint_id,created_at);

alter table public.complaint_events enable row level security;
alter table public.complaint_comments enable row level security;
drop policy if exists "participants read events" on public.complaint_events;
create policy "participants read events" on public.complaint_events for select to authenticated
 using(exists(select 1 from public.complaints c where c.id=complaint_id));
drop policy if exists "participants read comments" on public.complaint_comments;
create policy "participants read comments" on public.complaint_comments for select to authenticated
 using(exists(select 1 from public.complaints c where c.id=complaint_id));
revoke all on public.complaint_events,public.complaint_comments from anon,authenticated;
grant select on public.complaint_events,public.complaint_comments to authenticated;

create or replace function public.add_complaint_comment(p_complaint uuid,p_body text)
returns void language plpgsql security definer set search_path='' as $$
declare p public.profiles;
begin
 if auth.uid() is null then raise exception 'Sign in to comment.'; end if;
 select * into p from public.profiles where id=auth.uid();
 if not exists(select 1 from public.complaints c where c.id=p_complaint
  and (c.user_id=auth.uid() or c.collector_id=auth.uid() or p.role='admin')) then
  raise exception 'You cannot comment on this report.';
 end if;
 if p_body is null or length(trim(p_body)) not between 1 and 2000 then
  raise exception 'Comments must contain 1 to 2000 characters.';
 end if;
 insert into public.complaint_comments(complaint_id,user_id,author_name,author_role,body)
 values(p_complaint,auth.uid(),coalesce(nullif(p.name,''),'Resident'),p.role,trim(p_body));
end$$;
revoke all on function public.add_complaint_comment(uuid,text) from public,anon;
grant execute on function public.add_complaint_comment(uuid,text) to authenticated;

create or replace function public.record_complaint_event()
returns trigger language plpgsql security definer set search_path='' as $$
declare label text; actor text;
begin
 select coalesce(nullif(name,''),'Staff') into actor from public.profiles where id=auth.uid();
 if tg_op='INSERT' then label:='Report submitted';
 elsif new.status is distinct from old.status then label:='Status updated';
 elsif new.collector_id is distinct from old.collector_id then label:='Crew assignment updated';
 elsif new.priority is distinct from old.priority or new.override_reason is distinct from old.override_reason then label:='Priority updated';
 elsif new.resolution_note is distinct from old.resolution_note or new.done_image_path is distinct from old.done_image_path then label:='Resolution updated';
 else return new;
 end if;
 insert into public.complaint_events(complaint_id,event,status,note,actor_name)
 values(new.id,label,new.status,case when new.status='cleared' then new.resolution_note
  when label='Priority updated' then new.priority||coalesce(': '||new.override_reason,'') end,coalesce(actor,'System'));
 return new;
end$$;
revoke all on function public.record_complaint_event() from public,anon,authenticated;
drop trigger if exists complaint_history on public.complaints;
create trigger complaint_history after insert or update on public.complaints for each row execute function public.record_complaint_event();

-- Older records have no assignment history; retain only known timestamps.
insert into public.complaint_events(complaint_id,event,status,created_at)
 select c.id,'Report submitted','reported',c.created_at from public.complaints c
 where not exists(select 1 from public.complaint_events e where e.complaint_id=c.id);
insert into public.complaint_events(complaint_id,event,status,note,created_at)
 select c.id,'Status when history was enabled',c.status,c.resolution_note,coalesce(c.cleared_at,now())
 from public.complaints c where c.status<>'reported'
 and not exists(select 1 from public.complaint_events e where e.complaint_id=c.id and e.status=c.status);

-- New clearances require a photo actually uploaded by the acting staff member.
create or replace function public.validate_clearance()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.lat is distinct from old.lat or new.lng is distinct from old.lng then raise exception 'Report locations cannot be changed.'; end if;
 if new.status='cleared' and (old.status is distinct from new.status
  or old.done_image_path is distinct from new.done_image_path or old.resolution_note is distinct from new.resolution_note
  or old.cleared_lat is distinct from new.cleared_lat or old.cleared_lng is distinct from new.cleared_lng
  or old.cleared_accuracy is distinct from new.cleared_accuracy or old.cleared_location_at is distinct from new.cleared_location_at) then
  if auth.uid() is null or (old.collector_id is distinct from auth.uid() and public.my_role() is distinct from 'admin') then
   raise exception 'Only the assigned crew or an administrator can clear this report.';
  end if;
  if new.resolution_note is null or length(trim(new.resolution_note)) not between 1 and 2000 then
   raise exception 'Add a resolution remark (1 to 2000 characters).';
  end if;
  if new.cleared_lat is null or new.cleared_lng is null or new.cleared_accuracy is null
   or new.cleared_lat not between -90 and 90 or new.cleared_lng not between -180 and 180
   or new.cleared_accuracy not between 0 and 100 or new.cleared_location_at is null
   or new.cleared_location_at<old.created_at or new.cleared_location_at>now()+interval '5 minutes' then
   raise exception 'Capture a valid GPS tag at the cleanup site (accuracy within 100 metres).';
  end if;
  if 12742000*asin(sqrt(least(1.0,sin(radians((new.lat-new.cleared_lat)/2))^2
   +cos(radians(new.lat))*cos(radians(new.cleared_lat))*sin(radians((new.lng-new.cleared_lng)/2))^2)))>100 then
   raise exception 'You must be within 100 metres of the report pin to clear it.';
  end if;
  if new.done_image_path is null or new.done_image_path not like auth.uid()::text||'/done/'||new.id::text||'/%'
   or not exists(select 1 from storage.objects o where o.bucket_id='photos' and o.name=new.done_image_path) then
   raise exception 'Upload a completion photo before clearing the report.';
  end if;
 end if;
 return new;
end$$;
revoke all on function public.validate_clearance() from public,anon,authenticated;
drop trigger if exists complaint_clear_validation on public.complaints;
create trigger complaint_clear_validation before update on public.complaints for each row execute function public.validate_clearance();

-- Immutable, account-owned paths allow safe retries without overwriting evidence.
drop policy if exists "photos upload" on storage.objects;
create policy "photos upload" on storage.objects for insert to authenticated
 with check(bucket_id='photos' and (storage.foldername(name))[1]=auth.uid()::text);
drop policy if exists "photos owner delete" on storage.objects;

create or replace function public.complaint_hotspots()
returns table(id uuid,lat float8,lng float8,reports bigint,open_reports bigint,categories text[],first_report timestamptz,last_report timestamptz)
language plpgsql security definer set search_path='' as $$
declare candidate record; used uuid[]:='{}';
begin
 if auth.uid() is null or public.my_role() is distinct from 'admin' then raise exception 'Only administrators can view hotspots.'; end if;
 -- shortcut: bounding boxes plus exact distances suit this pilot; use PostGIS for city-scale history.
 for candidate in
  with recent as materialized (
   select c.* from public.complaints c where c.created_at>=now()-interval '30 days' and c.created_at<=now() and c.status<>'rejected'
  )
  select a.id,a.lat,a.lng,count(*) as reports,count(*) filter(where b.status in('reported','assigned')) as open_reports,
   array_agg(distinct b.category) as categories,min(b.created_at) as first_report,max(b.created_at) as last_report,array_agg(b.id) as members
  from recent a join recent b on abs(a.lat-b.lat)<=0.0009
   and abs(a.lng-b.lng)<=0.0009/greatest(abs(cos(radians(a.lat))),0.00001)
   and 12742*asin(sqrt(least(1.0,sin(radians((a.lat-b.lat)/2))^2+cos(radians(a.lat))*cos(radians(b.lat))*sin(radians((a.lng-b.lng)/2))^2)))<=0.1
  group by a.id,a.lat,a.lng having count(*)>=3 order by count(*) desc,a.id
 loop
  if candidate.members && used then continue; end if;
  used:=used||candidate.members;
  id:=candidate.id;lat:=candidate.lat;lng:=candidate.lng;reports:=candidate.reports;open_reports:=candidate.open_reports;
  categories:=candidate.categories;first_report:=candidate.first_report;last_report:=candidate.last_report;
  return next;
 end loop;
end$$;
revoke all on function public.complaint_hotspots() from public,anon;
grant execute on function public.complaint_hotspots() to authenticated;

-- The submission function below also deduplicates retries after a lost response.

drop function if exists public.submit_complaint(text,text,float8,float8,text);
create or replace function submit_complaint(p_category text, p_description text, p_lat float8, p_lng float8, p_image text, p_request_id uuid default null, p_reporter uuid default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  d complaints;
  nid uuid;
  c_crew uuid;
  v_base text;
  v_target_hours int;
  v_weight int;
begin
  if auth.uid() is null then raise exception 'Sign in to report a problem.'; end if;
  if public.my_role() is distinct from 'citizen' then raise exception 'Only residents can submit reports.'; end if;
  if p_reporter is not null and p_reporter is distinct from auth.uid() then raise exception 'Sign back in to the account that saved this draft.'; end if;
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'Choose a valid map location.';
  end if;
  if p_description is null or length(trim(p_description)) not between 1 and 2000 then raise exception 'Add a note (1 to 2000 characters).'; end if;
  if p_request_id is not null then
    perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||p_request_id::text,0));
    select id into nid from complaints where user_id=auth.uid() and client_request_id=p_request_id;
    if found then return jsonb_build_object('result','created','id',nid); end if;
  end if;
  if length(trim(p_description)) = 0 then raise exception 'Add a short note.'; end if;

  case p_category
    when 'Hazardous or medical waste' then v_base := 'high'; v_target_hours := 4;
    when 'Dead animal' then v_base := 'high'; v_target_hours := 6;
    when 'Overflowing bin' then v_base := 'medium'; v_target_hours := 24;
    when 'Illegal dumping' then v_base := 'medium'; v_target_hours := 48;
    when 'Missed pickup' then v_base := 'low'; v_target_hours := 24;
    when 'Other' then v_base := 'medium'; v_target_hours := 24;
    else raise exception 'Invalid report category: %', p_category;
  end case;

  select * into d from complaints
  where status in ('reported', 'assigned')
    and category = p_category
    and abs(lat - p_lat) < 0.00027
    and abs(lng - p_lng) < 0.00027
  limit 1;

  if found then
    return jsonb_build_object('result', 'duplicate', 'id', d.id);
  end if;

  insert into complaints(
    user_id, category, description, lat, lng, image_url, client_request_id,
    base_priority, priority, needs_review, due_at, support, voters
  ) values (
    auth.uid(), p_category, trim(p_description), p_lat, p_lng, p_image, p_request_id,
    v_base, v_base, (p_category = 'Other'), now() + (v_target_hours * interval '1 hour'), 1, 1
  ) returning id into nid;

  update profiles set points = points + 2 where id = auth.uid();

  select vote_weight(points) into v_weight from profiles where id = auth.uid();
  v_weight := coalesce(v_weight, 1);
  insert into votes(complaint_id, user_id, weight) values (nid, auth.uid(), v_weight) on conflict do nothing;
  update complaints set support = v_weight where id = nid;

  c_crew := pick_crew(p_lat, p_lng);
  if c_crew is not null then
    update complaints set collector_id = c_crew, status = 'assigned' where id = nid;
  end if;

  return jsonb_build_object('result', 'created', 'id', nid);
end$$;
revoke all on function public.submit_complaint(text,text,float8,float8,text,uuid,uuid) from public,anon;
grant execute on function public.submit_complaint(text,text,float8,float8,text,uuid,uuid) to authenticated;

commit;
