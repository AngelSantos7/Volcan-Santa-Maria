begin;

create extension if not exists pgtap with schema extensions;

select plan(17);

insert into auth.users (
  id,
  email,
  email_confirmed_at,
  raw_user_meta_data
)
values
  (
    'f1000000-0000-4000-8000-000000000001'::uuid,
    'verified-leader@example.invalid',
    pg_catalog.now(),
    '{"first_name":"Valeria","last_name":"Verificada"}'::jsonb
  ),
  (
    'f2000000-0000-4000-8000-000000000002'::uuid,
    'verified-member@example.invalid',
    pg_catalog.now(),
    '{"first_name":"Mateo","last_name":"Confirmado"}'::jsonb
  ),
  (
    'f3000000-0000-4000-8000-000000000003'::uuid,
    'unverified-creator@example.invalid',
    null,
    '{"first_name":"Carla","last_name":"Pendiente"}'::jsonb
  ),
  (
    'f4000000-0000-4000-8000-000000000004'::uuid,
    'unverified-member@example.invalid',
    null,
    '{"first_name":"Julia","last_name":"Pendiente"}'::jsonb
  );

update public.profiles
set
  nationality_country_code = 'GT',
  date_of_birth = '1990-01-01'::date,
  phone = '+50255550000',
  document_type = 'passport'::public.document_type,
  document_number = 'VERIFIED-' || pg_catalog.right(id::text, 1)
where id in (
  'f1000000-0000-4000-8000-000000000001'::uuid,
  'f2000000-0000-4000-8000-000000000002'::uuid,
  'f3000000-0000-4000-8000-000000000003'::uuid,
  'f4000000-0000-4000-8000-000000000004'::uuid
);

insert into public.emergency_contacts (
  user_id,
  first_name,
  last_name,
  relationship,
  phone
)
select
  profile.id,
  'Contacto',
  'Emergencia',
  'Family',
  '+50255550001'
from public.profiles as profile
where profile.id in (
  'f1000000-0000-4000-8000-000000000001'::uuid,
  'f2000000-0000-4000-8000-000000000002'::uuid,
  'f3000000-0000-4000-8000-000000000003'::uuid,
  'f4000000-0000-4000-8000-000000000004'::uuid
);

create temporary table test_verified_email_visit (
  visit_id uuid primary key,
  join_code text not null,
  selected_return_at timestamptz not null
);

grant all on table pg_temp.test_verified_email_visit to authenticated;

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
  exists (
    select 1
    from pg_catalog.pg_proc as procedure
    join pg_catalog.pg_namespace as procedure_schema
      on procedure_schema.oid = procedure.pronamespace
    where procedure_schema.nspname = 'public'
      and procedure.proname = 'is_current_user_email_verified'
      and pg_catalog.pg_get_function_identity_arguments(procedure.oid) = ''
      and pg_catalog.format_type(procedure.prorettype, null) = 'boolean'
      and procedure.prosecdef
      and procedure.provolatile = 's'
      and exists (
        select 1
        from pg_catalog.unnest(procedure.proconfig) as setting
        where setting in ('search_path=', 'search_path=""')
      )
  ),
  'email verification helper is stable, boolean, SECURITY DEFINER, and has an empty search_path'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.is_current_user_email_verified()',
    'EXECUTE'
  ),
  'anonymous users cannot execute the email verification helper'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.is_current_user_email_verified()',
    'EXECUTE'
  ),
  'authenticated users cannot execute the internal email verification helper'
);

select ok(
  not has_function_privilege(
    'service_role',
    'public.is_current_user_email_verified()',
    'EXECUTE'
  ),
  'service role cannot execute the internal email verification helper'
);

set local role authenticated;
select pg_temp.authenticate_as(
  'f1000000-0000-4000-8000-000000000001'::uuid
);

select is(
  pg_temp.sqlstate_from(
    'select public.is_current_user_email_verified()'
  ),
  '42501',
  'the helper cannot be used as a public RPC to inspect auth state'
);

