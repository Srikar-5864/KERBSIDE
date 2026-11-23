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
