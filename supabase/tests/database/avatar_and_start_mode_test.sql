begin;

create extension if not exists pgtap with schema extensions;

select plan(27);

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
values
  (
    '92000000-0000-4000-8000-000000000001'::uuid,
    'avatar-leader@example.invalid',
    pg_catalog.now(),
    '{"first_name":"Avatar","last_name":"Leader"}'::jsonb
  ),
  (
    '92000000-0000-4000-8000-000000000002'::uuid,
    'avatar-member@example.invalid',
    pg_catalog.now(),
    '{"first_name":"Avatar","last_name":"Member"}'::jsonb
  ),
  (
    '92000000-0000-4000-8000-000000000003'::uuid,
    'avatar-outsider@example.invalid',
    pg_catalog.now(),
    '{"first_name":"Avatar","last_name":"Outsider"}'::jsonb
  );

update public.profiles
set
  nationality_country_code = 'GT',
  date_of_birth = '1990-01-01'::date,
  phone = '+5025555200' || right(id::text, 1),
  document_type = 'passport'::public.document_type,
  document_number = 'AVATAR-' || id::text
where id in (
  '92000000-0000-4000-8000-000000000001'::uuid,
  '92000000-0000-4000-8000-000000000002'::uuid,
  '92000000-0000-4000-8000-000000000003'::uuid
);

insert into public.emergency_contacts (
  user_id,
  first_name,
  last_name,
  relationship,
  phone
)
select
  id,
  'Emergency',
  'Contact',
  'Family',
  '+5025555300' || right(id::text, 1)
from auth.users
where id in (
  '92000000-0000-4000-8000-000000000001'::uuid,
  '92000000-0000-4000-8000-000000000002'::uuid,
  '92000000-0000-4000-8000-000000000003'::uuid
);

create temporary table mode_test_state (
  now_visit_id uuid,
  now_join_code text,
  scheduled_visit_id uuid,
  before_start timestamptz,
  after_start timestamptz
);
insert into mode_test_state default values;
grant all on table pg_temp.mode_test_state to authenticated;

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

select has_column('public', 'profiles', 'avatar_kind', 'profiles stores avatar kind');
select has_column('public', 'profiles', 'avatar_path', 'profiles stores only the avatar path');
select has_column('public', 'profiles', 'avatar_preset', 'profiles stores a preset identifier');
select has_column('public', 'visits', 'start_mode', 'visits distinguishes now and scheduled starts');

select results_eq(
  $$ select public from storage.buckets where id = 'avatars' $$,
  $$ values (false) $$,
  'the avatars bucket is private'
);

set local role authenticated;
select pg_temp.authenticate_as('92000000-0000-4000-8000-000000000001'::uuid);

select lives_ok(
  $$
    update public.profiles
    set avatar_kind = 'preset', avatar_preset = 'mountain', avatar_path = null
    where id = '92000000-0000-4000-8000-000000000001'::uuid
  $$,
  'a tourist can update their own avatar metadata'
);

select is(
  pg_temp.sqlstate_from(
    $$
      update public.profiles
      set avatar_kind = 'preset', avatar_preset = 'unknown', avatar_path = null
      where id = '92000000-0000-4000-8000-000000000001'::uuid
    $$
  ),
  '23514',
  'profiles reject unknown preset identifiers'
);

select is(
  pg_temp.sqlstate_from(
    $$
      update public.profiles
      set
        avatar_kind = 'uploaded',
        avatar_path = '92000000-0000-4000-8000-000000000002/avatar.webp',
        avatar_preset = null
      where id = '92000000-0000-4000-8000-000000000001'::uuid
    $$
  ),
  '23514',
  'profiles reject an uploaded avatar path owned by another user'
);

select results_eq(
  $$
    update public.profiles
    set avatar_kind = 'preset', avatar_preset = 'pine', avatar_path = null
    where id = '92000000-0000-4000-8000-000000000002'::uuid
    returning id
  $$,
  array[]::uuid[],
  'a tourist cannot update another profile avatar'
);

select lives_ok(
  $$
    insert into storage.objects (bucket_id, name, metadata)
    values (
      'avatars',
      '92000000-0000-4000-8000-000000000001/avatar.webp',
      '{"mimetype":"image/webp"}'::jsonb
    )
  $$,
  'a tourist can create only their avatar file'
);

select is(
  pg_temp.sqlstate_from(
    $$
      insert into storage.objects (bucket_id, name, metadata)
      values (
        'avatars',
        '92000000-0000-4000-8000-000000000002/avatar.webp',
        '{"mimetype":"image/webp"}'::jsonb
      )
    $$
  ),
  '42501',
  'a tourist cannot create an avatar in another user folder'
);

select lives_ok(
  $$
    with created as (
      select *
      from public.create_group_visit(
        'day_hike'::public.visit_type,
        pg_catalog.now() + interval '3 days',
        pg_catalog.now() + interval '8 hours',
        false,
        null,
        true,
        true,
        'now'
      )
    )
    update mode_test_state
    set now_visit_id = created.visit_id, now_join_code = created.join_code
    from created
  $$,
  'start_mode now creates a forming group'
);

