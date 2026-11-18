-- Run this whole file in Supabase: SQL Editor > New query > Run.
create table profiles(id uuid primary key references auth.users on delete cascade,name text not null default '',role text not null default 'citizen' check(role in('citizen','collector','admin')),points int not null default 0);
create table complaints(id uuid primary key default gen_random_uuid(),user_id uuid not null references profiles(id),category text not null,description text not null,lat double precision not null,lng double precision not null,image_url text,status text not null default 'reported' check(status in('reported','assigned','cleared')),collector_id uuid references profiles(id),resolution_note text,done_image_url text,upvotes int not null default 1,created_at timestamptz not null default now());
create table bins(id uuid primary key default gen_random_uuid(),lat double precision not null,lng double precision not null,fill int not null default 0 check(fill between 0 and 100));
create index on complaints(status);create index on complaints(collector_id);
insert into bins(lat,lng,fill) values(12.9716,77.5946,90),(12.9760,77.6010,40),(12.9680,77.5880,75),(12.9800,77.5900,30);

create or replace function my_role() returns text language sql stable security definer set search_path=public as $$select role from profiles where id=auth.uid()$$;
create or replace function handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$begin
 insert into profiles(id,name,role) values(new.id,coalesce(new.raw_user_meta_data->>'name',''),coalesce(new.raw_user_meta_data->>'role','citizen'))
 on conflict(id) do update set name=excluded.name,role=coalesce(nullif(excluded.role,'citizen'),profiles.role);
 return new;end$$;
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

-- Validates, detects duplicates (same category within ~30 m) and awards points.
create function submit_complaint(p_category text,p_description text,p_lat float8,p_lng float8,p_image text) returns text language plpgsql security definer set search_path=public as $$
declare d complaints; nid uuid; c uuid;
begin
 if auth.uid() is null then raise exception 'Sign in to report a problem.'; end if;
 if length(trim(p_description))=0 then raise exception 'Add a short note.'; end if;
 select * into d from complaints where status<>'cleared' and category=p_category and abs(lat-p_lat)<0.00027 and abs(lng-p_lng)<0.00027 limit 1;
 if found then update complaints set upvotes=upvotes+1 where id=d.id; update profiles set points=points+2 where id=auth.uid(); return 'duplicate'; end if;
 insert into complaints(user_id,category,description,lat,lng,image_url) values(auth.uid(),p_category,trim(p_description),p_lat,p_lng,p_image) returning id into nid;
 update profiles set points=points+10 where id=auth.uid();
 -- auto-assign to the collector with the fewest open jobs, if any exist
 select p.id into c from profiles p where p.role='collector' order by (select count(*) from complaints x where x.collector_id=p.id and x.status='assigned') limit 1;
 if c is not null then update complaints set collector_id=c,status='assigned' where id=nid; end if;
 return 'created';
end$$;
create function reward_on_clear() returns trigger language plpgsql security definer set search_path=public as $$begin
 if new.status='cleared' and old.status<>'cleared' then update profiles set points=points+5 where id=new.user_id; end if; return new; end$$;
create trigger complaint_cleared after update on complaints for each row execute function reward_on_clear();

alter table profiles enable row level security;alter table complaints enable row level security;alter table bins enable row level security;
create policy "profiles read" on profiles for select using(id=auth.uid() or my_role()='admin');
create policy "profiles admin update" on profiles for update using(my_role()='admin');
create policy "complaints read" on complaints for select using(user_id=auth.uid() or collector_id=auth.uid() or my_role()='admin');
create policy "complaints crew update" on complaints for update using(collector_id=auth.uid() or my_role()='admin');
create policy "bins read" on bins for select to authenticated using(true);
create policy "bins admin" on bins for all using(my_role()='admin');

insert into storage.buckets(id,name,public) values('photos','photos',true) on conflict do nothing;
create policy "photos upload" on storage.objects for insert to authenticated with check(bucket_id='photos');
create policy "photos read" on storage.objects for select using(bucket_id='photos');
alter publication supabase_realtime add table complaints;
-- To make someone staff: update profiles set role='collector' (or 'admin') where id='<user id>';