select lives_ok(
  $$
    with created as (
      select *
      from public.create_group_visit(
        'day_hike'::public.visit_type,
        pg_catalog.now() + interval '8 hours',
        false,
        null,
        true
      )
    )
    insert into pg_temp.test_verified_email_visit (
      visit_id,
      join_code,
      selected_return_at
    )
    select
      visit_id,
      join_code,
      pg_catalog.now() + interval '8 hours'
    from created
  $$,
  'a user with a confirmed email can create a group visit'
);

select results_eq(
  $$
    select
      visit.expected_return_at = requested.selected_return_at,
      visit.completed_at is null
    from public.visits as visit
    join pg_temp.test_verified_email_visit as requested
      on requested.visit_id = visit.id
  $$,
  $$ values (true, true) $$,
  'verified-email enforcement preserves the selected return and pending completion'
);

select is(
  pg_temp.sqlstate_from(
    $$
      update public.visits
      set guide_name = 'Direct write'
      where id = (
        select visit_id from pg_temp.test_verified_email_visit
      )
    $$
  ),
  '42501',
  'verified users still cannot update visits directly'
);

select pg_temp.authenticate_as(
  'f2000000-0000-4000-8000-000000000002'::uuid
);

select lives_ok(
  format(
    'select public.join_group_visit(%L, true)',
    (select join_code from pg_temp.test_verified_email_visit)
  ),
  'a user with a confirmed email can join a group visit'
);

select results_eq(
  $$
    select member_role::text, member_status::text
    from public.visit_members
    where visit_id = (
      select visit_id from pg_temp.test_verified_email_visit
    )
      and user_id = 'f2000000-0000-4000-8000-000000000002'::uuid
  $$,
  $$ values ('member'::text, 'active'::text) $$,
  'confirmed join creates the normal active member record'
);

select is(
  (
    select count(*)
    from public.visits
    where id = (
      select visit_id from pg_temp.test_verified_email_visit
    )
  ),
  1::bigint,
  'the existing RLS policy still lets a joined member read their visit'
);

select pg_temp.authenticate_as(
  'f3000000-0000-4000-8000-000000000003'::uuid
);

select throws_ok(
  $$
    select public.create_group_visit(
      'day_hike'::public.visit_type,
      pg_catalog.now() + interval '8 hours',
      false,
      null,
      true
    )
  $$,
  'P0001',
  'email_not_verified',
  'a user without a confirmed email receives the controlled create error'
);

reset role;

select is(
  (
    select count(*)
    from public.visits
    where created_by = 'f3000000-0000-4000-8000-000000000003'::uuid
  ),
  0::bigint,
  'rejected unconfirmed creation has no visit side effect'
);

set local role authenticated;
select pg_temp.authenticate_as(
  'f4000000-0000-4000-8000-000000000004'::uuid
);

select throws_ok(
  format(
    'select public.join_group_visit(%L, true)',
    (select join_code from pg_temp.test_verified_email_visit)
  ),
  'P0001',
  'email_not_verified',
  'a user without a confirmed email receives the controlled join error'
);

select is(
  (
    select count(*)
    from public.visits
    where id = (
      select visit_id from pg_temp.test_verified_email_visit
    )
  ),
  0::bigint,
  'an unconfirmed outsider still cannot read the group visit through RLS'
);

select is(
  pg_temp.sqlstate_from(
    $$
      insert into public.visit_members (
        visit_id,
        user_id,
        member_role,
        terms_accepted_at
      )
      values (
        (select visit_id from pg_temp.test_verified_email_visit),
        'f4000000-0000-4000-8000-000000000004'::uuid,
        'member'::public.visit_member_role,
        pg_catalog.now()
      )
    $$
  ),
  '42501',
  'an unconfirmed user cannot bypass the RPC with a direct member insert'
);

reset role;

select is(
  (
    select count(*)
    from public.visit_members
    where visit_id = (
      select visit_id from pg_temp.test_verified_email_visit
    )
      and user_id = 'f4000000-0000-4000-8000-000000000004'::uuid
  ),
  0::bigint,
  'rejected unconfirmed join has no membership side effect'
);

select * from finish();

rollback;
