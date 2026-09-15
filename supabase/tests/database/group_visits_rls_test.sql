begin;

create extension if not exists pgtap with schema extensions;

select plan(41);

-- All identities and records are isolated by the surrounding transaction.
insert into auth.users (id, email, raw_user_meta_data)
values
  (
    'b1000000-0000-4000-8000-000000000001'::uuid,
    'group-leader@example.invalid',
    '{"first_name":"Lidia","last_name":"Lider"}'::jsonb
  ),
  (
    'b2000000-0000-4000-8000-000000000002'::uuid,
    'group-member@example.invalid',
    '{"first_name":"Mario","last_name":"Miembro"}'::jsonb
  ),
  (
    'b3000000-0000-4000-8000-000000000003'::uuid,
    'group-outsider@example.invalid',
    '{"first_name":"Olga","last_name":"Externa"}'::jsonb
  ),
  (
    'b4000000-0000-4000-8000-000000000004'::uuid,
    'group-incomplete@example.invalid',
    '{"first_name":"Ines","last_name":"Incompleta"}'::jsonb
  ),
  (
    'b5000000-0000-4000-8000-000000000005'::uuid,
    'group-no-contact@example.invalid',
    '{"first_name":"Nora","last_name":"Sin Contacto"}'::jsonb
  ),
  (
    'b6000000-0000-4000-8000-000000000006'::uuid,
    'group-cancel-leader@example.invalid',
    '{"first_name":"Carlos","last_name":"Cancela"}'::jsonb
  ),
  (
    'b7000000-0000-4000-8000-000000000007'::uuid,
    'group-late-member@example.invalid',
    '{"first_name":"Tania","last_name":"Tardia"}'::jsonb
  );

update public.profiles
set
  nationality_country_code = 'GT',
  date_of_birth = '1990-01-01'::date,
  phone = '+50255550000',
  document_type = 'passport'::public.document_type,
  document_number = 'TEST-' || pg_catalog.right(id::text, 1)
where id in (
  'b1000000-0000-4000-8000-000000000001'::uuid,
  'b2000000-0000-4000-8000-000000000002'::uuid,
  'b3000000-0000-4000-8000-000000000003'::uuid,
  'b5000000-0000-4000-8000-000000000005'::uuid,
  'b6000000-0000-4000-8000-000000000006'::uuid,
  'b7000000-0000-4000-8000-000000000007'::uuid
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
  'Seguro',
  'Family',
  '+50255550001'
from public.profiles as profile
where profile.id in (
  'b1000000-0000-4000-8000-000000000001'::uuid,
  'b2000000-0000-4000-8000-000000000002'::uuid,
  'b3000000-0000-4000-8000-000000000003'::uuid,
  'b6000000-0000-4000-8000-000000000006'::uuid,
  'b7000000-0000-4000-8000-000000000007'::uuid
);

create temporary table test_created_visits (
  label text primary key,
  visit_id uuid not null,
  join_code text not null
);

grant all on table pg_temp.test_created_visits to authenticated;

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
  not exists (
    select 1
    from pg_catalog.pg_enum as enum_value
    join pg_catalog.pg_type as enum_type
      on enum_type.oid = enum_value.enumtypid
    join pg_catalog.pg_namespace as enum_schema
      on enum_schema.oid = enum_type.typnamespace
    where enum_schema.nspname = 'public'
      and enum_type.typname = 'visit_status'
      and enum_value.enumlabel = 'overdue'
  ),
  'visit_status contains no stored overdue state'
);

select results_eq(
  $$
    select slug, name_es, name_en, is_active
    from public.routes
    where slug = 'ascenso-cima'
  $$,
  $$ values ('ascenso-cima'::text, 'Ascenso a la Cima'::text, 'Summit Ascent'::text, true) $$,
  'default summit route exists and is active'
);

set local role authenticated;
select pg_temp.authenticate_as(
  'b1000000-0000-4000-8000-000000000001'::uuid
);

select is(
  pg_temp.sqlstate_from(
    $$
      select public.create_group_visit(
        'day_hike'::public.visit_type,
        pg_catalog.now() + interval '4 hours',
        false,
        null,
        false
      )
    $$
  ),
  '23514',
  'leader must accept terms before creating a group visit'
);

