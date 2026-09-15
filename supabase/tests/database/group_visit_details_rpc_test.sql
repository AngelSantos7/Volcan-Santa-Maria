begin;

create extension if not exists pgtap with schema extensions;

select plan(16);

insert into auth.users (id, email, raw_user_meta_data)
values
  (
    'c1000000-0000-4000-8000-000000000001'::uuid,
    'details-leader@example.invalid',
    '{"first_name":"Laura","last_name":"Lider"}'::jsonb
  ),
  (
    'c2000000-0000-4000-8000-000000000002'::uuid,
    'details-member@example.invalid',
    '{"first_name":"Miguel","last_name":"Miembro"}'::jsonb
  ),
  (
    'c3000000-0000-4000-8000-000000000003'::uuid,
    'details-outsider@example.invalid',
    '{"first_name":"Olivia","last_name":"Externa"}'::jsonb
  );

update public.profiles
set
  nationality_country_code = 'GT',
  date_of_birth = '1990-01-01'::date,
  phone = '+50255550000',
  document_type = 'passport'::public.document_type,
  document_number = 'PRIVATE-' || pg_catalog.right(id::text, 1)
where id in (
  'c1000000-0000-4000-8000-000000000001'::uuid,
  'c2000000-0000-4000-8000-000000000002'::uuid,
  'c3000000-0000-4000-8000-000000000003'::uuid
);

insert into public.emergency_contacts (
  user_id,
  first_name,
  last_name,
  relationship,
  phone
)
values
  (
    'c1000000-0000-4000-8000-000000000001'::uuid,
    'Contacto',
    'Uno',
    'Family',
    '+50255550001'
  ),
  (
    'c2000000-0000-4000-8000-000000000002'::uuid,
    'Contacto',
    'Dos',
    'Family',
    '+50255550002'
  ),
  (
    'c3000000-0000-4000-8000-000000000003'::uuid,
    'Contacto',
    'Tres',
    'Family',
    '+50255550003'
  );

create temporary table test_group_visit_details (
  visit_id uuid primary key,
  join_code text not null
);

grant all on table pg_temp.test_group_visit_details to authenticated;

create function pg_temp.authenticate_as(requested_user_id uuid)
returns void
language plpgsql
as $$
begin
  perform set_config(
    'request.jwt.claims',
    pg_catalog.jsonb_build_object(
      'sub', requested_user_id::text,
      'role', 'authenticated'
    )::text,
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
  not has_function_privilege(
    'anon',
    'public.get_group_visit_details(uuid)',
    'EXECUTE'
  ),
  'anonymous users cannot execute the group details RPC'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.get_group_visit_details(uuid)',
    'EXECUTE'
  ),
  'authenticated users can execute the group details RPC'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.get_my_active_group_visit()',
    'EXECUTE'
  ),
  'anonymous users cannot execute the active group visit RPC'
);

set local role authenticated;
select pg_temp.authenticate_as(
  'c1000000-0000-4000-8000-000000000001'::uuid
);

with created as (
  select *
  from public.create_group_visit(
    'day_hike'::public.visit_type,
    pg_catalog.now() + interval '4 hours',
    true,
    'Guia de Prueba',
    true
  )
)
insert into pg_temp.test_group_visit_details (visit_id, join_code)
select visit_id, join_code
from created;

select lives_ok(
  format(
    'select public.get_group_visit_details(%L::uuid)',
    (select visit_id from pg_temp.test_group_visit_details)
  ),
  'leader can read the group visit details'
);

select results_eq(
  $$
    select status::text, join_code is not null, visit_type::text,
      expected_return_at = pg_catalog.now() + interval '4 hours',
      has_local_guide, guide_name, jsonb_array_length(participants)
    from public.get_group_visit_details(
      (select visit_id from pg_temp.test_group_visit_details)
    )
  $$,
  $$ values ('forming'::text, true, 'day_hike'::text, true, true, 'Guia de Prueba'::text, 1) $$,
  'details contain only the interface data for the forming visit'
);