select results_eq(
  $$
    select
      visit.start_mode,
      visit.started_at is null,
      visit.planned_start_at >= visit.created_at,
      visit.planned_start_at < visit.created_at + interval '5 seconds'
    from public.visits as visit
    where visit.id = (select now_visit_id from mode_test_state)
  $$,
  $$ values ('now'::text, true, true, true) $$,
  'now mode uses a server creation reference and does not set started_at'
);

select pg_temp.authenticate_as('92000000-0000-4000-8000-000000000002'::uuid);

select lives_ok(
  $$
    insert into storage.objects (bucket_id, name, metadata)
    values (
      'avatars',
      '92000000-0000-4000-8000-000000000002/avatar.webp',
      '{"mimetype":"image/webp"}'::jsonb
    )
  $$,
  'a second tourist can create their own avatar file'
);

select lives_ok(
  $$
    select public.join_group_visit(
      (select now_join_code from mode_test_state),
      true
    )
  $$,
  'the second tourist can join the group'
);

select pg_temp.authenticate_as('92000000-0000-4000-8000-000000000001'::uuid);

select results_eq(
  $$
    select name
    from storage.objects
    where bucket_id = 'avatars'
    order by name
  $$,
  $$
    values
      ('92000000-0000-4000-8000-000000000001/avatar.webp'::text),
      ('92000000-0000-4000-8000-000000000002/avatar.webp'::text)
  $$,
  'group members can read the avatar objects needed for the group'
);

select pg_temp.authenticate_as('92000000-0000-4000-8000-000000000003'::uuid);

select is(
  (select count(*) from storage.objects where bucket_id = 'avatars'),
  0::bigint,
  'an unrelated tourist cannot list group avatar objects'
);

select pg_temp.authenticate_as('92000000-0000-4000-8000-000000000002'::uuid);

select results_eq(
  $$
    update storage.objects
    set metadata = '{"mimetype":"image/webp","tampered":true}'::jsonb
    where name = '92000000-0000-4000-8000-000000000001/avatar.webp'
    returning name
  $$,
  array[]::text[],
  'a tourist cannot modify another user avatar'
);

select pg_temp.authenticate_as('92000000-0000-4000-8000-000000000001'::uuid);
update mode_test_state set before_start = pg_catalog.clock_timestamp();

select lives_ok(
  format(
    'select public.start_group_visit(%L::uuid)',
    (select now_visit_id from mode_test_state)
  ),
  'a now visit can be started immediately'
);
update mode_test_state set after_start = pg_catalog.clock_timestamp();

select results_eq(
  $$
    select
      visit.status::text,
      visit.started_at between state.before_start and state.after_start
    from public.visits as visit
    cross join mode_test_state as state
    where visit.id = state.now_visit_id
  $$,
  $$ values ('in_progress'::text, true) $$,
  'started_at is generated from server time when the organizer starts'
);

select lives_ok(
  format(
    'select public.complete_group_visit(%L::uuid)',
    (select now_visit_id from mode_test_state)
  ),
  'the immediate visit can be completed before the next scenario'
);

select lives_ok(
  $$
    with created as (
      select *
      from public.create_group_visit(
        'day_hike'::public.visit_type,
        pg_catalog.now() + interval '1 day',
        pg_catalog.now() + interval '1 day 8 hours',
        false,
        null,
        true,
        true,
        'scheduled'
      )
    )
    update mode_test_state
    set scheduled_visit_id = created.visit_id
    from created
  $$,
  'start_mode scheduled preserves a future plan'
);

select is(
  pg_temp.sqlstate_from(
    format(
      'select public.start_group_visit(%L::uuid)',
      (select scheduled_visit_id from mode_test_state)
    )
  ),
  'P0001',
  'a scheduled visit cannot start before planned_start_at'
);

reset role;

select lives_ok(
  $$
    update public.visits
    set planned_start_at = pg_catalog.clock_timestamp() - interval '1 second'
    where id = (select scheduled_visit_id from mode_test_state)
  $$,
  'the test advances the scheduled visit to its start time'
);

set local role authenticated;
select pg_temp.authenticate_as('92000000-0000-4000-8000-000000000001'::uuid);
update mode_test_state set before_start = pg_catalog.clock_timestamp();

select lives_ok(
  format(
    'select public.start_group_visit(%L::uuid)',
    (select scheduled_visit_id from mode_test_state)
  ),
  'a scheduled visit can start once planned_start_at is reached'
);
update mode_test_state set after_start = pg_catalog.clock_timestamp();

select results_eq(
  $$
    select
      visit.start_mode,
      visit.status::text,
      visit.started_at between state.before_start and state.after_start
    from public.visits as visit
    cross join mode_test_state as state
    where visit.id = state.scheduled_visit_id
  $$,
  $$ values ('scheduled'::text, 'in_progress'::text, true) $$,
  'scheduled mode also records the actual start only from server time'
);

reset role;
set local role anon;
select is(
  pg_temp.sqlstate_from(
    $$
      insert into storage.objects (bucket_id, name, metadata)
      values ('avatars', 'anonymous/avatar.webp', '{}'::jsonb)
    $$
  ),
  '42501',
  'anonymous users cannot upload avatars'
);

select * from finish();
rollback;