select lives_ok(
  $$
    with created as (
      select *
      from public.create_group_visit(
        'day_hike'::public.visit_type,
        pg_catalog.now() + interval '4 hours',
        false,
        null,
        true
      )
    )
    insert into pg_temp.test_created_visits (label, visit_id, join_code)
    select 'main', visit_id, join_code
    from created
  $$,
  'eligible tourist can create a group visit'
);

select results_eq(
  $$
    select
      visit.status::text,
      visit.visit_type::text,
      visit.expected_return_at = pg_catalog.now() + interval '4 hours',
      visit.has_local_guide,
      visit.guide_name is null,
      visit.join_code ~ '^[A-Z0-9]{6}$',
      route.slug
    from public.visits as visit
    join public.routes as route on route.id = visit.route_id
    where visit.id = (
      select visit_id
      from pg_temp.test_created_visits
      where label = 'main'
    )
  $$,
  $$ values ('forming'::text, 'day_hike'::text, true, false, true, true, 'ascenso-cima'::text) $$,
  'created visit uses server code, forming status, and default route'
);

select results_eq(
  $$
    select member.member_role::text, member.terms_accepted_at is not null
    from public.visit_members as member
    where member.visit_id = (
      select visit_id
      from pg_temp.test_created_visits
      where label = 'main'
    )
      and member.user_id = 'b1000000-0000-4000-8000-000000000001'::uuid
  $$,
  $$ values ('leader'::text, true) $$,
  'group creator is inserted as leader with accepted terms timestamp'
);

select is(
  pg_temp.sqlstate_from(
    $$
      select public.create_group_visit(
        'day_hike'::public.visit_type,
        pg_catalog.now() + interval '5 hours',
        false,
        null,
        true
      )
    $$
  ),
  'P0001',
  'tourist cannot create a second active group visit'
);

select is(
  pg_temp.sqlstate_from(
    $$
      insert into public.visits (
        route_id,
        created_by,
        join_code,
        visit_type,
        expected_return_at
      )
      select
        route.id,
        'b1000000-0000-4000-8000-000000000001'::uuid,
        'DIRECT',
        'day_hike'::public.visit_type,
        pg_catalog.now() + interval '5 hours'
      from public.routes as route
      where route.slug = 'ascenso-cima'
    $$
  ),
  '42501',
  'tourist cannot insert visits directly'
);

select is(
  pg_temp.sqlstate_from(
    $$
      update public.visits
      set status = 'completed'::public.visit_status
      where id = (
        select visit_id from pg_temp.test_created_visits where label = 'main'
      )
    $$
  ),
  '42501',
  'tourist cannot update visits directly'
);

select is(
  pg_temp.sqlstate_from(
    $$
      delete from public.visits
      where id = (
        select visit_id from pg_temp.test_created_visits where label = 'main'
      )
    $$
  ),
  '42501',
  'tourist cannot delete visits directly'
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
        (select visit_id from pg_temp.test_created_visits where label = 'main'),
        'b7000000-0000-4000-8000-000000000007'::uuid,
        'member'::public.visit_member_role,
        now()
      )
    $$
  ),
  '42501',
  'tourist cannot insert visit members directly'
);

select is(
  pg_temp.sqlstate_from(
    $$
      update public.visit_members
      set member_role = 'member'::public.visit_member_role
      where visit_id = (
        select visit_id from pg_temp.test_created_visits where label = 'main'
      )
    $$
  ),
  '42501',
  'tourist cannot update visit members directly'
);

select is(
  pg_temp.sqlstate_from(
    $$
      delete from public.visit_members
      where visit_id = (
        select visit_id from pg_temp.test_created_visits where label = 'main'
      )
    $$
  ),
  '42501',
  'tourist cannot delete visit members directly'
);

select pg_temp.authenticate_as(
  'b4000000-0000-4000-8000-000000000004'::uuid
);

select is(
  pg_temp.sqlstate_from(
    $$
      select public.create_group_visit(
        'day_hike'::public.visit_type,
        pg_catalog.now() + interval '4 hours',
        false,
        null,
        true
      )
    $$
  ),
  'P0001',
  'incomplete profile cannot create a group visit'
);