select results_eq(
  $$
    select visit_id, status::text
    from public.get_my_active_group_visit()
  $$,
  $$
    select visit_id, 'forming'::text
    from pg_temp.test_group_visit_details
  $$,
  'leader can automatically recover the active forming visit'
);

select pg_temp.authenticate_as(
  'c2000000-0000-4000-8000-000000000002'::uuid
);

select lives_ok(
  format(
    'select public.join_group_visit(%L, true)',
    (select join_code from pg_temp.test_group_visit_details)
  ),
  'second tourist can join the forming visit'
);

select lives_ok(
  format(
    'select public.get_group_visit_details(%L::uuid)',
    (select visit_id from pg_temp.test_group_visit_details)
  ),
  'second member can read the group visit details'
);

select results_eq(
  $$
    select
      participant ->> 'first_name',
      participant ->> 'last_name',
      participant ->> 'member_role'
    from public.get_group_visit_details(
      (select visit_id from pg_temp.test_group_visit_details)
    ) as details
    cross join lateral jsonb_array_elements(details.participants) as participant
    order by participant ->> 'member_role', participant ->> 'first_name'
  $$,
  $$
    values
      ('Laura'::text, 'Lider'::text, 'leader'::text),
      ('Miguel'::text, 'Miembro'::text, 'member'::text)
  $$,
  'participants expose names and membership roles for both members'
);

select ok(
  not exists (
    select 1
    from public.get_group_visit_details(
      (select visit_id from pg_temp.test_group_visit_details)
    ) as details
    cross join lateral jsonb_array_elements(details.participants) as participant
    cross join lateral jsonb_object_keys(participant) as participant_key
    where participant_key not in (
      'user_id',
      'first_name',
      'last_name',
      'member_role',
      'member_status',
      'joined_at',
      'return_started_at',
      'checked_out_at'
    )
  )
  and not exists (
    select 1
    from public.get_group_visit_details(
      (select visit_id from pg_temp.test_group_visit_details)
    ) as details
    cross join lateral jsonb_array_elements(details.participants) as participant
    where (
      select count(*)
      from jsonb_object_keys(participant)
    ) <> 8
  ),
  'participant objects contain only the eight explicitly allowed fields'
);

select ok(
  not exists (
    select 1
    from public.get_group_visit_details(
      (select visit_id from pg_temp.test_group_visit_details)
    ) as details
    where pg_catalog.lower(to_jsonb(details)::text) ~
      '(document_number|document_type|date_of_birth|nationality|emergency_contacts|email|"phone"|exit_reason|exit_notes)'
  ),
  'details expose no sensitive profile data, exit reasons, or exit notes'
);

select results_eq(
  $$
    select visit_id, status::text
    from public.get_my_active_group_visit()
  $$,
  $$
    select visit_id, 'forming'::text
    from pg_temp.test_group_visit_details
  $$,
  'second member can automatically recover the active visit'
);

select pg_temp.authenticate_as(
  'c3000000-0000-4000-8000-000000000003'::uuid
);

select is(
  pg_temp.sqlstate_from(
    format(
      'select public.get_group_visit_details(%L::uuid)',
      (select visit_id from pg_temp.test_group_visit_details)
    )
  ),
  '42501',
  'external authenticated user is denied access to group details'
);

select is_empty(
  $$ select * from public.get_my_active_group_visit() $$,
  'external user has no active group visit'
);

select pg_temp.authenticate_as(
  'c1000000-0000-4000-8000-000000000001'::uuid
);

select public.start_group_visit(
  (select visit_id from pg_temp.test_group_visit_details)
);

select results_eq(
  $$
    select status::text, join_code
    from public.get_group_visit_details(
      (select visit_id from pg_temp.test_group_visit_details)
    )
  $$,
  $$ values ('in_progress'::text, null::text) $$,
  'join code is hidden after the visit starts'
);

select results_eq(
  $$
    select visit_id, status::text
    from public.get_my_active_group_visit()
  $$,
  $$
    select visit_id, 'in_progress'::text
    from pg_temp.test_group_visit_details
  $$,
  'active visit lookup follows the visit into in-progress status'
);

reset role;
select * from finish();

rollback;
