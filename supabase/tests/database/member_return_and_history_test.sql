begin;

create extension if not exists pgtap with schema extensions;

select plan(42);

insert into auth.users (id, email, raw_user_meta_data)
values
  (
    'e1000000-0000-4000-8000-000000000001'::uuid,
    'return-leader@example.invalid',
    '{"first_name":"Lina","last_name":"Lider"}'::jsonb
  ),
  (
    'e2000000-0000-4000-8000-000000000002'::uuid,
    'self-withdraw@example.invalid',
    '{"first_name":"Wendy","last_name":"Retiro"}'::jsonb
  ),
  (
    'e3000000-0000-4000-8000-000000000003'::uuid,
    'leader-removes@example.invalid',
    '{"first_name":"Rosa","last_name":"Retirada"}'::jsonb
  ),
  (
    'e4000000-0000-4000-8000-000000000004'::uuid,
    'self-return@example.invalid',
    '{"first_name":"Elsa","last_name":"Retorna"}'::jsonb
  ),
  (
    'e5000000-0000-4000-8000-000000000005'::uuid,
    'leader-marks@example.invalid',
    '{"first_name":"Marco","last_name":"Marcado"}'::jsonb
  ),
  (
    'e6000000-0000-4000-8000-000000000006'::uuid,
    'active-member@example.invalid',
    '{"first_name":"Alba","last_name":"Activa"}'::jsonb
  ),
  (
    'e7000000-0000-4000-8000-000000000007'::uuid,
    'return-outsider@example.invalid',
    '{"first_name":"Oscar","last_name":"Externo"}'::jsonb
  ),
  (
    'e8000000-0000-4000-8000-000000000008'::uuid,
    'solo-history@example.invalid',
    '{"first_name":"Sofia","last_name":"Individual"}'::jsonb
  ),
  (
    'e9000000-0000-4000-8000-000000000009'::uuid,
    'checkout-admin@example.invalid',
    '{"first_name":"Ada","last_name":"Admin"}'::jsonb
  );

update public.profiles
set
  nationality_country_code = 'GT',
  date_of_birth = '1990-01-01'::date,
  phone = '+50255550000',
  document_type = 'passport'::public.document_type,
  document_number = 'MEMBER-' || pg_catalog.right(id::text, 1)
where id <> 'e9000000-0000-4000-8000-000000000009'::uuid
  and id::text like 'e%';

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
where profile.id <> 'e9000000-0000-4000-8000-000000000009'::uuid
  and profile.id::text like 'e%';

update public.user_roles
set role = 'admin'::public.app_role
where user_id = 'e9000000-0000-4000-8000-000000000009'::uuid;

create temporary table test_member_visits (
  label text primary key,
  visit_id uuid not null,
  join_code text not null
);

grant all on table pg_temp.test_member_visits to authenticated;

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
select results_eq(
  $$
    select enum_value.enumlabel
    from pg_catalog.pg_enum as enum_value
    join pg_catalog.pg_type as enum_type
      on enum_type.oid = enum_value.enumtypid
    join pg_catalog.pg_namespace as enum_schema
      on enum_schema.oid = enum_type.typnamespace
    where enum_schema.nspname = 'public'
      and enum_type.typname = 'visit_member_status'
    order by enum_value.enumsortorder
  $$,
  $$
    values
      ('active'::name),
      ('withdrawn_before_start'::name),
      ('returning_early'::name),
      ('returned_early'::name),
      ('completed'::name)
  $$,
  'visit_member_status contains exactly the required lifecycle states'
);

-- 2
select is(
  (
    select count(*)
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'visit_members'
      and column_name in (
        'member_status',
        'return_started_at',
        'exit_reason',
        'exit_notes',
        'checked_out_at',
        'checkout_method',
        'checked_out_by'
      )
  ),
  7::bigint,
  'visit_members contains all return and checkout audit fields'
);

-- 3
select ok(
  not has_table_privilege('authenticated', 'public.visit_members', 'UPDATE'),
  'authenticated users have no direct update privilege on visit_members'
);

-- 4
select ok(
  not has_function_privilege(
    'anon',
    'public.withdraw_from_group(uuid)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.start_early_return(uuid,text,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.get_my_visit_history(integer,integer)',
    'EXECUTE'
  ),
  'anonymous users cannot execute return or history RPCs'
);

set local role authenticated;
select pg_temp.authenticate_as(
  'e1000000-0000-4000-8000-000000000001'::uuid
);

