begin;

create extension if not exists pgtap with schema extensions;
select plan(17);

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
values
  ('b1000000-0000-4000-8000-000000000001', 'admin@example.invalid', now(), '{"first_name":"Ada","last_name":"Admin"}'),
  ('b2000000-0000-4000-8000-000000000002', 'manager@example.invalid', now(), '{"first_name":"Gina","last_name":"Gestora"}'),
  ('b3000000-0000-4000-8000-000000000003', 'inactive@example.invalid', now(), '{"first_name":"Inés","last_name":"Inactiva"}'),
  ('b4000000-0000-4000-8000-000000000004', 'tourist@example.invalid', now(), '{"first_name":"Tomás","last_name":"Turista"}'),
  ('b5000000-0000-4000-8000-000000000005', 'visitor1@example.invalid', now(), '{"first_name":"Uno","last_name":"Visitante"}'),
  ('b6000000-0000-4000-8000-000000000006', 'visitor2@example.invalid', now(), '{"first_name":"Dos","last_name":"Visitante"}'),
  ('b7000000-0000-4000-8000-000000000007', 'visitor3@example.invalid', now(), '{"first_name":"Tres","last_name":"Visitante"}'),
  ('b8000000-0000-4000-8000-000000000008', 'visitor4@example.invalid', now(), '{"first_name":"Cuatro","last_name":"Visitante"}'),
  ('b9000000-0000-4000-8000-000000000009', 'visitor5@example.invalid', now(), '{"first_name":"Cinco","last_name":"Visitante"}'),
  ('ba000000-0000-4000-8000-000000000010', 'visitor6@example.invalid', now(), '{"first_name":"Seis","last_name":"Visitante"}'),
  ('bb000000-0000-4000-8000-000000000011', 'withdrawn@example.invalid', now(), '{"first_name":"Siete","last_name":"Retirado"}');

update public.user_roles set role = 'admin' where user_id = 'b1000000-0000-4000-8000-000000000001';
update public.user_roles set role = 'visitor_manager' where user_id in (
  'b2000000-0000-4000-8000-000000000002',
  'b3000000-0000-4000-8000-000000000003'
);

insert into public.staff_permissions (user_id, is_active, can_view_visitors)
values
  ('b2000000-0000-4000-8000-000000000002', true, true),
  ('b3000000-0000-4000-8000-000000000003', false, true);

update public.profiles
set nationality_country_code = 'GT', date_of_birth = '1990-01-01',
  phone = '+50255550001', document_type = 'dpi', document_number = '1234567890101'
where id = 'b5000000-0000-4000-8000-000000000005';

insert into public.emergency_contacts (user_id, first_name, last_name, relationship, phone)
values ('b5000000-0000-4000-8000-000000000005', 'Eva', 'Contacto', 'Familiar', '+50255550002');

insert into public.visits (
  id, route_id, created_by, join_code, visit_type, status,
  started_at, expected_return_at, has_local_guide
)
select
  'bc000000-0000-4000-8000-000000000012', route.id,
  'b5000000-0000-4000-8000-000000000005', 'ADMIN1', 'day_hike', 'in_progress',
  '2090-09-18 08:00:00-06', '2090-09-18 14:00:00-06', false
from public.routes as route where route.slug = 'ascenso-a-la-cima';

insert into public.visit_members (
  visit_id, user_id, member_role, terms_accepted_at, joined_at, member_status,
  return_started_at, exit_reason, checked_out_at, checkout_method
)
values
  ('bc000000-0000-4000-8000-000000000012', 'b5000000-0000-4000-8000-000000000005', 'leader', '2090-09-18 07:00:00-06', '2090-09-18 07:00:00-06', 'active', null, null, null, null),
  ('bc000000-0000-4000-8000-000000000012', 'b6000000-0000-4000-8000-000000000006', 'member', '2090-09-18 07:00:00-06', '2090-09-18 07:00:00-06', 'active', null, null, null, null),
  ('bc000000-0000-4000-8000-000000000012', 'b7000000-0000-4000-8000-000000000007', 'member', '2090-09-18 07:00:00-06', '2090-09-18 07:00:00-06', 'active', null, null, null, null),
  ('bc000000-0000-4000-8000-000000000012', 'b8000000-0000-4000-8000-000000000008', 'member', '2090-09-18 07:00:00-06', '2090-09-18 07:00:00-06', 'active', null, null, null, null),
  ('bc000000-0000-4000-8000-000000000012', 'b9000000-0000-4000-8000-000000000009', 'member', '2090-09-18 07:00:00-06', '2090-09-18 07:00:00-06', 'active', null, null, null, null),
  ('bc000000-0000-4000-8000-000000000012', 'ba000000-0000-4000-8000-000000000010', 'member', '2090-09-18 07:00:00-06', '2090-09-18 07:00:00-06', 'returned_early', '2090-09-18 09:00:00-06', 'personal_decision', '2090-09-18 09:30:00-06', 'self'),
  ('bc000000-0000-4000-8000-000000000012', 'bb000000-0000-4000-8000-000000000011', 'member', '2090-09-18 07:00:00-06', '2090-09-18 07:00:00-06', 'withdrawn_before_start', null, null, null, null);