select is(
  pg_temp.sqlstate_from(
    format(
      'select public.join_group_visit(%L, true)',
      (select join_code from pg_temp.test_created_visits where label = 'main')
    )
  ),
  'P0001',
  'incomplete profile cannot join a group visit'
);

select pg_temp.authenticate_as(
  'b5000000-0000-4000-8000-000000000005'::uuid
);

select is(
  pg_temp.sqlstate_from(
    $$
      select public.create_group_visit(
        'day_hike'::public.visit_type,
        pg_catalog.now() + interval '4 hours',
        false,
        null,
        true
      )
    $$
  ),
  'P0001',
  'tourist without emergency contact cannot create a group visit'
);

select is(
  pg_temp.sqlstate_from(
    format(
      'select public.join_group_visit(%L, true)',
      (select join_code from pg_temp.test_created_visits where label = 'main')
    )
  ),
  'P0001',
  'tourist without emergency contact cannot join a group visit'
);

select pg_temp.authenticate_as(
  'b7000000-0000-4000-8000-000000000007'::uuid
);

select is(
  pg_temp.sqlstate_from(
    $$ select public.join_group_visit('BAD999', true) $$
  ),
  'P0002',
  'invalid join code fails'
);

select is(
  pg_temp.sqlstate_from(
    format(
      'select public.join_group_visit(%L, false)',
      (select join_code from pg_temp.test_created_visits where label = 'main')
    )
  ),
  '23514',
  'member must accept terms before joining a group visit'
);

select pg_temp.authenticate_as(
  'b2000000-0000-4000-8000-000000000002'::uuid
);

select lives_ok(
  format(
    'select public.join_group_visit(%L, true)',
    pg_catalog.lower(
      (select join_code from pg_temp.test_created_visits where label = 'main')
    )
  ),
  'second tourist can join using a case-insensitive code'
);

select results_eq(
  $$
    select member.member_role::text, member.terms_accepted_at is not null
    from public.visit_members as member
    where member.visit_id = (
      select visit_id from pg_temp.test_created_visits where label = 'main'
    )
      and member.user_id = 'b2000000-0000-4000-8000-000000000002'::uuid
  $$,
  $$ values ('member'::text, true) $$,
  'joined tourist is inserted as member with accepted terms timestamp'
);

select is(
  (
    select count(*)
    from public.visit_members as member
    where member.visit_id = (
      select visit_id from pg_temp.test_created_visits where label = 'main'
    )
  ),
  2::bigint,
  'leader and member appear in the same group visit'
);

select pg_temp.authenticate_as(
  'b3000000-0000-4000-8000-000000000003'::uuid
);

select lives_ok(
  $$
    with created as (
      select *
      from public.create_group_visit(
        'expedition_camping'::public.visit_type,
        pg_catalog.now() + interval '2 days',
        true,
        'Guia Local',
        true
      )
    )
    insert into pg_temp.test_created_visits (label, visit_id, join_code)
    select 'secondary', visit_id, join_code
    from created
  $$,
  'another eligible tourist can create an independent group visit'
);

select is(
  (
    select count(*)
    from public.visits
    where id = (
      select visit_id from pg_temp.test_created_visits where label = 'main'
    )
  ),
  0::bigint,
  'external tourist cannot read another group visit'
);

select is(
  (
    select count(*)
    from public.visit_members
    where visit_id = (
      select visit_id from pg_temp.test_created_visits where label = 'main'
    )
  ),
  0::bigint,
  'external tourist cannot read another group member list'
);

select pg_temp.authenticate_as(
  'b2000000-0000-4000-8000-000000000002'::uuid
);

select is(
  pg_temp.sqlstate_from(
    format(
      'select public.join_group_visit(%L, true)',
      (
        select join_code
        from pg_temp.test_created_visits
        where label = 'secondary'
      )
    )
  ),
  'P0001',
  'tourist cannot join a second active group visit'
);

select is(
  pg_temp.sqlstate_from(
    format(
      'select public.start_group_visit(%L::uuid)',
      (select visit_id from pg_temp.test_created_visits where label = 'main')
    )
  ),
  '42501',
  'normal member cannot start the group visit'
);

