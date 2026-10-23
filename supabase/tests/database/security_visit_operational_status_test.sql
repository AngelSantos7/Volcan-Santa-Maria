begin;

create extension if not exists pgtap with schema extensions;

select plan(13);

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
values
  ('d7000000-0000-4000-8000-000000000001', 'sec007-leader@example.invalid', now(), '{"date_of_birth":"1990-01-01","first_name":"Lider","last_name":"SEC007"}'),
  ('d7000000-0000-4000-8000-000000000002', 'sec007-member@example.invalid', now(), '{"date_of_birth":"1990-01-01","first_name":"Miembro","last_name":"SEC007"}'),
  ('d7000000-0000-4000-8000-000000000003', 'sec007-outsider@example.invalid', now(), '{"date_of_birth":"1990-01-01","first_name":"Externo","last_name":"SEC007"}'),
  ('d7000000-0000-4000-8000-000000000004', 'sec007-manager@example.invalid', now(), '{"date_of_birth":"1990-01-01","first_name":"Gestor","last_name":"SEC007"}'),
  ('d7000000-0000-4000-8000-000000000005', 'sec007-unrelated-manager@example.invalid', now(), '{"date_of_birth":"1990-01-01","first_name":"Galeria","last_name":"SEC007"}'),
  ('d7000000-0000-4000-8000-000000000006', 'sec007-admin@example.invalid', now(), '{"date_of_birth":"1990-01-01","first_name":"Admin","last_name":"SEC007"}');

update public.profiles
set
  date_of_birth = '1990-01-01',
  sex = 'male',
  nationality_country_code = 'GT',
  department_code = 'guatemala',
  phone = '+50255550000',
  document_type = 'passport',
  document_number = 'SEC007-' || pg_catalog.right(id::text, 1)
where id::text like 'd7000000-0000-4000-8000-00000000000%';

insert into public.emergency_contacts (user_id, first_name, last_name, relationship, phone)
values
  ('d7000000-0000-4000-8000-000000000001', 'Contacto', 'Lider', 'family', '+50255550001'),
  ('d7000000-0000-4000-8000-000000000002', 'Contacto', 'Miembro', 'family', '+50255550002');

update public.user_roles
set role = 'visitor_manager'
where user_id in (
  'd7000000-0000-4000-8000-000000000004',
  'd7000000-0000-4000-8000-000000000005'
);

update public.user_roles
set role = 'admin'
where user_id = 'd7000000-0000-4000-8000-000000000006';

insert into public.staff_permissions (
  user_id,
  is_active,
  can_view_visitors,
  can_manage_gallery
)
values
  ('d7000000-0000-4000-8000-000000000004', true, true, false),
  ('d7000000-0000-4000-8000-000000000005', true, false, true);

create temporary table sec007_visit (visit_id uuid primary key, join_code text not null);
grant all on table pg_temp.sec007_visit to authenticated;

create function pg_temp.authenticate_as(requested_user_id uuid)
returns void
language plpgsql
as $$
begin
  perform set_config(
    'request.jwt.claims',
    pg_catalog.jsonb_build_object('sub', requested_user_id::text, 'role', 'authenticated')::text,
    true
  );
  perform set_config('request.jwt.claim.sub', requested_user_id::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
end;
$$;

create function pg_temp.sqlstate_from(command text)
returns text
language plpgsql
as $$
begin
  execute command;
  return null;
exception
  when others then
    return sqlstate;
end;
$$;

select ok(
  not has_function_privilege('anon', 'public.visit_operational_status(uuid)', 'EXECUTE'),
  'anonymous users cannot execute the operational status RPC'
);

select ok(
  has_function_privilege('authenticated', 'public.visit_operational_status(uuid)', 'EXECUTE'),
  'authenticated users reach the visit-scoped authorization check'
);

set local role authenticated;
select pg_temp.authenticate_as('d7000000-0000-4000-8000-000000000001');

insert into pg_temp.sec007_visit (visit_id, join_code)
select visit_id, join_code
from public.create_group_visit(
  'day_hike',
  pg_catalog.now() + interval '1 hour',
  pg_catalog.now() + interval '5 hours',
  false,
  null,
  true,
  true
);

select is(
  public.visit_operational_status((select visit_id from pg_temp.sec007_visit)),
  'scheduled',
  'visit leader can read the derived status'
);

select pg_temp.authenticate_as('d7000000-0000-4000-8000-000000000002');
select public.join_group_visit((select join_code from pg_temp.sec007_visit), true);

select is(
  public.visit_operational_status((select visit_id from pg_temp.sec007_visit)),
  'scheduled',
  'visit member can read the derived status'
);

select pg_temp.authenticate_as('d7000000-0000-4000-8000-000000000003');

select is(
  pg_temp.sqlstate_from(format(
    'select public.visit_operational_status(%L::uuid)',
    (select visit_id from pg_temp.sec007_visit)
  )),
  '42501',
  'unrelated tourist cannot read a known visit UUID'
);

select is(
  pg_temp.sqlstate_from(
    $$select public.visit_operational_status('d7000000-0000-4000-8000-000000000099'::uuid)$$
  ),
  '42501',
  'unrelated tourist receives the same denial for an unknown UUID'
);

select pg_temp.authenticate_as('d7000000-0000-4000-8000-000000000005');

select is(
  pg_temp.sqlstate_from(format(
    'select public.visit_operational_status(%L::uuid)',
    (select visit_id from pg_temp.sec007_visit)
  )),
  '42501',
  'gallery-only manager has no operational visit access'
);

select pg_temp.authenticate_as('d7000000-0000-4000-8000-000000000004');

select is(
  public.visit_operational_status((select visit_id from pg_temp.sec007_visit)),
  'scheduled',
  'active manager with visitor access can read the derived status'
);

select results_eq(
  $$
    select visit_status
    from public.staff_list_ascents('scheduled', 10, 'SEC007')
    where visit_id = (select visit_id from pg_temp.sec007_visit)
  $$,
  $$ values ('scheduled'::text) $$,
  'authorized staff ascent listing still consumes the protected helper'
);

select lives_ok(
  $$select public.get_operational_dashboard()$$,
  'authorized operational dashboard still consumes the protected helper'
);

select pg_temp.authenticate_as('d7000000-0000-4000-8000-000000000006');

select is(
  public.visit_operational_status((select visit_id from pg_temp.sec007_visit)),
  'scheduled',
  'administrator retains operational status access'
);

reset role;
update public.visits
set status = 'in_progress', started_at = pg_catalog.now() - interval '5 hours'
where id = (select visit_id from pg_temp.sec007_visit);
update public.visit_members
set member_status = case
  when user_id = 'd7000000-0000-4000-8000-000000000001' then 'completed'::public.visit_member_status
  else 'active'::public.visit_member_status
end
where visit_id = (select visit_id from pg_temp.sec007_visit);

set local role authenticated;
select pg_temp.authenticate_as('d7000000-0000-4000-8000-000000000002');

select is(
  public.visit_operational_status((select visit_id from pg_temp.sec007_visit)),
  'pending_returns',
  'member retains the derived pending-return status'
);

select pg_temp.authenticate_as('d7000000-0000-4000-8000-000000000004');

select results_eq(
  $$
    select visit_status
    from public.staff_list_ascents('pending_returns', 10, 'SEC007')
    where visit_id = (select visit_id from pg_temp.sec007_visit)
  $$,
  $$ values ('pending_returns'::text) $$,
  'authorized staff retains pending-return filtering'
);

reset role;
select * from finish();

rollback;
