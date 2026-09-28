begin;

create extension if not exists pgtap with schema extensions;
select plan(18);

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('d1000000-0000-4000-8000-000000000001', 'phase3-admin@example.invalid', now(), '{"first_name":"Ada","last_name":"Admin"}'),
  ('d2000000-0000-4000-8000-000000000002', 'phase3-manager@example.invalid', now(), '{"first_name":"Gina","last_name":"Gestora"}'),
  ('d3000000-0000-4000-8000-000000000003', 'phase3-tourist1@example.invalid', now(), '{"first_name":"Luz","last_name":"Lider"}'),
  ('d4000000-0000-4000-8000-000000000004', 'phase3-tourist2@example.invalid', now(), '{"first_name":"Mia","last_name":"Miembro"}');

update public.user_roles set role = 'admin' where user_id = 'd1000000-0000-4000-8000-000000000001';
update public.user_roles set role = 'visitor_manager' where user_id = 'd2000000-0000-4000-8000-000000000002';
insert into public.staff_permissions (user_id, is_active, can_view_visitors, can_export_reports)
values ('d2000000-0000-4000-8000-000000000002', true, true, false);

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

select ok(public.is_supported_country_code('GT'), 'Guatemala is a supported country code');
select ok(not public.is_supported_country_code('ZZ'), 'a nonexistent nationality is rejected');

set local role authenticated;
select pg_temp.authenticate_as('d1000000-0000-4000-8000-000000000001');

select lives_ok($$
  select public.staff_register_walk_in_visitor(
    'Solo', 'Alternativo', 'MX', '1990-01-01', null, '+525555555555',
    'other', 'Licencia consular', '0000456', 'Eva', 'Alternativo', 'Hermana', null
  )
$$, 'walk-in registration accepts only an alternate phone and another document type');

select is(
  pg_temp.sqlstate_from($$
    select public.staff_register_walk_in_visitor(
      'Sin', 'Telefono', 'GT', '1990-01-01', null, null,
      'passport', null, 'PHASE3-NO-PHONE', 'Eva', 'Contacto', 'Hermana', null
    )
  $$),
  '22023',
  'the backend rejects a walk-in visitor when all three phones are empty'
);

select is(
  pg_temp.sqlstate_from($$
    select public.staff_register_walk_in_visitor(
      'Pais', 'Invalido', 'ZZ', '1990-01-01', '+50255555555', null,
      'passport', null, 'PHASE3-BAD-COUNTRY', 'Eva', 'Contacto', 'Hermana', null
    )
  $$),
  '22023',
  'the backend rejects a nonexistent nationality'
);

create temporary table phase3_visit as
select (result ->> 'visit_id')::uuid as visit_id
from public.staff_create_administrative_visit(
  array['d3000000-0000-4000-8000-000000000003'::uuid, 'd4000000-0000-4000-8000-000000000004'::uuid],
  'd3000000-0000-4000-8000-000000000003', 'day_hike', 'now', null,
  now() + interval '8 hours', false, null
) as call(result);
grant select on phase3_visit to authenticated;

select pg_temp.authenticate_as('d3000000-0000-4000-8000-000000000003');
select lives_ok(format($$select public.complete_my_visit_participation(%L)$$, (select visit_id from phase3_visit)), 'leader of an administratively created ascent can finish normally');
select lives_ok(format($$select public.complete_my_visit_participation(%L)$$, (select visit_id from phase3_visit)), 'normal completion is idempotent');

reset role;
select is((select member_status::text from public.visit_members where visit_id = (select visit_id from phase3_visit) and user_id = 'd3000000-0000-4000-8000-000000000003'), 'completed', 'only the completing participant becomes completed');
select is((select member_status::text from public.visit_members where visit_id = (select visit_id from phase3_visit) and user_id = 'd4000000-0000-4000-8000-000000000004'), 'active', 'another group participant remains active');
select is((select status::text from public.visits where id = (select visit_id from phase3_visit)), 'in_progress', 'the group remains active while one participant is still out');

set local role authenticated;
select pg_temp.authenticate_as('d3000000-0000-4000-8000-000000000003');
select is((select count(*) from public.get_my_active_group_visit()), 0::bigint, 'completed participant is no longer blocked by the active group');
select pg_temp.authenticate_as('d4000000-0000-4000-8000-000000000004');
select lives_ok(format($$select public.complete_my_visit_participation(%L)$$, (select visit_id from phase3_visit)), 'the remaining participant can finish independently');

reset role;
select is((select status::text from public.visits where id = (select visit_id from phase3_visit)), 'completed', 'the ascent completes when all participants are terminal');

set local role authenticated;
select pg_temp.authenticate_as('d3000000-0000-4000-8000-000000000003');
select results_eq(
  $$select creation_origin, completion_method from public.get_my_visit_history(10, 0) where visit_id = (select visit_id from phase3_visit)$$,
  $$values ('administrative'::text, 'normal'::text)$$,
  'history preserves administrative origin and normal tourist completion separately'
);

select pg_temp.authenticate_as('d2000000-0000-4000-8000-000000000002');
select is(pg_temp.sqlstate_from($$select public.staff_generate_visitor_report(now() - interval '1 day', now() + interval '1 day', 'detailed')$$), '42501', 'manager without report permission cannot generate a report');

select pg_temp.authenticate_as('d1000000-0000-4000-8000-000000000001');
create temporary table phase3_report as select public.staff_generate_visitor_report(now() - interval '1 day', now() + interval '1 day', 'detailed') as payload;
grant select on phase3_report to authenticated;
select ok((select payload ->> 'time_zone' = 'America/Guatemala' and jsonb_array_length(payload -> 'rows') >= 2 from phase3_report), 'authorized detailed report returns operational rows in the required time zone');
select ok((select payload::text !~ '(document_number|date_of_birth|emergency_contact|phone|email)' from phase3_report), 'report payload excludes sensitive fields');
reset role;
select is((select count(*) from public.audit_logs where action = 'visitor_report_generated' and actor_user_id = 'd1000000-0000-4000-8000-000000000001'), 1::bigint, 'report generation is audited once');
select * from finish();
rollback;