-- 5
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
    insert into pg_temp.test_member_visits (label, visit_id, join_code)
    select 'main', visit_id, join_code
    from created
  $$,
  'organizer creates the group used for member lifecycle tests'
);

select pg_temp.authenticate_as(
  'e2000000-0000-4000-8000-000000000002'::uuid
);
-- 6
select lives_ok(
  format(
    'select public.join_group_visit(%L, true)',
    (select join_code from pg_temp.test_member_visits where label = 'main')
  ),
  'self-withdraw member joins the forming group'
);

select pg_temp.authenticate_as(
  'e3000000-0000-4000-8000-000000000003'::uuid
);
-- 7
select lives_ok(
  format(
    'select public.join_group_visit(%L, true)',
    (select join_code from pg_temp.test_member_visits where label = 'main')
  ),
  'leader-removal member joins the forming group'
);

select pg_temp.authenticate_as(
  'e4000000-0000-4000-8000-000000000004'::uuid
);
-- 8
select lives_ok(
  format(
    'select public.join_group_visit(%L, true)',
    (select join_code from pg_temp.test_member_visits where label = 'main')
  ),
  'self-return member joins the forming group'
);

select pg_temp.authenticate_as(
  'e5000000-0000-4000-8000-000000000005'::uuid
);
-- 9
select lives_ok(
  format(
    'select public.join_group_visit(%L, true)',
    (select join_code from pg_temp.test_member_visits where label = 'main')
  ),
  'leader-marked member joins the forming group'
);

select pg_temp.authenticate_as(
  'e6000000-0000-4000-8000-000000000006'::uuid
);
-- 10
select lives_ok(
  format(
    'select public.join_group_visit(%L, true)',
    (select join_code from pg_temp.test_member_visits where label = 'main')
  ),
  'member who completes normally joins the forming group'
);

select pg_temp.authenticate_as(
  'e2000000-0000-4000-8000-000000000002'::uuid
);
-- 11
select lives_ok(
  format(
    'select public.withdraw_from_group(%L::uuid)',
    (select visit_id from pg_temp.test_member_visits where label = 'main')
  ),
  'normal member can withdraw voluntarily before the start'
);

-- 12
select results_eq(
  $$
    select member_status::text, count(*) over ()
    from public.visit_members
    where visit_id = (
      select visit_id from pg_temp.test_member_visits where label = 'main'
    )
      and user_id = 'e2000000-0000-4000-8000-000000000002'::uuid
  $$,
  $$ values ('withdrawn_before_start'::text, 1::bigint) $$,
  'self-withdraw changes status while preserving the membership row'
);

-- 13
select is(
  pg_temp.sqlstate_from(
    format(
      $$
        update public.visit_members
        set member_status = 'completed'::public.visit_member_status
        where visit_id = %L::uuid
          and user_id = 'e2000000-0000-4000-8000-000000000002'::uuid
      $$,
      (select visit_id from pg_temp.test_member_visits where label = 'main')
    )
  ),
  '42501',
  'tourist cannot change member_status through direct update'
);

select pg_temp.authenticate_as(
  'e1000000-0000-4000-8000-000000000001'::uuid
);
-- 14
select lives_ok(
  format(
    'select public.remove_member_before_start(%L::uuid, %L::uuid)',
    (select visit_id from pg_temp.test_member_visits where label = 'main'),
    'e3000000-0000-4000-8000-000000000003'
  ),
  'organizer can remove another active member before the start'
);

-- 15
select results_eq(
  $$
    select member_status::text, count(*) over ()
    from public.visit_members
    where visit_id = (
      select visit_id from pg_temp.test_member_visits where label = 'main'
    )
      and user_id = 'e3000000-0000-4000-8000-000000000003'::uuid
  $$,
  $$ values ('withdrawn_before_start'::text, 1::bigint) $$,
  'organizer removal preserves the historical membership row'
);

-- 16
select is(
  pg_temp.sqlstate_from(
    format(
      'select public.remove_member_before_start(%L::uuid, %L::uuid)',
      (select visit_id from pg_temp.test_member_visits where label = 'main'),
      'e1000000-0000-4000-8000-000000000001'
    )
  ),
  '42501',
  'organizer cannot remove themselves with the member-removal RPC'
);

-- 17
select lives_ok(
  format(
    'select public.start_group_visit(%L::uuid)',
    (select visit_id from pg_temp.test_member_visits where label = 'main')
  ),
  'organizer starts the group with remaining active members'
);