select pg_temp.authenticate_as(
  'b1000000-0000-4000-8000-000000000001'::uuid
);

select lives_ok(
  format(
    'select public.start_group_visit(%L::uuid)',
    (select visit_id from pg_temp.test_created_visits where label = 'main')
  ),
  'leader can start a forming group visit'
);

select results_eq(
  $$
    select status::text, started_at is not null, expected_return_at is not null
    from public.visits
    where id = (
      select visit_id from pg_temp.test_created_visits where label = 'main'
    )
  $$,
  $$ values ('in_progress'::text, true, true) $$,
  'starting records timestamps and in-progress status automatically'
);

select results_eq(
  $$
    select expected_return_at = pg_catalog.now() + interval '4 hours'
    from public.visits
    where id = (
      select visit_id from pg_temp.test_created_visits where label = 'main'
    )
  $$,
  $$ values (true) $$,
  'starting preserves the expected return time selected during creation'
);

select pg_temp.authenticate_as(
  'b7000000-0000-4000-8000-000000000007'::uuid
);

select is(
  pg_temp.sqlstate_from(
    format(
      'select public.join_group_visit(%L, true)',
      (select join_code from pg_temp.test_created_visits where label = 'main')
    )
  ),
  'P0001',
  'group visit no longer accepts members after starting'
);

select pg_temp.authenticate_as(
  'b2000000-0000-4000-8000-000000000002'::uuid
);

select is(
  pg_temp.sqlstate_from(
    format(
      'select public.complete_group_visit(%L::uuid)',
      (select visit_id from pg_temp.test_created_visits where label = 'main')
    )
  ),
  '42501',
  'normal member cannot complete the group visit'
);

select pg_temp.authenticate_as(
  'b1000000-0000-4000-8000-000000000001'::uuid
);

select lives_ok(
  format(
    'select public.complete_group_visit(%L::uuid)',
    (select visit_id from pg_temp.test_created_visits where label = 'main')
  ),
  'leader can complete an in-progress group visit'
);

select results_eq(
  $$
    select status::text, completed_at is not null
    from public.visits
    where id = (
      select visit_id from pg_temp.test_created_visits where label = 'main'
    )
  $$,
  $$ values ('completed'::text, true) $$,
  'completion records timestamp and completed status'
);

select pg_temp.authenticate_as(
  'b2000000-0000-4000-8000-000000000002'::uuid
);

select is(
  pg_temp.sqlstate_from(
    format(
      'select public.cancel_group_visit(%L::uuid)',
      (
        select visit_id
        from pg_temp.test_created_visits
        where label = 'secondary'
      )
    )
  ),
  '42501',
  'non-leader cannot cancel a forming group visit'
);

select pg_temp.authenticate_as(
  'b3000000-0000-4000-8000-000000000003'::uuid
);

select lives_ok(
  format(
    'select public.cancel_group_visit(%L::uuid)',
    (
      select visit_id
      from pg_temp.test_created_visits
      where label = 'secondary'
    )
  ),
  'leader can cancel a forming group visit'
);

select results_eq(
  $$
    select status::text
    from public.visits
    where id = (
      select visit_id
      from pg_temp.test_created_visits
      where label = 'secondary'
    )
  $$,
  $$ values ('cancelled'::text) $$,
  'cancelled group visit stores cancelled status'
);

reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'anon', true);

select is(
  pg_temp.sqlstate_from('select * from public.routes'),
  '42501',
  'anonymous user cannot query routes'
);

select is(
  pg_temp.sqlstate_from('select * from public.visits'),
  '42501',
  'anonymous user cannot query visits'
);

select is(
  pg_temp.sqlstate_from('select * from public.visit_members'),
  '42501',
  'anonymous user cannot query visit members'
);

select is(
  pg_temp.sqlstate_from(
    $$
      select public.create_group_visit(
        'day_hike'::public.visit_type,
        pg_catalog.now() + interval '4 hours',
        false,
        null,
        true
      )
    $$
  ),
  '42501',
  'anonymous user cannot execute group visit RPCs'
);

reset role;
select * from finish();

rollback;
