begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- All identities and visits are synthetic and rolled back at the end.
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data)
select ('a0010000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
  'p0-return-' || n || '@example.invalid',now(),'{"date_of_birth":"1990-01-01"}'::jsonb
from generate_series(1,6) n;
update public.user_roles set role='admin' where user_id='a0010000-0000-4000-8000-000000000005';
update public.user_roles set role='visitor_manager' where user_id='a0010000-0000-4000-8000-000000000006';
insert into public.staff_permissions(user_id,is_active,can_confirm_returns)
values ('a0010000-0000-4000-8000-000000000006',true,false);
insert into public.visits(id,route_id,created_by,join_code,visit_type,status,started_at,expected_return_at)
select 'a0010000-0000-4000-8000-000000000100',id,
  'a0010000-0000-4000-8000-000000000001','P0RET1','day_hike','in_progress',
  now()-interval '5 hours',now()+interval '1 hour'
from public.routes where slug='ascenso-a-la-cima';
insert into public.visit_members(visit_id,user_id,member_role,terms_accepted_at,member_status)
select 'a0010000-0000-4000-8000-000000000100',
  ('a0010000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
  case when n=1 then 'leader'::public.visit_member_role else 'member'::public.visit_member_role end,
  now(),'active' from generate_series(1,3) n;
insert into public.visit_minors(visit_id,responsible_member_id,full_name,age,sex,relationship,created_by)
select 'a0010000-0000-4000-8000-000000000100',user_id,'P0 minor ' || right(user_id::text,1),
  10,'female','child',user_id from public.visit_members
where visit_id='a0010000-0000-4000-8000-000000000100';

create function pg_temp.authenticate_as(n integer) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated',
    'sub','a0010000-0000-4000-8000-' || lpad(n::text,12,'0'))::text,true);
end;
$$;
-- Even a successful exploit is rolled back before testing the modern flow.
create function pg_temp.sqlstate_from(command text) returns text language plpgsql as $$
begin
  execute command;
  raise exception using errcode='Z0001',message='rollback successful probe';
exception when sqlstate 'Z0001' then return 'allowed';
when others then return sqlstate;
end;
$$;

select ok(not has_function_privilege('anon','public.complete_group_visit(uuid)','EXECUTE'),'SEC-001 anon has no legacy EXECUTE');
select ok(not has_function_privilege('authenticated','public.complete_group_visit(uuid)','EXECUTE'),'SEC-001 authenticated has no legacy EXECUTE');
set local role anon;
select is(pg_temp.sqlstate_from($$select public.complete_group_visit('a0010000-0000-4000-8000-000000000100')$$),'42501','anon direct legacy call is denied');
reset role;
set local role authenticated;
select pg_temp.authenticate_as(1);
select is(pg_temp.sqlstate_from($$select public.complete_group_visit('a0010000-0000-4000-8000-000000000100')$$),'42501','legacy call denied to leader');
select pg_temp.authenticate_as(2);
select is(pg_temp.sqlstate_from($$select public.complete_group_visit('a0010000-0000-4000-8000-000000000100')$$),'42501','legacy call denied to member A');
select pg_temp.authenticate_as(3);
select is(pg_temp.sqlstate_from($$select public.complete_group_visit('a0010000-0000-4000-8000-000000000100')$$),'42501','legacy call denied to member B');
select pg_temp.authenticate_as(4);
select is(pg_temp.sqlstate_from($$select public.complete_group_visit('a0010000-0000-4000-8000-000000000100')$$),'42501','legacy call denied to external tourist');
select pg_temp.authenticate_as(5);
select is(pg_temp.sqlstate_from($$select public.complete_group_visit('a0010000-0000-4000-8000-000000000100')$$),'42501','legacy call denied to admin');
select pg_temp.authenticate_as(6);
select is(pg_temp.sqlstate_from($$select public.complete_group_visit('a0010000-0000-4000-8000-000000000100')$$),'42501','legacy call denied to visitor_manager');

select pg_temp.authenticate_as(1);
select is(pg_temp.sqlstate_from($$select public.confirm_my_early_checkout('a0010000-0000-4000-8000-000000000100')$$),'42501','leader cannot confirm someone else through personal checkout');
select lives_ok($$select public.complete_my_visit_participation('a0010000-0000-4000-8000-000000000100')$$,'leader completes only their participation');
reset role;
select is((select count(*) from public.visit_members where visit_id='a0010000-0000-4000-8000-000000000100' and member_status='completed'),1::bigint,'exactly one adult completed');
select is((select count(*) from public.visit_members where visit_id='a0010000-0000-4000-8000-000000000100' and member_status='active'),2::bigint,'both other adults remain active');
select ok((select checked_out_at is not null and return_started_at is null and checkout_method='self'
  from public.visit_members where visit_id='a0010000-0000-4000-8000-000000000100' and user_id='a0010000-0000-4000-8000-000000000001'),'normal return has coherent timestamps and self method');
select ok((select status='in_progress' and completed_at is null from public.visits where id='a0010000-0000-4000-8000-000000000100'),'active adults prevent visit completion');

set local role authenticated;
select pg_temp.authenticate_as(3);
select lives_ok($$select public.start_early_return('a0010000-0000-4000-8000-000000000100','weather',null)$$,'member B starts early return without confirming arrival');
select pg_temp.authenticate_as(2);
select is(pg_temp.sqlstate_from($$select public.confirm_my_early_checkout('a0010000-0000-4000-8000-000000000100')$$),'42501','member A cannot confirm member B arrival');
select lives_ok($$select public.complete_my_visit_participation('a0010000-0000-4000-8000-000000000100')$$,'member A confirms only their own arrival');
reset role;
select ok((select member_status='completed' and checked_out_at is not null and return_started_at is null
  from public.visit_members where visit_id='a0010000-0000-4000-8000-000000000100' and user_id='a0010000-0000-4000-8000-000000000002'),'member A completion is coherent');
