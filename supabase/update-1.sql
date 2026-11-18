-- Run once if you already ran schema.sql: adds automatic crew assignment.
create or replace function submit_complaint(p_category text,p_description text,p_lat float8,p_lng float8,p_image text) returns text language plpgsql security definer set search_path=public as $$
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