create temporary table admin_test_baseline (current_on_route integer not null);
insert into admin_test_baseline
select count(*)::integer
from public.visit_members as member
join public.visits as visit on visit.id = member.visit_id
where visit.status = 'in_progress'
  and visit.id <> 'bc000000-0000-4000-8000-000000000012'
  and member.member_status in ('active', 'returning_early');
grant select on admin_test_baseline to authenticated;

create function pg_temp.authenticate_as(requested_user_id uuid)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub', requested_user_id, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', requested_user_id::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
end;
$$;

create function pg_temp.sqlstate_from(command text)
returns text language plpgsql as $$
begin execute command; return null; exception when others then return sqlstate; end;
$$;

select ok(exists (
  select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
  where t.typname = 'app_role' and e.enumlabel = 'visitor_manager'
), 'app_role includes visitor_manager');

set local role authenticated;
select pg_temp.authenticate_as('b4000000-0000-4000-8000-000000000004');
select is(pg_temp.sqlstate_from($$select public.get_visitor_dashboard_stats(now() - interval '1 day', now() + interval '1 day')$$), '42501', 'tourist cannot access administrative statistics');

select pg_temp.authenticate_as('b3000000-0000-4000-8000-000000000003');
select is(pg_temp.sqlstate_from($$select * from public.staff_search_visitors(null, 'all', null, null, 50, 0)$$), '42501', 'inactive visitor manager cannot access administrative RPCs');

select pg_temp.authenticate_as('b2000000-0000-4000-8000-000000000002');
select results_eq(
  $$
    select group_type, participant_count
    from public.staff_search_visitors(
      'Uno', 'all',
      '2090-09-18 00:00:00-06', '2090-09-19 00:00:00-06',
      50, 0
    )
  $$,
  $$ values ('group'::text, 6::bigint) $$,
  'name search preserves the real six-person group size'
);
select is(pg_temp.sqlstate_from($$select public.staff_get_visitor_sensitive_details('b5000000-0000-4000-8000-000000000005', false)$$), '42501', 'manager without permission cannot see sensitive data');
select is(pg_temp.sqlstate_from($$select public.admin_update_staff_permissions('b2000000-0000-4000-8000-000000000002', '{"can_view_visitors":false}')$$), '42501', 'only an admin can modify permissions');
select is(pg_temp.sqlstate_from($$select public.admin_set_user_role('b2000000-0000-4000-8000-000000000002', 'admin')$$), '42501', 'manager cannot convert users to admin');

reset role;
update public.staff_permissions set can_view_sensitive_data = true where user_id = 'b2000000-0000-4000-8000-000000000002';
set local role authenticated;
select pg_temp.authenticate_as('b2000000-0000-4000-8000-000000000002');
select lives_ok($$select public.staff_get_visitor_sensitive_details('b5000000-0000-4000-8000-000000000005', false)$$, 'manager with permission can see sensitive data');
select is(pg_temp.sqlstate_from($$select public.staff_get_visitor_sensitive_details('b1000000-0000-4000-8000-000000000001', false)$$), 'P0002', 'sensitive visitor RPC rejects a staff account without visit membership');
reset role;
select is((select count(*) from public.audit_logs where actor_user_id = 'b2000000-0000-4000-8000-000000000002' and action = 'sensitive_data_viewed'), 1::bigint, 'sensitive access creates an audit record');

set local role authenticated;
select pg_temp.authenticate_as('b1000000-0000-4000-8000-000000000001');
select lives_ok($$select public.staff_get_visitor_sensitive_details('b5000000-0000-4000-8000-000000000005', true)$$, 'admin can see complete sensitive data');
select lives_ok($$select public.admin_update_staff_permissions('b2000000-0000-4000-8000-000000000002', '{"can_view_identity_documents":true}')$$, 'admin can modify manager permissions');

select is(
  (public.get_visitor_dashboard_stats('2090-09-18 00:00:00-06', '2090-09-19 00:00:00-06') ->> 'entries_registered')::integer,
  6,
  'withdrawn_before_start is excluded from visitor entries'
);
select is(
  (public.get_visitor_dashboard_stats('2090-09-18 00:00:00-06', '2090-09-19 00:00:00-06') ->> 'ascents_started')::integer,
  1,
  'a group of six is one ascent'
);
select is(
  (public.get_visitor_dashboard_stats('2090-09-18 00:00:00-06', '2090-09-19 00:00:00-06') ->> 'entries_registered')::integer,
  6,
  'a group of six is six visitors'
);
select is(
  (public.get_visitor_dashboard_stats('2090-09-18 00:00:00-06', '2090-09-19 00:00:00-06') ->> 'currently_on_route')::integer,
  (select current_on_route + 5 from admin_test_baseline),
  'checked-out early return is not currently on route'
);
select pg_temp.authenticate_as('b2000000-0000-4000-8000-000000000002');
select lives_ok($$select public.staff_get_visitor_sensitive_details('b5000000-0000-4000-8000-000000000005', true)$$, 'admin permission change is persisted and usable through the protected RPC');

reset role;
select * from finish();
rollback;
