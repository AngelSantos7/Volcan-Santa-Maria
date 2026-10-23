begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data)
select ('a0020000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
  'p0-sensitive-' || n || '@example.invalid',now(),'{"date_of_birth":"1990-01-01"}'::jsonb
from generate_series(1,6) n;
update public.user_roles set role='visitor_manager' where user_id='a0020000-0000-4000-8000-000000000004';
update public.user_roles set role='admin' where user_id='a0020000-0000-4000-8000-000000000005';
insert into public.staff_permissions(user_id,is_active,can_view_sensitive_data)
values ('a0020000-0000-4000-8000-000000000004',true,true);
update public.profiles set phone='+50255551001',alternate_phone='+50255551002',
  document_type='passport',document_number='P0-SYNTHETIC-DOCUMENT'
where id in ('a0020000-0000-4000-8000-000000000001','a0020000-0000-4000-8000-000000000002');
insert into public.emergency_contacts(user_id,first_name,last_name,relationship,phone)
select id,'Synthetic','Contact','sibling','+50255551003' from public.profiles
where id in ('a0020000-0000-4000-8000-000000000001','a0020000-0000-4000-8000-000000000002');
insert into public.visits(id,route_id,created_by,join_code,visit_type,status,started_at,expected_return_at,completed_at)
select ('a0020000-0000-4000-8000-' || lpad((100+n)::text,12,'0'))::uuid,r.id,
  ('a0020000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,'P0SEN' || n,'day_hike',
  case when n=1 then 'in_progress'::public.visit_status else 'completed'::public.visit_status end,
  now()-interval '5 hours',now()+interval '1 hour',case when n=2 then now() end
from public.routes r cross join generate_series(1,2) n where r.slug='ascenso-a-la-cima';
insert into public.visit_members(visit_id,user_id,member_role,terms_accepted_at,member_status,checked_out_at,checkout_method)
select id,created_by,'leader',now(),case when status='completed' then 'completed'::public.visit_member_status else 'active'::public.visit_member_status end,
  completed_at,case when status='completed' then 'self' end
from public.visits where id in ('a0020000-0000-4000-8000-000000000101','a0020000-0000-4000-8000-000000000102');

create function pg_temp.authenticate_as(n integer) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated',
    'sub','a0020000-0000-4000-8000-' || lpad(n::text,12,'0'))::text,true);
end;
$$;
create function pg_temp.sqlstate_from(command text) returns text language plpgsql as $$
begin
  execute command;
  raise exception using errcode='Z0001',message='rollback successful probe';
exception when sqlstate 'Z0001' then return 'allowed';
when others then return sqlstate;
end;
$$;

