begin;

create extension if not exists pgtap with schema extensions;

select plan(11);

insert into auth.users (
  id,
  email,
  email_confirmed_at,
  raw_user_meta_data
)
values (
  '91000000-0000-4000-8000-000000000001'::uuid,
  'planned-start@example.invalid',
  pg_catalog.now(),
  '{"first_name":"Plan","last_name":"Prueba"}'::jsonb
);

update public.profiles
set
  nationality_country_code = 'GT',
  date_of_birth = '1990-01-01'::date,
  phone = '+50255551001',
  document_type = 'passport'::public.document_type,
  document_number = 'PLANNED-START-1'
where id = '91000000-0000-4000-8000-000000000001'::uuid;

insert into public.emergency_contacts (
  user_id,
  first_name,
  last_name,
  relationship,
  phone
)
values (
  '91000000-0000-4000-8000-000000000001'::uuid,
  'Contacto',
  'Planificado',
  'Family',
  '+50255551002'
);

create temporary table planned_schedule as
select
  pg_catalog.date_trunc('minute', pg_catalog.now() + interval '1 day') as planned_at,
  pg_catalog.date_trunc('minute', pg_catalog.now() + interval '1 day 8 hours') as return_at,
  null::uuid as visit_id;

grant all on table pg_temp.planned_schedule to authenticated;

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

select has_column('public', 'visits', 'planned_start_at', 'visits stores the planned start');
select has_column('public', 'visits', 'recommendations_accepted_at', 'visits stores server acceptance time');
select has_column('public', 'visits', 'recommendations_version', 'visits stores the recommendation version');

select ok(
  exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.visits'::regclass
      and conname = 'visits_planned_start_before_return'
  ),
  'the database enforces planned start before expected return'
);

select is(
  pg_temp.sqlstate_from(
    $$
      select public.create_group_visit(
        'day_hike'::public.visit_type,
        pg_catalog.now() + interval '8 hours',
        false,
        null,
        true
      )
    $$
  ),
  '42883',
  'the previous RPC signature cannot bypass recommendation acceptance'
);

set local role authenticated;
select pg_temp.authenticate_as('91000000-0000-4000-8000-000000000001'::uuid);

select is(
  pg_temp.sqlstate_from(
    $$
      select public.create_group_visit(
        'day_hike'::public.visit_type,
        pg_catalog.now() + interval '1 hour',
        pg_catalog.now() + interval '8 hours',
        false,
        null,
        true,
        false
      )
    $$
  ),
  '23514',
  'the RPC rejects an unaccepted recommendation confirmation'
);

select is(
  pg_temp.sqlstate_from(
    $$
      select public.create_group_visit(
        'day_hike'::public.visit_type,
        pg_catalog.now() + interval '8 hours',
        pg_catalog.now() + interval '1 hour',
        false,
        null,
        true,
        true,
        'scheduled'
      )
    $$
  ),
  '22023',
  'the RPC rejects a planned start at or after expected return'
);

select lives_ok(
  $$
    with created as (
      select created.visit_id
      from planned_schedule as schedule
      cross join lateral public.create_group_visit(
        'day_hike'::public.visit_type,
        schedule.planned_at,
        schedule.return_at,
        false,
        null,
        true,
        true,
        'scheduled'
      ) as created
    )
    update planned_schedule
    set visit_id = created.visit_id
    from created
  $$,
  'a visit can be created with a valid planned period and acceptance'
);

reset role;

select results_eq(
  $$
    select
      visit.planned_start_at = schedule.planned_at,
      visit.expected_return_at = schedule.return_at,
      visit.started_at is null,
      visit.recommendations_accepted_at is not null,
      visit.recommendations_accepted_at >= visit.created_at,
      visit.recommendations_version
    from planned_schedule as schedule
    join public.visits as visit on visit.id = schedule.visit_id
  $$,
  $$ values (true, true, true, true, true, 'v1'::text) $$,
  'the RPC preserves planned times, leaves actual start empty, and records server acceptance'
);

select is(
  pg_temp.sqlstate_from(
    format(
      'update public.visits set planned_start_at = expected_return_at where id = %L::uuid',
      (select visit_id from planned_schedule)
    )
  ),
  '23514',
  'the table constraint also rejects an invalid planned period'
);

select lives_ok(
  format(
    $sql$
      update public.visits
      set
        planned_start_at = null,
        recommendations_accepted_at = null,
        recommendations_version = null
      where id = %L::uuid
    $sql$,
    (select visit_id from planned_schedule)
  ),
  'historical visits remain compatible with null planning and acceptance fields'
);

select * from finish();
rollback;
