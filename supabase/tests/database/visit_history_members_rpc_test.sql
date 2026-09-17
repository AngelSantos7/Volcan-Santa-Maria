begin;

create extension if not exists pgtap with schema extensions;

select plan(7);

insert into auth.users (id, email, raw_user_meta_data)
values
  (
    'f1000000-0000-4000-8000-000000000001'::uuid,
    'history-members-leader@example.invalid',
    '{"first_name":"Miguel","last_name":"Santos"}'::jsonb
  ),
  (
    'f2000000-0000-4000-8000-000000000002'::uuid,
    'history-members-return@example.invalid',
    '{"first_name":"Juan","last_name":"Perez"}'::jsonb
  ),
  (
    'f3000000-0000-4000-8000-000000000003'::uuid,
    'history-members-withdrawn@example.invalid',
    '{"first_name":"Carlos","last_name":"Lopez"}'::jsonb
  ),
  (
    'f4000000-0000-4000-8000-000000000004'::uuid,
    'history-members-outsider@example.invalid',
    '{"first_name":"Olivia","last_name":"Externa"}'::jsonb
  );

insert into public.visits (
  id,
  route_id,
  created_by,
  join_code,
  visit_type,
  has_local_guide,
  status,
  started_at,
  expected_return_at,
  completed_at
)
select
  'fa000000-0000-4000-8000-000000000001'::uuid,
  route.id,
  'f1000000-0000-4000-8000-000000000001'::uuid,
  'HIST01',
  'expedition_camping'::public.visit_type,
  false,
  'completed'::public.visit_status,
  pg_catalog.now() - interval '9 hours',
  pg_catalog.now() - interval '1 hour',
  pg_catalog.now() - interval '30 minutes'
from public.routes as route
where route.slug = 'ascenso-a-la-cima';

insert into public.visit_members (
  visit_id,
  user_id,
  member_role,
  terms_accepted_at,
  joined_at,
  member_status,
  return_started_at,
  exit_reason,
  exit_notes,
  checked_out_at,
  checkout_method
)
values
  (
    'fa000000-0000-4000-8000-000000000001'::uuid,
    'f1000000-0000-4000-8000-000000000001'::uuid,
    'leader'::public.visit_member_role,
    pg_catalog.now() - interval '2 days',
    pg_catalog.now() - interval '2 days',
    'completed'::public.visit_member_status,
    null,
    null,
    null,
    null,
    null
  ),
  (
    'fa000000-0000-4000-8000-000000000001'::uuid,
    'f2000000-0000-4000-8000-000000000002'::uuid,
    'member'::public.visit_member_role,
    pg_catalog.now() - interval '2 days',
    pg_catalog.now() - interval '2 days' + interval '1 minute',
    'returned_early'::public.visit_member_status,
    pg_catalog.now() - interval '3 hours',
    'personal_decision',
    'This private note must never be returned.',
    pg_catalog.now() - interval '2 hours',
    'self'
  ),
  (
    'fa000000-0000-4000-8000-000000000001'::uuid,
    'f3000000-0000-4000-8000-000000000003'::uuid,
    'member'::public.visit_member_role,
    pg_catalog.now() - interval '2 days',
    pg_catalog.now() - interval '2 days' + interval '2 minutes',
    'withdrawn_before_start'::public.visit_member_status,
    null,
    null,
    null,
    null,
    null
  );

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

-- 1
select ok(
  not has_function_privilege(
    'anon',
    'public.get_visit_history_members(uuid)',
    'EXECUTE'
  ),
  'anonymous users cannot execute the history members RPC'
);

-- 2
select ok(
  has_function_privilege(
    'authenticated',
    'public.get_visit_history_members(uuid)',
    'EXECUTE'
  ),
  'authenticated users can execute the history members RPC'
);

-- 3
select ok(
  (
    select
      pg_catalog.count(*) = 5
      and pg_catalog.count(*) filter (
        where (parameter.parameter_name::text collate "C") in (
          'first_name',
          'last_name',
          'member_role',
          'member_status',
          'checked_out_at'
        )
      ) = 5
    from information_schema.parameters as parameter
    where parameter.specific_schema = 'public'
      and parameter.specific_name like 'get_visit_history_members_%'
      and parameter.parameter_mode = 'OUT'
  ),
  'the RPC exposes only the five approved participant fields'
);

set local role authenticated;
select pg_temp.authenticate_as(
  'f1000000-0000-4000-8000-000000000001'::uuid
);

-- 4
select results_eq(
  $$
    select
      first_name,
      last_name,
      member_role::text,
      member_status::text,
      checked_out_at is not null
    from public.get_visit_history_members(
      'fa000000-0000-4000-8000-000000000001'::uuid
    )
  $$,
  $$
    values
      ('Miguel'::text, 'Santos'::text, 'leader'::text, 'completed'::text, false),
      ('Juan'::text, 'Perez'::text, 'member'::text, 'returned_early'::text, true),
      ('Carlos'::text, 'Lopez'::text, 'member'::text, 'withdrawn_before_start'::text, false)
  $$,
  'a participant receives names, roles, states, and confirmed checkout only'
);

select pg_temp.authenticate_as(
  'f2000000-0000-4000-8000-000000000002'::uuid
);

-- 5
select is(
  (
    select pg_catalog.count(*)
    from public.get_visit_history_members(
      'fa000000-0000-4000-8000-000000000001'::uuid
    )
  ),
  3::bigint,
  'a non-organizer participant can inspect their own visit members'
);

select pg_temp.authenticate_as(
  'f4000000-0000-4000-8000-000000000004'::uuid
);

-- 6
select is(
  pg_temp.sqlstate_from(
    $$
      select * from public.get_visit_history_members(
        'fa000000-0000-4000-8000-000000000001'::uuid
      )
    $$
  ),
  '42501',
  'an authenticated outsider cannot inspect visit members'
);

-- 7
select is(
  pg_temp.sqlstate_from(
    'select * from public.get_visit_history_members(null)'
  ),
  '42501',
  'a null visit identifier is rejected'
);

reset role;
select * from finish();

rollback;