select ok(not has_function_privilege('anon','public.staff_get_visitor_sensitive_details(uuid,boolean)','EXECUTE'),'anon has no legacy sensitive EXECUTE');
select ok(has_function_privilege('authenticated','public.staff_get_visitor_sensitive_details(uuid,boolean)','EXECUTE'),'legacy signature remains available with authorization inside RPC');
set local role anon;
select is(pg_temp.sqlstate_from($$select public.staff_get_visitor_sensitive_details('a0020000-0000-4000-8000-000000000002',false)$$),'42501','anon direct sensitive call denied');
select is(pg_temp.sqlstate_from($$select public.staff_get_operational_contacts('a0020000-0000-4000-8000-000000000001')$$),'42501','anon direct operational call denied');
reset role;
set local role authenticated;
select pg_temp.authenticate_as(4);
select is(pg_temp.sqlstate_from($$select public.staff_get_visitor_sensitive_details('a0020000-0000-4000-8000-000000000002',false)$$),'42501','SEC-002 original exploit: legacy-only manager cannot read inactive visitor contacts');
select is(pg_temp.sqlstate_from($$select public.staff_get_visitor_sensitive_details('a0020000-0000-4000-8000-000000000001',false)$$),'42501','legacy-only manager cannot read active visitor contacts either');
select is(pg_temp.sqlstate_from($$select public.staff_get_operational_contacts('a0020000-0000-4000-8000-000000000001')$$),'42501','current API also rejects legacy-only permission');
reset role;
update public.staff_permissions set can_view_sensitive_data=false where user_id='a0020000-0000-4000-8000-000000000004';
set local role authenticated;
select pg_temp.authenticate_as(4);
select is(pg_temp.sqlstate_from($$select public.staff_get_visitor_sensitive_details('a0020000-0000-4000-8000-000000000001',false)$$),'42501','manager without permissions denied');
select pg_temp.authenticate_as(5);
select lives_ok($$select public.admin_update_staff_permissions_v2('a0020000-0000-4000-8000-000000000004','{"can_view_emergency_contacts":true}')$$,'Admin grants specific contacts permission through current API');
reset role;
-- Give both permissions here: a generic-permission denial must not mask a
-- missing operational-window check in either implementation.
update public.staff_permissions set can_view_sensitive_data=true where user_id='a0020000-0000-4000-8000-000000000004';
set local role authenticated;
select pg_temp.authenticate_as(4);
select is(pg_temp.sqlstate_from($$select public.staff_get_visitor_sensitive_details('a0020000-0000-4000-8000-000000000002',false)$$),'42501','correct permission cannot bypass inactive visitor window');
select is(pg_temp.sqlstate_from($$select public.staff_get_operational_contacts('a0020000-0000-4000-8000-000000000002')$$),'42501','current API has same inactive visitor denial');
select is(pg_temp.sqlstate_from($$select public.staff_get_visitor_sensitive_details('a0020000-0000-4000-8000-000000000003',false)$$),'P0002','legacy visitor scope still excludes Auth profile without visits');
reset role;
update public.staff_permissions set can_view_sensitive_data=false where user_id='a0020000-0000-4000-8000-000000000004';
set local role authenticated;
select pg_temp.authenticate_as(4);
create temporary table p0_sensitive_payload(payload jsonb);
select lives_ok($$insert into p0_sensitive_payload select public.staff_get_visitor_sensitive_details('a0020000-0000-4000-8000-000000000001',false) payload$$,'specific contacts permission and active context allow legacy API without generic permission');
select is((select payload->>'phone' from p0_sensitive_payload),'+50255551001','allowed legacy response retains visitor phone');
select is((select payload#>>'{emergency_contact,phone}' from p0_sensitive_payload),'+50255551003','allowed legacy response retains emergency phone');
select ok((select payload->>'document_number' is null and payload->>'document_type' is null from p0_sensitive_payload),'contact permission does not disclose identity documents');
select is((select payload->'date_of_birth' from p0_sensitive_payload),'null'::jsonb,'contact-only permission returns JSON null for date of birth');
select is(pg_temp.sqlstate_from($$select public.staff_get_visitor_sensitive_details('a0020000-0000-4000-8000-000000000001',true)$$),'42501','legacy include-documents still requires identity permission');
select is(pg_temp.sqlstate_from($$select public.staff_get_identity_details('a0020000-0000-4000-8000-000000000001')$$),'42501','dedicated identity API rejects contact-only permission');
reset role;
select is((select count(*) from public.audit_logs where actor_user_id='a0020000-0000-4000-8000-000000000004' and target_id='a0020000-0000-4000-8000-000000000001' and action='emergency_contact_viewed'),1::bigint,'allowed legacy call uses current contact audit');
select is((select count(*) from public.audit_logs where actor_user_id='a0020000-0000-4000-8000-000000000004' and target_id='a0020000-0000-4000-8000-000000000001' and action='sensitive_data_viewed'),1::bigint,'legacy audit event is preserved');
select is((select count(*) from public.audit_logs where actor_user_id='a0020000-0000-4000-8000-000000000004' and action='identity_document_viewed'),0::bigint,'contact-only access creates no identity access event');

set local role authenticated;
select pg_temp.authenticate_as(4);
select is(public.staff_get_visitor_sensitive_details('a0020000-0000-4000-8000-000000000001')->'date_of_birth','null'::jsonb,'default include-documents does not expose date of birth');
select is(public.staff_get_visitor_sensitive_details('a0020000-0000-4000-8000-000000000001',null)->'date_of_birth','null'::jsonb,'NULL include-documents does not expose date of birth');
reset role;
update public.staff_permissions set can_view_identity_documents=true where user_id='a0020000-0000-4000-8000-000000000004';
set local role authenticated;
select pg_temp.authenticate_as(4);
select is(public.staff_get_visitor_sensitive_details('a0020000-0000-4000-8000-000000000001',true)->>'date_of_birth','1990-01-01','manager with identity permission can explicitly request date of birth');
reset role;
update public.staff_permissions set can_view_identity_documents=false where user_id='a0020000-0000-4000-8000-000000000004';

update public.staff_permissions set is_active=false where user_id='a0020000-0000-4000-8000-000000000004';
set local role authenticated;
select pg_temp.authenticate_as(4);
select is(pg_temp.sqlstate_from($$select public.staff_get_visitor_sensitive_details('a0020000-0000-4000-8000-000000000001',false)$$),'42501','disabled manager denied by legacy API');
select is(pg_temp.sqlstate_from($$select public.staff_get_operational_contacts('a0020000-0000-4000-8000-000000000001')$$),'42501','disabled manager denied by current API');
reset role;
update public.staff_permissions set is_active=true where user_id='a0020000-0000-4000-8000-000000000004';
update public.visit_members set member_status='returning_early',return_started_at=now(),exit_reason='weather'
where visit_id='a0020000-0000-4000-8000-000000000101';
set local role authenticated;
select pg_temp.authenticate_as(4);
select lives_ok($$select public.staff_get_visitor_sensitive_details('a0020000-0000-4000-8000-000000000001',false)$$,'pending early return remains operational for contacts');
reset role;
update public.visits set expected_return_at=now()-interval '30 minutes' where id='a0020000-0000-4000-8000-000000000101';
set local role authenticated;
select pg_temp.authenticate_as(4);
select lives_ok($$select public.staff_get_visitor_sensitive_details('a0020000-0000-4000-8000-000000000001',null)$$,'overdue pending return allows contacts with NULL include-documents treated as false');
select pg_temp.authenticate_as(1);
select public.confirm_my_early_checkout('a0020000-0000-4000-8000-000000000101');
select pg_temp.authenticate_as(4);
select is(pg_temp.sqlstate_from($$select public.staff_get_visitor_sensitive_details('a0020000-0000-4000-8000-000000000001',false)$$),'42501','manager loses contact access immediately after confirmed arrival');

select pg_temp.authenticate_as(5);
select lives_ok($$create temporary table p0_admin_sensitive_payload as select public.staff_get_visitor_sensitive_details('a0020000-0000-4000-8000-000000000002',true) payload$$,'Admin exception allows inactive visitor contacts and identity');
select is((select payload->>'date_of_birth' from p0_admin_sensitive_payload),'1990-01-01','Admin explicit identity request retains date of birth');
select lives_ok($$select public.admin_update_staff_permissions('a0020000-0000-4000-8000-000000000004','{"can_view_identity_documents":true}')$$,'historical permission setter preserves independent identity grant');
select lives_ok($$select public.admin_update_staff_permissions_v2('a0020000-0000-4000-8000-000000000004','{"can_view_emergency_contacts":false}')$$,'Admin can revoke contact permission without revoking identity');
select pg_temp.authenticate_as(4);
select is(public.staff_get_identity_details('a0020000-0000-4000-8000-000000000002')->>'document_number','P0-SYNTHETIC-DOCUMENT','identity-only permission works outside contact operational window');
select is(pg_temp.sqlstate_from($$select public.staff_get_visitor_sensitive_details('a0020000-0000-4000-8000-000000000002',true)$$),'42501','identity permission cannot grant contact access through combined legacy API');
select is(pg_temp.sqlstate_from($$select public.admin_update_staff_permissions_v2('a0020000-0000-4000-8000-000000000004','{"can_view_emergency_contacts":true}')$$),'42501','manager cannot self-grant specific permission');

select pg_temp.authenticate_as(6);
select is(pg_temp.sqlstate_from($$select public.staff_get_visitor_sensitive_details('a0020000-0000-4000-8000-000000000002',false)$$),'42501','external tourist denied by legacy API');
select is(pg_temp.sqlstate_from($$select public.staff_get_operational_contacts('a0020000-0000-4000-8000-000000000002')$$),'42501','external tourist denied by current contact API');
select is(pg_temp.sqlstate_from($$select public.staff_get_identity_details('a0020000-0000-4000-8000-000000000002')$$),'42501','external tourist denied by identity API');
select pg_temp.authenticate_as(1);
select is(pg_temp.sqlstate_from($$select public.staff_get_visitor_sensitive_details('a0020000-0000-4000-8000-000000000001',false)$$),'42501','tourist leader cannot use staff API even for self');
reset role;
select is((select count(*) from public.audit_logs where actor_user_id='a0020000-0000-4000-8000-000000000005' and target_id='a0020000-0000-4000-8000-000000000002' and action='emergency_contact_viewed'),1::bigint,'Admin exception contact access is audited');
select is((select count(*) from public.audit_logs where actor_user_id='a0020000-0000-4000-8000-000000000005' and target_id='a0020000-0000-4000-8000-000000000002' and action='identity_document_viewed'),1::bigint,'Admin identity access is audited separately');
select ok(not exists(select 1 from public.audit_logs
  where actor_user_id in ('a0020000-0000-4000-8000-000000000004','a0020000-0000-4000-8000-000000000005')
  and (metadata::text like '%+5025555100%' or metadata::text like '%P0-SYNTHETIC-DOCUMENT%'
    or metadata ?| array['phone','alternate_phone','emergency_contact','document_number','password','token'])),
  'audit metadata contains no complete contact, document, password or token');
select * from finish();
rollback;
