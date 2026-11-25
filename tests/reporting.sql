-- Run with psql against a disposable database with schema.sql already installed.
-- Fixtures and changes are rolled back. Requires the schema owner, not an anon key.
begin;
create function pg_temp.check_assert(ok boolean,message text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAILED: %',message; end if; end$$;
create function pg_temp.expect_error(statement text,expected text) returns void language plpgsql as $$
begin
 begin execute statement;
 exception when others then
  if position(expected in sqlerrm)>0 then return; end if;
  raise exception 'Expected %, got %',expected,sqlerrm;
 end;
 raise exception 'Expected an error containing %',expected;
end$$;

insert into auth.users(id,email,raw_user_meta_data) values
 ('10000000-0000-4000-8000-000000000001','reporter@test.invalid','{"name":"Reporter"}'),
 ('10000000-0000-4000-8000-000000000002','crew@test.invalid','{"name":"Crew"}'),
 ('10000000-0000-4000-8000-000000000003','outsider@test.invalid','{"name":"Outsider"}'),
 ('10000000-0000-4000-8000-000000000004','admin@test.invalid','{"name":"Admin"}');
update public.profiles set role='collector' where id='10000000-0000-4000-8000-000000000002';
update public.profiles set role='admin' where id='10000000-0000-4000-8000-000000000004';
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
select public.submit_complaint('Other','Offline report',12.97,77.59,null,'20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001');
select public.submit_complaint('Other','Offline report',12.97,77.59,null,'20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001');
select pg_temp.check_assert((select count(*)=1 from public.complaints where client_request_id='20000000-0000-4000-8000-000000000001'),'a retried request creates only one report');
select pg_temp.check_assert((select points=2 from public.profiles where id=auth.uid()),'a retry awards no extra points');
select id as report_id from public.complaints where client_request_id='20000000-0000-4000-8000-000000000001' \gset
select pg_temp.check_assert((select count(*)=2 from public.complaint_events where complaint_id=:'report_id'),'submission and auto assignment both enter history');
select public.add_complaint_comment(:'report_id','  Where exactly?  ');
select pg_temp.check_assert((select body='Where exactly?' from public.complaint_comments where complaint_id=:'report_id'),'comments are trimmed');
select pg_temp.expect_error(format('select public.add_complaint_comment(%L,%L)',:'report_id','   '),'1 to 2000');
select pg_temp.expect_error(format('select public.add_complaint_comment(%L,%L)',:'report_id',repeat('x',2001)),'1 to 2000');
select pg_temp.expect_error('delete from public.complaint_events','permission denied');
select pg_temp.expect_error('insert into public.complaint_comments(body) values (''fake'')','permission denied');
select pg_temp.expect_error('select public.submit_complaint(''Other'',''bad coordinates'',91,10,null)','valid map location');
select pg_temp.expect_error('select public.submit_complaint(''Other'',''wrong account'',12,77,null,null,''10000000-0000-4000-8000-000000000003'')','account that saved');

select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',true);
select pg_temp.check_assert((select count(*)=0 from public.complaint_comments),'outsiders cannot read comments');
select pg_temp.check_assert((select count(*)=0 from public.complaint_events),'outsiders cannot read history');
select pg_temp.expect_error(format('select public.add_complaint_comment(%L,''unauthorized'')',:'report_id'),'cannot comment');
select pg_temp.expect_error('select * from public.complaint_hotspots()','Only administrators');

reset role;
-- A day-old GPS capture simulates proof saved while offline.
update public.complaints set created_at=now()-interval '2 days' where id=:'report_id';
insert into storage.objects(bucket_id,name) values('photos','10000000-0000-4000-8000-000000000002/done/'||:'report_id'||'/proof.png');
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
select public.add_complaint_comment(:'report_id','On my way');
select pg_temp.check_assert((select count(*)=2 from public.complaint_comments),'assigned crew can read and comment');
select pg_temp.expect_error(format('update public.complaints set status=''cleared'',resolution_note=''Done'' where id=%L',:'report_id'),'valid GPS tag');
select pg_temp.expect_error(format('update public.complaints set lat=13,status=''cleared'' where id=%L',:'report_id'),'locations cannot be changed');
select pg_temp.expect_error(format('update public.complaints set status=''cleared'',resolution_note=''Done'',cleared_lat=13,cleared_lng=77.59,cleared_accuracy=10,cleared_location_at=now() where id=%L',:'report_id'),'within 100 metres');
select pg_temp.expect_error(format('update public.complaints set status=''cleared'',resolution_note=''Done'',cleared_lat=12.97,cleared_lng=77.59,cleared_accuracy=101,cleared_location_at=now() where id=%L',:'report_id'),'valid GPS tag');
select pg_temp.expect_error(format('update public.complaints set status=''cleared'',resolution_note=''Done'',cleared_lat=12.97,cleared_lng=77.59,cleared_accuracy=10,cleared_location_at=now()+interval ''1 hour'' where id=%L',:'report_id'),'valid GPS tag');
select pg_temp.expect_error(format('update public.complaints set status=''cleared'',resolution_note=''Done'',cleared_lat=12.97,cleared_lng=77.59,cleared_accuracy=10,cleared_location_at=now() where id=%L',:'report_id'),'completion photo');
update public.complaints set status='cleared',resolution_note='Cleaned offline',
 done_image_path='10000000-0000-4000-8000-000000000002/done/'||id||'/proof.png',
 cleared_lat=12.97,cleared_lng=77.59,cleared_accuracy=10,cleared_location_at=now()-interval '1 day'
 where id=:'report_id';
update public.complaints set status='cleared' where id=:'report_id';
select pg_temp.check_assert((select count(*)=1 from public.complaint_events where complaint_id=:'report_id' and status='cleared'),'clearance is recorded once');
reset role;
select pg_temp.check_assert((select points=12 from public.profiles where id='10000000-0000-4000-8000-000000000001'),'clearance reward is paid once');
insert into public.complaints(user_id,category,description,lat,lng,status,created_at) values
 ('10000000-0000-4000-8000-000000000001','Illegal dumping','Hotspot A',13.1,77.8,'reported',now()-interval '1 day'),
 ('10000000-0000-4000-8000-000000000001','Overflowing bin','Hotspot B',13.1003,77.8,'reported',now()-interval '2 days'),
 ('10000000-0000-4000-8000-000000000001','Other','Hotspot C',13.0997,77.8,'cleared',now()-interval '3 days'),
 ('10000000-0000-4000-8000-000000000001','Other','Rejected',13.1,77.8,'rejected',now()),
 ('10000000-0000-4000-8000-000000000001','Other','Old',13.1,77.8,'reported',now()-interval '31 days');
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000004',true);
select pg_temp.check_assert((select count(*)=1 and min(reports)=3 and min(open_reports)=2 from public.complaint_hotspots()),'hotspots exclude old/rejected reports and merge overlapping anchors');
set local role anon;
select pg_temp.expect_error('select public.add_complaint_comment(null,''anonymous'')','permission denied');
select pg_temp.expect_error('select * from public.complaint_hotspots()','permission denied');
rollback;