select pg_temp.authenticate_as(
  'e4000000-0000-4000-8000-000000000004'::uuid
);
-- 18
select lives_ok(
  format(
    $$
      select public.start_early_return(
        %L::uuid,
        'physical_discomfort',
        'Private note that must not be exposed'
      )
    $$,
    (select visit_id from pg_temp.test_member_visits where label = 'main')
  ),
  'active member can begin their own early return'
);

-- 19
select results_eq(
  $$
    select member_status::text, return_started_at is not null,
      checked_out_at is null
    from public.visit_members
    where visit_id = (
      select visit_id from pg_temp.test_member_visits where label = 'main'
    )
      and user_id = 'e4000000-0000-4000-8000-000000000004'::uuid
  $$,
  $$ values ('returning_early'::text, true, true) $$,
  'starting early return records its time without confirming checkout'
);

select pg_temp.authenticate_as(
  'e6000000-0000-4000-8000-000000000006'::uuid
);
select is(
  pg_temp.sqlstate_from(
    format(
      $$
        select exit_reason, exit_notes
        from public.visit_members
        where visit_id = %L::uuid
      $$,
      (select visit_id from pg_temp.test_member_visits where label = 'main')
    )
  ),
  '42501',
  'members cannot directly read another participant reason or notes'
);

-- 20
select is(
  pg_temp.sqlstate_from(
    format(
      'select public.confirm_my_early_checkout(%L::uuid)',
      (select visit_id from pg_temp.test_member_visits where label = 'main')
    )
  ),
  '42501',
  'another member cannot confirm someone else checkout'
);

select pg_temp.authenticate_as(
  'e4000000-0000-4000-8000-000000000004'::uuid
);
-- 21
select lives_ok(
  format(
    'select public.confirm_my_early_checkout(%L::uuid)',
    (select visit_id from pg_temp.test_member_visits where label = 'main')
  ),
  'returning member can confirm arrival at the checkpoint'
);

reset role;

-- 22
select results_eq(
  $$
    select member_status::text, checked_out_at is not null,
      checkout_method, checked_out_by is null
    from public.visit_members
    where visit_id = (
      select visit_id from pg_temp.test_member_visits where label = 'main'
    )
      and user_id = 'e4000000-0000-4000-8000-000000000004'::uuid
  $$,
  $$ values ('returned_early'::text, true, 'self'::text, true) $$,
  'self checkout records returned status, timestamp, and method'
);

set local role authenticated;
select pg_temp.authenticate_as(
  'e1000000-0000-4000-8000-000000000001'::uuid
);
-- 23
select lives_ok(
  format(
    $$
      select public.mark_member_returning_early(
        %L::uuid,
        %L::uuid,
        'personal_decision',
        null
      )
    $$,
    (select visit_id from pg_temp.test_member_visits where label = 'main'),
    'e5000000-0000-4000-8000-000000000005'
  ),
  'organizer can mark another active member as returning early'
);

-- 24
select results_eq(
  $$
    select member_status::text, return_started_at is not null,
      checked_out_at is null
    from public.visit_members
    where visit_id = (
      select visit_id from pg_temp.test_member_visits where label = 'main'
    )
      and user_id = 'e5000000-0000-4000-8000-000000000005'::uuid
  $$,
  $$ values ('returning_early'::text, true, true) $$,
  'organizer-marked return is not treated as confirmed checkout'
);

select pg_temp.authenticate_as(
  'e7000000-0000-4000-8000-000000000007'::uuid
);
-- 25
select is(
  pg_temp.sqlstate_from(
    format(
      $$
        select public.start_early_return(
          %L::uuid,
          'other',
          null
        )
      $$,
      (select visit_id from pg_temp.test_member_visits where label = 'main')
    )
  ),
  '42501',
  'external authenticated user cannot change member state'
);

select pg_temp.authenticate_as(
  'e1000000-0000-4000-8000-000000000001'::uuid
);
-- 26
select is(
  pg_temp.sqlstate_from(
    format(
      'select public.confirm_member_checkout_by_admin(%L::uuid, %L::uuid)',
      (select visit_id from pg_temp.test_member_visits where label = 'main'),
      'e5000000-0000-4000-8000-000000000005'
    )
  ),
  '42501',
  'tourist cannot use the administrative checkout RPC'
);

select pg_temp.authenticate_as(
  'e9000000-0000-4000-8000-000000000009'::uuid
);
-- 27
select lives_ok(
  format(
    'select public.confirm_member_checkout_by_admin(%L::uuid, %L::uuid)',
    (select visit_id from pg_temp.test_member_visits where label = 'main'),
    'e5000000-0000-4000-8000-000000000005'
  ),
  'admin can confirm checkout for a returning member'
);

