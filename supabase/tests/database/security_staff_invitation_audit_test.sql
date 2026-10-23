begin;

create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
values
  ('fa900000-0000-4000-8000-000000000001', 'sec009-admin@example.invalid', now(), '{"date_of_birth":"1990-01-01","first_name":"Admin","last_name":"SEC009"}'),
  ('fa900000-0000-4000-8000-000000000003', 'sec009-outsider@example.invalid', now(), '{"date_of_birth":"1990-01-01","first_name":"Tourist","last_name":"SEC009"}');

insert into auth.users (id, email, raw_user_meta_data)
values
  ('fa900000-0000-4000-8000-000000000002', 'sec009-invite@example.invalid', '{"first_name":"New","last_name":"Manager","staff_invitation":true}'),
  ('fa900000-0000-4000-8000-000000000004', 'sec009-partial@example.invalid', '{"first_name":"Partial","last_name":"Manager","staff_invitation":true}');

update auth.users
set invited_at = now()
where id in (
  'fa900000-0000-4000-8000-000000000002',
  'fa900000-0000-4000-8000-000000000004'
);
set constraints auth.auth_users_check_registration_age immediate;

update public.user_roles
set role = 'admin'
where user_id = 'fa900000-0000-4000-8000-000000000001';

-- Model the historical partial state: role/profile/permissions persisted but
-- the ignored audit insert failed.
update public.user_roles
set role = 'visitor_manager'
where user_id = 'fa900000-0000-4000-8000-000000000004';
update public.profiles
set phone = '+50255550004'
where id = 'fa900000-0000-4000-8000-000000000004';
insert into public.staff_permissions (
  user_id, is_active, invitation_status, can_manage_visits
)
values (
  'fa900000-0000-4000-8000-000000000004', false, 'pending', true
);

