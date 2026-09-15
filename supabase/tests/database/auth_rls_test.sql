begin;

create extension if not exists pgtap with schema extensions;

select plan(25);

-- Fixed identities keep the assertions readable. The transaction rollback
-- ensures that users and all trigger-created records remain test-only data.
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

update public.profiles
set
  nationality_country_code = 'US',
  date_of_birth = '1985-03-20'::date,
  phone = '+12025550123',
  document_type = 'passport'::public.document_type,
  document_number = 'P-SECRET-002'
where id = 'a2000000-0000-4000-8000-000000000002'::uuid;

insert into public.emergency_contacts (
  user_id,
  first_name,
  last_name,
  relationship,
  phone
)
values (
  'a2000000-0000-4000-8000-000000000002'::uuid,
  'Elena',
  'Visitante',
  'Sister',
  '+12025550124'
);

-- Leave a valid auth user without a role or emergency contact so insert tests
-- cannot fail on foreign keys or unique constraints before reaching RLS.
delete from public.user_roles
where user_id = 'a3000000-0000-4000-8000-000000000003'::uuid;

-- Capture SQLSTATE without depending on localized PostgreSQL error messages.
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

select results_eq(
  $$
    select
      document_number,
      phone,
      nationality_country_code,
      date_of_birth::text
    from public.profiles
    where id = 'a2000000-0000-4000-8000-000000000002'::uuid
  $$,
  $$
    select null::text, null::text, null::text, null::text
    where false
  $$,
  'authenticated user cannot read another profile sensitive data'
);

select lives_ok(
  $$
    update public.profiles
    set
      first_name = 'Andrea',
      last_name = 'Exploradora',
      nationality_country_code = 'GT',
      date_of_birth = '1990-05-10'::date,
      phone = '+50255555555',
      document_type = 'dpi'::public.document_type,
      document_number = '1234567890101'
    where id = 'a1000000-0000-4000-8000-000000000001'::uuid
  $$,
  'authenticated user can update their own tourist profile'
);

select results_eq(
  $$
    select
      first_name,
      last_name,
      nationality_country_code,
      date_of_birth::text,
      phone,
      document_type::text,
      document_number
    from public.profiles
    where id = 'a1000000-0000-4000-8000-000000000001'::uuid
  $$,
  $$
    values (
      'Andrea'::text,
      'Exploradora'::text,
      'GT'::text,
      '1990-05-10'::text,
      '+50255555555'::text,
      'dpi'::text,
      '1234567890101'::text
    )
  $$,
  'own tourist profile changes are stored and readable'
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
  'authenticated user cannot update protected profile columns'
);

select results_eq(
  $$
    update public.profiles
    set
      phone = '+50255550000',
      document_number = 'STOLEN-CHANGE'
    where id = 'a2000000-0000-4000-8000-000000000002'::uuid
    returning id
  $$,
  array[]::uuid[],
  'authenticated user cannot modify another tourist profile'
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
  'new public user receives the tourist role'
);

select is(
  (
    select count(*)
    from public.user_roles
    where user_id = 'a2000000-0000-4000-8000-000000000002'::uuid
  ),
  0::bigint,
  'tourist cannot read another user role'
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
  'tourist cannot update user roles'
);

select results_eq(
  $$
    select role
    from public.user_roles
    where user_id = 'a1000000-0000-4000-8000-000000000001'::uuid
  $$,
  $$ values ('tourist'::public.app_role) $$,
  'tourist role remains unchanged after blocked update'
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
  'tourist cannot insert user roles'
);

select is(
  pg_temp.sqlstate_from(
    $$
      delete from public.user_roles
      where user_id = 'a1000000-0000-4000-8000-000000000001'::uuid
    $$
  ),
  '42501',
  'tourist cannot delete user roles'
);

select lives_ok(
  $$
    insert into public.emergency_contacts (
      user_id,
      first_name,
      last_name,
      relationship,
      phone
    )
    values (
      'a1000000-0000-4000-8000-000000000001'::uuid,
      'Mario',
      'Turista',
      'Brother',
      '+50255555556'
    )
  $$,
  'authenticated user can insert their own emergency contact'
);

select results_eq(
  $$
    select first_name, last_name, relationship, phone
    from public.emergency_contacts
    where user_id = 'a1000000-0000-4000-8000-000000000001'::uuid
  $$,
  $$
    values (
      'Mario'::text,
      'Turista'::text,
      'Brother'::text,
      '+50255555556'::text
    )
  $$,
  'authenticated user can read their own emergency contact'
);

select is(
  (
    select count(*)
    from public.emergency_contacts
    where user_id = 'a2000000-0000-4000-8000-000000000002'::uuid
  ),
  0::bigint,
  'authenticated user cannot read another emergency contact'
);

select lives_ok(
  $$
    update public.emergency_contacts
    set relationship = 'Parent', phone = '+50255555557'
    where user_id = 'a1000000-0000-4000-8000-000000000001'::uuid
  $$,
  'authenticated user can update their own emergency contact'
);

select results_eq(
  $$
    select relationship, phone
    from public.emergency_contacts
    where user_id = 'a1000000-0000-4000-8000-000000000001'::uuid
  $$,
  $$ values ('Parent'::text, '+50255555557'::text) $$,
  'own emergency contact changes are stored'
);

select is(
  pg_temp.sqlstate_from(
    $$
      insert into public.emergency_contacts (
        user_id,
        first_name,
        last_name,
        relationship,
        phone
      )
      values (
        'a3000000-0000-4000-8000-000000000003'::uuid,
        'Contacto',
        'Ajeno',
        'Friend',
        '+50255555558'
      )
    $$
  ),
  '42501',
  'authenticated user cannot insert an emergency contact for another user'
);

select results_eq(
  $$
    update public.emergency_contacts
    set phone = '+12025550999'
    where user_id = 'a2000000-0000-4000-8000-000000000002'::uuid
    returning id
  $$,
  array[]::uuid[],
  'authenticated user cannot update another emergency contact'
);

select is(
  pg_temp.sqlstate_from(
    $$
      delete from public.emergency_contacts
      where user_id = 'a2000000-0000-4000-8000-000000000002'::uuid
    $$
  ),
  '42501',
  'authenticated user cannot delete another emergency contact'
);

-- Authenticate as the second user to prove the first user's blocked update did
-- not change the second user's contact.
select set_config(
  'request.jwt.claims',
  '{"sub":"a2000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
select set_config(
  'request.jwt.claim.sub',
  'a2000000-0000-4000-8000-000000000002',
  true
);

select results_eq(
  $$
    select first_name, phone
    from public.emergency_contacts
    where user_id = 'a2000000-0000-4000-8000-000000000002'::uuid
  $$,
  $$ values ('Elena'::text, '+12025550124'::text) $$,
  'another user emergency contact remains unchanged'
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
  pg_temp.sqlstate_from('select * from public.emergency_contacts'),
  '42501',
  'anonymous user cannot query emergency contacts'
);

select is(
  pg_temp.sqlstate_from('select * from public.user_roles'),
  '42501',
  'anonymous user cannot query user roles'
);

reset role;
select * from finish();

rollback;
