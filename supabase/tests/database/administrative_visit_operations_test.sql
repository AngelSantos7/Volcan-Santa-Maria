begin;

create extension if not exists pgtap with schema extensions;
select plan(20);

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
values
  ('c1000000-0000-4000-8000-000000000001', 'phase2-admin@example.invalid', now(), '{"first_name":"Ana","last_name":"Admin"}'),
  ('c2000000-0000-4000-8000-000000000002', 'phase2-manager@example.invalid', now(), '{"first_name":"Mario","last_name":"Gestor"}'),
  ('c3000000-0000-4000-8000-000000000003', 'phase2-no-permission@example.invalid', now(), '{"first_name":"Nora","last_name":"Gestora"}'),
  ('c4000000-0000-4000-8000-000000000004', 'phase2-tourist@example.invalid', now(), '{"first_name":"Tania","last_name":"Turista"}');

update public.user_roles set role = 'admin' where user_id = 'c1000000-0000-4000-8000-000000000001';
update public.user_roles set role = 'visitor_manager'
where user_id in ('c2000000-0000-4000-8000-000000000002', 'c3000000-0000-4000-8000-000000000003');
insert into public.staff_permissions (
  user_id, is_active, can_view_visitors, can_manage_visits,
  can_confirm_returns, can_register_walk_in_visitors
) values
  ('c2000000-0000-4000-8000-000000000002', true, true, true, true, true),
  ('c3000000-0000-4000-8000-000000000003', true, true, false, false, false);

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

create temporary table phase2_visitors (visitor_id uuid primary key, label text not null);
grant select, insert on phase2_visitors to authenticated;

set local role authenticated;
select pg_temp.authenticate_as('c1000000-0000-4000-8000-000000000001');
select lives_ok($$
  insert into phase2_visitors
  select (result ->> 'visitor_id')::uuid, 'one'
  from public.staff_register_walk_in_visitor(
    'Juan', 'Pérez', 'GT', '1990-01-01', null, '+50255550001',
    'dpi', '1111111111111', 'Eva', 'Pérez', 'Hermana', '+50255550002'
  ) as call(result)
$$, 'an administrator can register a visitor without email');

reset role;
select ok(not exists (
  select 1 from auth.users where id = (select visitor_id from phase2_visitors where label = 'one')
), 'walk-in visitor does not create a fake Auth account');
select is((select registration_origin from public.profiles where id = (select visitor_id from phase2_visitors where label = 'one')), 'administrative', 'walk-in profile records its administrative origin');
select is((select registered_by from public.profiles where id = (select visitor_id from phase2_visitors where label = 'one')), 'c1000000-0000-4000-8000-000000000001'::uuid, 'server records the responsible administrator');

set local role authenticated;
select pg_temp.authenticate_as('c2000000-0000-4000-8000-000000000002');
select lives_ok($$
  insert into phase2_visitors
  select (result ->> 'visitor_id')::uuid, 'two'
  from public.staff_register_walk_in_visitor(
    'María', 'López', 'MX', '1992-02-02', '+525555555555', null,
    'passport', 'MX-PHASE2-2', 'Luis', 'López', 'Padre', '+525555555556'
  ) as call(result)
$$, 'an authorized visitor manager can register a walk-in visitor');
select lives_ok($$
  insert into phase2_visitors
  select (result ->> 'visitor_id')::uuid, 'three'
  from public.staff_register_walk_in_visitor(
    'Carlos', 'Gómez', 'SV', '1994-03-03', '+50370000001', null,
    'passport', 'SV-PHASE2-3', 'Rosa', 'Gómez', 'Madre', '+50370000002'
  ) as call(result)
$$, 'authorized manager can register another group member');

select pg_temp.authenticate_as('c3000000-0000-4000-8000-000000000003');
select is(pg_temp.sqlstate_from($$select public.staff_register_walk_in_visitor('Sin', 'Permiso', 'GT', '1990-01-01', null, null, 'dpi', '2222222222222', 'A', 'B', 'Familiar', '+50255550003')$$), '42501', 'manager without permission cannot register visitors');
select pg_temp.authenticate_as('c4000000-0000-4000-8000-000000000004');
select is(pg_temp.sqlstate_from($$select public.staff_register_walk_in_visitor('Turista', 'Bloqueada', 'GT', '1990-01-01', null, null, 'dpi', '3333333333333', 'A', 'B', 'Familiar', '+50255550004')$$), '42501', 'tourist cannot use administrative registration');

