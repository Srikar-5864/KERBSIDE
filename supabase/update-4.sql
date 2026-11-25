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