create function pg_temp.authenticate_as(requested_user_id uuid)
returns void
language plpgsql
as $$
begin
  perform set_config(
    'request.jwt.claims',
    pg_catalog.jsonb_build_object('sub', requested_user_id::text, 'role', 'authenticated')::text,
    true
  );
  perform set_config('request.jwt.claim.sub', requested_user_id::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
end;
$$;

create function pg_temp.reject_sec009_audit()
returns trigger
language plpgsql
as $$
begin
  if new.action in ('staff_invitation_created', 'staff_invitation_resend_requested')
    and new.target_id = current_setting('sec009.rejected_target', true) then
    raise exception 'sec009_forced_audit_failure';
  end if;
  return new;
end;
$$;

select ok(
  not has_function_privilege('anon', 'public.admin_finalize_staff_invitation(uuid,text,text,jsonb)', 'EXECUTE'),
  'anonymous users cannot finalize staff invitations'
);
select ok(
  not has_function_privilege('anon', 'public.admin_find_recoverable_staff_invitation(text)', 'EXECUTE'),
  'anonymous users cannot inspect recoverable invitations'
);
select ok(
  not has_function_privilege('anon', 'public.admin_record_staff_invitation_resend_request(uuid,text)', 'EXECUTE'),
  'anonymous users cannot audit resend requests'
);

set local role authenticated;
select pg_temp.authenticate_as('fa900000-0000-4000-8000-000000000003');
select throws_ok(
  $$select public.admin_find_recoverable_staff_invitation('sec009-invite@example.invalid')$$,
  '42501',
  'Administrator access is required.',
  'tourists cannot inspect invitation recovery state'
);
select throws_ok(
  $$select public.admin_finalize_staff_invitation('fa900000-0000-4000-8000-000000000002','sec009-invite@example.invalid','+50255550002','{}')$$,
  '42501',
  'Administrator access is required.',
  'tourists cannot finalize invitations'
);

select pg_temp.authenticate_as('fa900000-0000-4000-8000-000000000001');
select is(
  public.admin_find_recoverable_staff_invitation(' SEC009-INVITE@EXAMPLE.INVALID '),
  'fa900000-0000-4000-8000-000000000002'::uuid,
  'administrator finds the trusted incomplete Auth invitation'
);

reset role;
select set_config('sec009.rejected_target', 'fa900000-0000-4000-8000-000000000002', true);
create trigger sec009_reject_audit_insert
before insert on public.audit_logs
for each row execute function pg_temp.reject_sec009_audit();

set local role authenticated;
select pg_temp.authenticate_as('fa900000-0000-4000-8000-000000000001');
select throws_ok(
  $$select public.admin_finalize_staff_invitation(
    'fa900000-0000-4000-8000-000000000002',
    'sec009-invite@example.invalid',
    '+50255550002',
    '{"can_view_visitors":true,"can_manage_visits":true}'
  )$$,
  'P0001',
  'sec009_forced_audit_failure',
  'forced audit failure is returned instead of reporting success'
);

reset role;
select is(
  (select role::text from public.user_roles where user_id = 'fa900000-0000-4000-8000-000000000002'),
  'tourist',
  'role promotion rolls back when the audit insert fails'
);
select is(
  (select phone from public.profiles where id = 'fa900000-0000-4000-8000-000000000002'),
  null::text,
  'profile update rolls back when the audit insert fails'
);
select is(
  (select count(*) from public.staff_permissions where user_id = 'fa900000-0000-4000-8000-000000000002'),
  0::bigint,
  'permission insertion rolls back when the audit insert fails'
);
select is(
  (select count(*) from public.audit_logs where action = 'staff_invitation_created' and target_id = 'fa900000-0000-4000-8000-000000000002'),
  0::bigint,
  'failed transaction leaves no false creation audit event'
);

drop trigger sec009_reject_audit_insert on public.audit_logs;

set local role authenticated;
select pg_temp.authenticate_as('fa900000-0000-4000-8000-000000000001');
select lives_ok(
  $$select public.admin_finalize_staff_invitation(
    'fa900000-0000-4000-8000-000000000002',
    'sec009-invite@example.invalid',
    '+50255550002',
    '{"can_view_visitors":true,"can_manage_visits":true,"can_manage_staff":"true"}'
  )$$,
  'retry finalizes the recoverable identity after audit is available'
);

reset role;
select is(
  (select role::text from public.user_roles where user_id = 'fa900000-0000-4000-8000-000000000002'),
  'visitor_manager',
  'successful retry assigns only the manager role'
);
select ok(
  (
    select not is_active
      and invitation_status = 'pending'
      and can_view_visitors
      and can_manage_visits
      and not can_manage_staff
    from public.staff_permissions
    where user_id = 'fa900000-0000-4000-8000-000000000002'
  ),
  'successful retry stores exact boolean permissions and remains inactive'
);
select ok(
  (
    select metadata = '{"source":"invite_staff"}'::jsonb
      and not (metadata ?| array['email','full_name','phone','token','link'])
    from public.audit_logs
    where action = 'staff_invitation_created'
      and target_id = 'fa900000-0000-4000-8000-000000000002'
  ),
  'creation audit contains no complete personal data, token, or link'
);

set local role authenticated;
select pg_temp.authenticate_as('fa900000-0000-4000-8000-000000000001');
select lives_ok(
  $$select public.admin_finalize_staff_invitation(
    'fa900000-0000-4000-8000-000000000002',
    'sec009-invite@example.invalid',
    '+50255559999',
    '{"can_view_visitors":false}'
  )$$,
  'retry after a lost success response is idempotent'
);

reset role;
select is(
  (select count(*) from public.audit_logs where action = 'staff_invitation_created' and target_id = 'fa900000-0000-4000-8000-000000000002'),
  1::bigint,
  'idempotent retry does not duplicate the creation audit event'
);
select ok(
  (
    select phone = '+50255550002' and can_view_visitors
    from public.profiles
    join public.staff_permissions on staff_permissions.user_id = profiles.id
    where profiles.id = 'fa900000-0000-4000-8000-000000000002'
  ),
  'idempotent retry does not overwrite finalized profile or permissions'
);

set local role authenticated;
select pg_temp.authenticate_as('fa900000-0000-4000-8000-000000000001');
select lives_ok(
  $$select public.admin_finalize_staff_invitation(
    'fa900000-0000-4000-8000-000000000004',
    'sec009-partial@example.invalid',
    '+50255559999',
    '{"can_manage_visits":false}'
  )$$,
  'historical partial invitation can recover its missing audit event'
);

reset role;
select ok(
  (
    select phone = '+50255550004' and can_manage_visits
    from public.profiles
    join public.staff_permissions on staff_permissions.user_id = profiles.id
    where profiles.id = 'fa900000-0000-4000-8000-000000000004'
  ),
  'historical recovery does not overwrite already-persisted data'
);
select is(
  (select metadata ->> 'source' from public.audit_logs where action = 'staff_invitation_created' and target_id = 'fa900000-0000-4000-8000-000000000004'),
  'invite_staff_recovery',
  'historical recovery records a distinct audit source'
);

select set_config('sec009.rejected_target', 'fa900000-0000-4000-8000-000000000002', true);
create trigger sec009_reject_audit_insert
before insert on public.audit_logs
for each row execute function pg_temp.reject_sec009_audit();

set local role authenticated;
select pg_temp.authenticate_as('fa900000-0000-4000-8000-000000000001');
select throws_ok(
  $$select public.admin_record_staff_invitation_resend_request(
    'fa900000-0000-4000-8000-000000000002',
    'sec009-invite@example.invalid'
  )$$,
  'P0001',
  'sec009_forced_audit_failure',
  'resend audit failure is explicit before the Edge Function sends email'
);

reset role;
drop trigger sec009_reject_audit_insert on public.audit_logs;

set local role authenticated;
select pg_temp.authenticate_as('fa900000-0000-4000-8000-000000000001');
select lives_ok(
  $$select public.admin_record_staff_invitation_resend_request(
    'fa900000-0000-4000-8000-000000000002',
    'sec009-invite@example.invalid'
  )$$,
  'resend request is recorded when audit storage succeeds'
);

reset role;
select ok(
  (
    select actor_user_id = 'fa900000-0000-4000-8000-000000000001'
      and metadata = '{}'::jsonb
    from public.audit_logs
    where action = 'staff_invitation_resend_requested'
      and target_id = 'fa900000-0000-4000-8000-000000000002'
  ),
  'resend request records the administrator without personal data'
);

select * from finish();
rollback;