select pg_temp.authenticate_as('c2000000-0000-4000-8000-000000000002');
create temporary table phase2_dashboard_baseline as
select
  (stats ->> 'entries_registered')::integer as entries_registered,
  (stats ->> 'exits_registered')::integer as exits_registered,
  (stats ->> 'ascents_completed')::integer as ascents_completed
from public.get_visitor_dashboard_stats(now() - interval '1 day', now() + interval '1 day') as call(stats);
grant select on phase2_dashboard_baseline to authenticated;
create temporary table phase2_visit as
select result ->> 'visit_id' as visit_id, result ->> 'join_code' as join_code
from public.staff_create_administrative_visit(
  (select array_agg(visitor_id order by label) from phase2_visitors),
  (select visitor_id from phase2_visitors where label = 'one'),
  'day_hike', 'now', null, now() + interval '8 hours', false, null
) as call(result);
grant select on phase2_visit to authenticated;

reset role;
select is((select creation_origin from public.visits where id = (select visit_id::uuid from phase2_visit)), 'administrative', 'administrative ascent records its origin');
select is((select count(*) from public.visit_members where visit_id = (select visit_id::uuid from phase2_visit)), 3::bigint, 'group ascent stores three individual participants');
select is((select count(*) from public.audit_logs where action = 'administrative_visit_member_added' and metadata ->> 'visit_id' = (select visit_id from phase2_visit)), 3::bigint, 'adding administrative participants creates audit records');

set local role authenticated;
select pg_temp.authenticate_as('c2000000-0000-4000-8000-000000000002');
select lives_ok(format(
  $$select public.staff_register_administrative_return(%L, %L, 'confirmed_in_person', null, null)$$,
  (select visit_id from phase2_visit), (select visitor_id from phase2_visitors where label = 'one')
), 'administrator can confirm one participant return');
reset role;
select is((select member_status::text from public.visit_members where visit_id = (select visit_id::uuid from phase2_visit) and user_id = (select visitor_id from phase2_visitors where label = 'two')), 'active', 'individual return does not change another participant');
select is((select status::text from public.visits where id = (select visit_id::uuid from phase2_visit)), 'in_progress', 'group remains in progress while participants are still out');

set local role authenticated;
select pg_temp.authenticate_as('c2000000-0000-4000-8000-000000000002');
select lives_ok(format(
  $$select public.staff_register_administrative_group_return(%L, 'confirmed_in_person', 'Grupo verificado', null)$$,
  (select visit_id from phase2_visit)
), 'confirmed whole-group return completes remaining participants');
reset role;
select is((select status::text from public.visits where id = (select visit_id::uuid from phase2_visit)), 'completed', 'group is complete only after every participant reaches a terminal status');
select is((select count(*) from public.visit_members where visit_id = (select visit_id::uuid from phase2_visit) and member_status = 'completed'), 3::bigint, 'all three group members retain individual completed states');
select is((select count(*) from public.audit_logs where action = 'administrative_individual_return_recorded' and metadata ->> 'visit_id' = (select visit_id from phase2_visit)), 3::bigint, 'each administrative return is audited');
select is((select count(*) from public.audit_logs where action = 'administrative_group_return_recorded' and target_id = (select visit_id from phase2_visit)), 1::bigint, 'whole-group confirmation creates a group audit event');

set local role authenticated;
select pg_temp.authenticate_as('c2000000-0000-4000-8000-000000000002');
select results_eq(
  $$
    select
      (stats ->> 'entries_registered')::integer - baseline.entries_registered,
      (stats ->> 'exits_registered')::integer - baseline.exits_registered,
      (stats ->> 'ascents_completed')::integer - baseline.ascents_completed
    from public.get_visitor_dashboard_stats(now() - interval '1 day', now() + interval '1 day') as call(stats)
    cross join phase2_dashboard_baseline as baseline
  $$,
  $$ values (3, 3, 1) $$,
  'dashboard counts one ascent and three individual entries and exits without duplication'
);

reset role;
select * from finish();
rollback;