select ok((select member_status='returning_early' and checked_out_at is null and return_started_at is not null
  from public.visit_members where visit_id='a0010000-0000-4000-8000-000000000100' and user_id='a0010000-0000-4000-8000-000000000003'),'member B remains pending with no checkout');
select ok((select status='in_progress' and completed_at is null from public.visits where id='a0010000-0000-4000-8000-000000000100'),'returning_early alone prevents visit completion');
select results_eq($$select public.visit_minor_operational_status(v.status,m.member_status)
  from public.visit_minors minor join public.visits v on v.id=minor.visit_id
  join public.visit_members m on m.visit_id=minor.visit_id and m.user_id=minor.responsible_member_id
  where minor.visit_id='a0010000-0000-4000-8000-000000000100' order by minor.full_name$$,
  $$values ('completed'::text),('completed'::text),('returning_early'::text)$$,'each minor follows their own responsible adult');
set local role authenticated;
select pg_temp.authenticate_as(1);
select is(pg_temp.sqlstate_from($$select public.complete_group_visit('a0010000-0000-4000-8000-000000000100')$$),'42501','original pending-return exploit is denied');
select pg_temp.authenticate_as(3);
select lives_ok($$select public.confirm_my_early_checkout('a0010000-0000-4000-8000-000000000100')$$,'member B personally confirms early arrival');
reset role;
select ok((select status='completed' and completed_at is not null from public.visits where id='a0010000-0000-4000-8000-000000000100'),'visit closes after all adults confirm arrival');
select is((select count(*) from public.visit_members where visit_id='a0010000-0000-4000-8000-000000000100' and checked_out_at is not null),3::bigint,'every arrived adult has checked_out_at');
select ok((select member_status='returned_early' and checked_out_at>=return_started_at and checkout_method='self'
  from public.visit_members where visit_id='a0010000-0000-4000-8000-000000000100'::uuid and user_id='a0010000-0000-4000-8000-000000000003'),'early arrival preserves return start and checkout order');

-- Separate short visit for four-hour and legitimate staff-operation checks.
insert into public.visits(id,route_id,created_by,join_code,visit_type,status,started_at,expected_return_at)
select 'a0010000-0000-4000-8000-000000000101',id,'a0010000-0000-4000-8000-000000000001',
  'P0RET2','day_hike','in_progress',now()-interval '1 hour',now()+interval '5 hours'
from public.routes where slug='ascenso-a-la-cima';
insert into public.visit_members(visit_id,user_id,member_role,terms_accepted_at,member_status)
select 'a0010000-0000-4000-8000-000000000101',user_id,member_role,now(),'active'
from public.visit_members where visit_id='a0010000-0000-4000-8000-000000000100';
set local role authenticated;
select pg_temp.authenticate_as(1);
select throws_ok($$select public.complete_my_visit_participation('a0010000-0000-4000-8000-000000000101')$$,'23514','early_return_required','normal return remains blocked before four hours');
select is(pg_temp.sqlstate_from($$select public.staff_register_administrative_group_return('a0010000-0000-4000-8000-000000000101','confirmed_in_person')$$),'42501','tourist cannot use administrative group return');
select pg_temp.authenticate_as(6);
select is(pg_temp.sqlstate_from($$select public.staff_register_administrative_return('a0010000-0000-4000-8000-000000000101','a0010000-0000-4000-8000-000000000001','confirmed_in_person')$$),'42501','manager without return permission cannot confirm arrival');
select is(pg_temp.sqlstate_from($$select public.staff_register_administrative_group_return('a0010000-0000-4000-8000-000000000101','confirmed_in_person')$$),'42501','manager without return permission cannot confirm group');
reset role;
update public.staff_permissions set can_confirm_returns=true where user_id='a0010000-0000-4000-8000-000000000006';
set local role authenticated;
select pg_temp.authenticate_as(6);
select lives_ok($$select public.staff_register_administrative_return('a0010000-0000-4000-8000-000000000101','a0010000-0000-4000-8000-000000000001','confirmed_in_person')$$,'authorized manager can record administrative arrival');
reset role;
update public.staff_permissions set is_active=false where user_id='a0010000-0000-4000-8000-000000000006';
set local role authenticated;
select pg_temp.authenticate_as(6);
select is(pg_temp.sqlstate_from($$select public.staff_register_administrative_group_return('a0010000-0000-4000-8000-000000000101','confirmed_in_person')$$),'42501','deactivated manager cannot confirm group');
select pg_temp.authenticate_as(5);
select lives_ok($$select public.staff_register_administrative_group_return('a0010000-0000-4000-8000-000000000101','confirmed_in_person')$$,'Admin uses legitimate administrative group return');
reset role;
select is((select count(*) from public.visit_members where visit_id='a0010000-0000-4000-8000-000000000101' and checked_out_at is not null and checkout_method='staff'),3::bigint,'staff returns keep checkout timestamps and attribution');
select is((select count(*) from public.audit_logs where target_id='a0010000-0000-4000-8000-000000000101' and action='administrative_group_return_recorded'),1::bigint,'administrative group return remains audited');
select * from finish();
rollback;