reset role;

-- 28
select results_eq(
  $$
    select member_status::text, checked_out_at is not null,
      checkout_method, checked_out_by
    from public.visit_members
    where visit_id = (
      select visit_id from pg_temp.test_member_visits where label = 'main'
    )
      and user_id = 'e5000000-0000-4000-8000-000000000005'::uuid
  $$,
  $$
    values (
      'returned_early'::text,
      true,
      'staff'::text,
      'e9000000-0000-4000-8000-000000000009'::uuid
    )
  $$,
  'administrative checkout records staff method and actor'
);

set local role authenticated;
select pg_temp.authenticate_as(
  'e1000000-0000-4000-8000-000000000001'::uuid
);

-- 29
select lives_ok(
  format(
    'select public.complete_group_visit(%L::uuid)',
    (select visit_id from pg_temp.test_member_visits where label = 'main')
  ),
  'organizer completes the group visit'
);

-- 30
select is(
  (
    select count(*)
    from public.visit_members
    where visit_id = (
      select visit_id from pg_temp.test_member_visits where label = 'main'
    )
      and member_status = 'completed'::public.visit_member_status
  ),
  2::bigint,
  'all members still active at group completion become completed'
);

-- 31
select is(
  (
    select count(*)
    from public.visit_members
    where visit_id = (
      select visit_id from pg_temp.test_member_visits where label = 'main'
    )
      and member_status = 'returned_early'::public.visit_member_status
  ),
  2::bigint,
  'confirmed early returns remain returned_early after group completion'
);

-- 32
select is(
  (
    select count(*)
    from public.visit_members
    where visit_id = (
      select visit_id from pg_temp.test_member_visits where label = 'main'
    )
      and member_status =
        'withdrawn_before_start'::public.visit_member_status
  ),
  2::bigint,
  'pre-start withdrawals remain unchanged after group completion'
);

-- 33
select is(
  (
    select count(*)
    from public.visit_members
    where visit_id = (
      select visit_id from pg_temp.test_member_visits where label = 'main'
    )
  ),
  6::bigint,
  'all membership rows remain stored without any delete'
);

select pg_temp.authenticate_as(
  'e4000000-0000-4000-8000-000000000004'::uuid
);
-- 34
select results_eq(
  $$
    select history.visit_id, history.member_status::text,
      history.participant_count
    from public.get_my_visit_history(20, 0) as history
  $$,
  $$
    select visit_id, 'returned_early'::text, 4::bigint
    from pg_temp.test_member_visits
    where label = 'main'
  $$,
  'history returns the authenticated member own group visit and status'
);

-- 35
select is(
  (select count(*) from public.get_my_visit_history(20, 0)),
  1::bigint,
  'history contains no visits belonging only to other users'
);

select pg_temp.authenticate_as(
  'e7000000-0000-4000-8000-000000000007'::uuid
);
-- 36
select is_empty(
  $$ select * from public.get_my_visit_history(20, 0) $$,
  'external user history cannot expose the completed group'
);

select pg_temp.authenticate_as(
  'e8000000-0000-4000-8000-000000000008'::uuid
);
-- 37
select lives_ok(
  $$
    with created as (
      select *
      from public.create_group_visit(
        'expedition_camping'::public.visit_type,
        pg_catalog.now() + interval '2 days',
        false,
        null,
        true
      )
    )
    insert into pg_temp.test_member_visits (label, visit_id, join_code)
    select 'solo', visit_id, join_code
    from created
  $$,
  'single participant creates an individual-history visit'
);

-- 38
select lives_ok(
  format(
    'select public.start_group_visit(%L::uuid)',
    (select visit_id from pg_temp.test_member_visits where label = 'solo')
  ),
  'single-participant visit can start'
);

-- 39
select lives_ok(
  format(
    'select public.complete_group_visit(%L::uuid)',
    (select visit_id from pg_temp.test_member_visits where label = 'solo')
  ),
  'single-participant visit can complete'
);

-- 40
select results_eq(
  $$
    select participant_count, member_role::text, member_status::text,
      visit_type::text
    from public.get_my_visit_history(20, 0)
  $$,
  $$
    values (
      1::bigint,
      'leader'::text,
      'completed'::text,
      'expedition_camping'::text
    )
  $$,
  'history identifies a one-member visit as individual-compatible'
);

-- 41
select is(
  pg_temp.sqlstate_from('select * from public.get_my_visit_history(51, 0)'),
  '22023',
  'history enforces a bounded page size'
);

reset role;
select * from finish();

rollback;
