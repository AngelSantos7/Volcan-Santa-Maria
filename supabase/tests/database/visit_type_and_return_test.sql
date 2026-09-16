begin;

create extension if not exists pgtap with schema extensions;

select plan(14);

insert into auth.users (id, email, raw_user_meta_data)
values
  (
    'd1000000-0000-4000-8000-000000000001'::uuid,
    'day-hike@example.invalid',
    '{"first_name":"Diana","last_name":"Dia"}'::jsonb
  ),
  (
    'd2000000-0000-4000-8000-000000000002'::uuid,
    'expedition@example.invalid',
    '{"first_name":"Esteban","last_name":"Expedicion"}'::jsonb
  ),
  (
    'd3000000-0000-4000-8000-000000000003'::uuid,
    'expired-return@example.invalid',
    '{"first_name":"Rita","last_name":"Retorno"}'::jsonb
  );

update auth.users
set email_confirmed_at = pg_catalog.now()
where id in (
  'd1000000-0000-4000-8000-000000000001'::uuid,
  'd2000000-0000-4000-8000-000000000002'::uuid,
  'd3000000-0000-4000-8000-000000000003'::uuid
);

update public.profiles
set
  nationality_country_code = 'GT',
  date_of_birth = '1990-01-01'::date,
  phone = '+50255550000',
  document_type = 'passport'::public.document_type,
  document_number = 'RETURN-' || pg_catalog.right(id::text, 1)
where id in (
  'd1000000-0000-4000-8000-000000000001'::uuid,
  'd2000000-0000-4000-8000-000000000002'::uuid,
  'd3000000-0000-4000-8000-000000000003'::uuid
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
  'Retorno',
  'Family',
  '+50255550001'
from public.profiles as profile
where profile.id in (
  'd1000000-0000-4000-8000-000000000001'::uuid,
  'd2000000-0000-4000-8000-000000000002'::uuid,
  'd3000000-0000-4000-8000-000000000003'::uuid
);

create temporary table test_visit_returns (
  label text primary key,
  visit_id uuid not null,
  join_code text not null,
  selected_return_at timestamptz not null
);

grant all on table pg_temp.test_visit_returns to authenticated;

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

select results_eq(
  $$
    select enum_value.enumlabel
    from pg_catalog.pg_enum as enum_value
    join pg_catalog.pg_type as enum_type
      on enum_type.oid = enum_value.enumtypid
    join pg_catalog.pg_namespace as enum_schema
      on enum_schema.oid = enum_type.typnamespace
    where enum_schema.nspname = 'public'
      and enum_type.typname = 'visit_type'
    order by enum_value.enumsortorder
  $$,
  $$ values ('day_hike'::name), ('expedition_camping'::name) $$,
  'visit_type contains exactly the two supported ascent types'
);

select ok(
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'visits'
      and column_name = 'visit_type'
      and is_nullable = 'NO'
  )
  and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'visits'
      and column_name = 'expected_duration_minutes'
  ),
  'visits requires visit_type and no longer stores a fixed duration'
);

select is(
  pg_temp.sqlstate_from(
    'select public.create_group_visit(240, false, null, true)'
  ),
  '42883',
  'the former duration-based create_group_visit signature no longer exists'
);

set local role authenticated;
select pg_temp.authenticate_as(
  'd1000000-0000-4000-8000-000000000001'::uuid
);

select is(
  pg_temp.sqlstate_from(
    $$
      select public.create_group_visit(
        'day_hike'::public.visit_type,
        pg_catalog.clock_timestamp() - interval '1 minute',
        false,
        null,
        true
      )
    $$
  ),
  '22023',
  'group creation rejects an expected return in the past'
);

select lives_ok(
  $$
    with created as (
      select *
      from public.create_group_visit(
        'day_hike'::public.visit_type,
        pg_catalog.now() + interval '6 hours',
        false,
        null,
        true
      )
    )
    insert into pg_temp.test_visit_returns (
      label,
      visit_id,
      join_code,
      selected_return_at
    )
    select
      'day',
      visit_id,
      join_code,
      pg_catalog.now() + interval '6 hours'
    from created
  $$,
  'a tourist can create a day hike with an explicit return time'
);

