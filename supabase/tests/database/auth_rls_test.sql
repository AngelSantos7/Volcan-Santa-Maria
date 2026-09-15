begin;

create extension if not exists pgtap with schema extensions;

select plan(15);

-- Fixed, isolated identities make assertions readable. The surrounding
-- transaction guarantees that neither users nor trigger-created rows persist.
insert into auth.users (id, email, raw_user_meta_data)
values
  (
    'a1000000-0000-4000-8000-000000000001'::uuid,
    'rls-tourist-one@example.invalid',
    '{"first_name":"Ana","last_name":"Turista"}'::jsonb
  ),
  (
    'a2000000-0000-4000-8000-000000000002'::uuid,
    'rls-tourist-two@example.invalid',
    '{"first_name":"Bruno","last_name":"Visitante"}'::jsonb
  ),
  (
    'a3000000-0000-4000-8000-000000000003'::uuid,
    'rls-tourist-three@example.invalid',
    '{"first_name":"Carla","last_name":"Caminante"}'::jsonb
  );

-- Leave a valid auth user without a role so the insert test cannot fail due to
-- a foreign key or unique constraint before reaching the privilege check.
delete from public.user_roles
where user_id = 'a3000000-0000-4000-8000-000000000003'::uuid;

-- Capture the SQLSTATE of denied statements without depending on localized or
-- version-specific PostgreSQL error messages.
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

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
select set_config(
  'request.jwt.claim.sub',
  'a1000000-0000-4000-8000-000000000001',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

select results_eq(
  $$
    select id
    from public.profiles
    where id = 'a1000000-0000-4000-8000-000000000001'::uuid
  $$,
  $$ values ('a1000000-0000-4000-8000-000000000001'::uuid) $$,
  'authenticated user can read their own profile'
);

select is(
  (
    select count(*)
    from public.profiles
    where id = 'a2000000-0000-4000-8000-000000000002'::uuid
  ),
  0::bigint,
  'authenticated user cannot read another profile'
);

select lives_ok(
  $$
    update public.profiles
    set first_name = 'Andrea', last_name = 'Exploradora'
    where id = 'a1000000-0000-4000-8000-000000000001'::uuid
  $$,
  'authenticated user can update their own first and last names'
);

select results_eq(
  $$
    select first_name, last_name
    from public.profiles
    where id = 'a1000000-0000-4000-8000-000000000001'::uuid
  $$,
  $$ values ('Andrea'::text, 'Exploradora'::text) $$,
  'own profile name changes are stored'
);

select is(
  pg_temp.sqlstate_from(
    $$
      update public.profiles
      set created_at = now()
      where id = 'a1000000-0000-4000-8000-000000000001'::uuid
    $$
  ),
  '42501',
  'authenticated user cannot update profile columns other than names'
);

select results_eq(
  $$
    update public.profiles
    set first_name = 'Intruso', last_name = 'Bloqueado'
    where id = 'a2000000-0000-4000-8000-000000000002'::uuid
    returning id
  $$,
  array[]::uuid[],
  'authenticated user cannot modify another profile'
);

select is(
  (
    select count(*)
    from public.profiles
    where id = 'a2000000-0000-4000-8000-000000000002'::uuid
      and first_name = 'Intruso'
  ),
  0::bigint,
  'another profile remains unchanged after the blocked update'
);

select results_eq(
  $$
    select user_id, role
    from public.user_roles
    where user_id = 'a1000000-0000-4000-8000-000000000001'::uuid
  $$,
  $$
    values (
      'a1000000-0000-4000-8000-000000000001'::uuid,
      'tourist'::public.app_role
    )
  $$,
  'authenticated user can read their own tourist role'
);

select is(
  (
    select count(*)
    from public.user_roles
    where user_id = 'a2000000-0000-4000-8000-000000000002'::uuid
  ),
  0::bigint,
  'authenticated user cannot read another role'
);

select is(
  pg_temp.sqlstate_from(
    $$
      update public.user_roles
      set role = 'admin'::public.app_role
      where user_id = 'a1000000-0000-4000-8000-000000000001'::uuid
    $$
  ),
  '42501',
  'tourist cannot change their role to admin'
);

select results_eq(
  $$
    select role
    from public.user_roles
    where user_id = 'a1000000-0000-4000-8000-000000000001'::uuid
  $$,
  $$ values ('tourist'::public.app_role) $$,
  'tourist role remains unchanged after the blocked update'
);

select is(
  pg_temp.sqlstate_from(
    $$
      insert into public.user_roles (user_id, role)
      values (
        'a3000000-0000-4000-8000-000000000003'::uuid,
        'admin'::public.app_role
      )
    $$
  ),
  '42501',
  'authenticated user cannot insert user roles'
);

select is(
  pg_temp.sqlstate_from(
    $$
      delete from public.user_roles
      where user_id = 'a1000000-0000-4000-8000-000000000001'::uuid
    $$
  ),
  '42501',
  'authenticated user cannot delete user roles'
);

reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'anon', true);

select is(
  pg_temp.sqlstate_from('select * from public.profiles'),
  '42501',
  'anonymous user cannot query profiles'
);

select is(
  pg_temp.sqlstate_from('select * from public.user_roles'),
  '42501',
  'anonymous user cannot query user roles'
);

reset role;
select * from finish();

rollback;