select results_eq(
  $$
    select visit_type::text, status::text,
      expected_return_at = requested.selected_return_at,
      completed_at is null
    from public.visits as visit
    join pg_temp.test_visit_returns as requested
      on requested.visit_id = visit.id
    where requested.label = 'day'
  $$,
  $$ values ('day_hike'::text, 'forming'::text, true, true) $$,
  'day hike stores its type and return while completed_at remains null'
);

select pg_temp.authenticate_as(
  'd2000000-0000-4000-8000-000000000002'::uuid
);

select lives_ok(
  $$
    with created as (
      select *
      from public.create_group_visit(
        'expedition_camping'::public.visit_type,
        pg_catalog.now() + interval '2 days 3 hours',
        true,
        'Guia Campamento',
        true
      )
    )
    insert into pg_temp.test_visit_returns (
      label,
      visit_id,
      join_code,
      selected_return_at
    )
    select
      'expedition',
      visit_id,
      join_code,
      pg_catalog.now() + interval '2 days 3 hours'
    from created
  $$,
  'a tourist can create an expedition without a fixed 24-hour duration'
);

select results_eq(
  $$
    select visit_type::text,
      expected_return_at = requested.selected_return_at,
      completed_at is null
    from public.visits as visit
    join pg_temp.test_visit_returns as requested
      on requested.visit_id = visit.id
    where requested.label = 'expedition'
  $$,
  $$ values ('expedition_camping'::text, true, true) $$,
  'expedition stores the explicitly selected return and remains active'
);

select pg_temp.authenticate_as(
  'd3000000-0000-4000-8000-000000000003'::uuid
);

select lives_ok(
  $$
    with created as (
      select *
      from public.create_group_visit(
        'day_hike'::public.visit_type,
        pg_catalog.now() + interval '1 hour',
        false,
        null,
        true
      )
    )
    insert into pg_temp.test_visit_returns (
      label,
      visit_id,
      join_code,
      selected_return_at
    )
    select
      'expired-before-start',
      visit_id,
      join_code,
      pg_catalog.now() + interval '1 hour'
    from created
  $$,
  'a future return is accepted while forming'
);

reset role;
update public.visits
set expected_return_at = pg_catalog.clock_timestamp() - interval '1 minute'
where id = (
  select visit_id
  from pg_temp.test_visit_returns
  where label = 'expired-before-start'
);

set local role authenticated;
select pg_temp.authenticate_as(
  'd3000000-0000-4000-8000-000000000003'::uuid
);

select is(
  pg_temp.sqlstate_from(
    format(
      'select public.start_group_visit(%L::uuid)',
      (
        select visit_id
        from pg_temp.test_visit_returns
        where label = 'expired-before-start'
      )
    )
  ),
  '22023',
  'starting revalidates that the selected return is still in the future'
);

select pg_temp.authenticate_as(
  'd1000000-0000-4000-8000-000000000001'::uuid
);

select lives_ok(
  format(
    'select public.start_group_visit(%L::uuid)',
    (
      select visit_id
      from pg_temp.test_visit_returns
      where label = 'day'
    )
  ),
  'organizer can start the day hike'
);

select results_eq(
  $$
    select status::text, started_at is not null,
      expected_return_at = requested.selected_return_at,
      completed_at is null
    from public.visits as visit
    join pg_temp.test_visit_returns as requested
      on requested.visit_id = visit.id
    where requested.label = 'day'
  $$,
  $$ values ('in_progress'::text, true, true, true) $$,
  'start sets started_at, preserves expected return, and leaves completion null'
);

select lives_ok(
  format(
    'select public.complete_group_visit(%L::uuid)',
    (
      select visit_id
      from pg_temp.test_visit_returns
      where label = 'day'
    )
  ),
  'organizer can complete the in-progress day hike'
);

select results_eq(
  $$
    select status::text, completed_at is not null
    from public.visits as visit
    join pg_temp.test_visit_returns as requested
      on requested.visit_id = visit.id
    where requested.label = 'day'
  $$,
  $$ values ('completed'::text, true) $$,
  'completed_at receives a timestamp only after completion'
);

reset role;
select * from finish();

rollback;
