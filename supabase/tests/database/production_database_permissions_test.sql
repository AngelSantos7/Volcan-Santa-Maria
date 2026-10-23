begin;

create extension if not exists pgtap with schema extensions;
select no_plan();

create function pg_temp.authenticate_as(
  requested_user_id uuid,
  requested_role text default 'authenticated'
)
returns void
language plpgsql
as $$
begin
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', requested_user_id, 'role', requested_role)::text,
    true
  );
  perform set_config('request.jwt.claim.sub', requested_user_id::text, true);
  perform set_config('request.jwt.claim.role', requested_role, true);
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
  has_column_privilege('service_role', 'public.staff_permissions', 'user_id', 'SELECT')
    and has_column_privilege('service_role', 'public.staff_permissions', 'invitation_status', 'SELECT')
    and has_column_privilege('service_role', 'public.staff_permissions', 'invitation_revoked_at', 'SELECT'),
  'service role can perform the exact invite-staff lookup'
);
select ok(
  not has_table_privilege('service_role', 'public.staff_permissions', 'SELECT')
    and not has_column_privilege('service_role', 'public.staff_permissions', 'can_manage_visits', 'SELECT'),
  'service role cannot read unrelated staff permission data'
);

set local role service_role;
select lives_ok(
  $$select invitation_status, invitation_revoked_at
    from public.staff_permissions
    where user_id = 'fb580000-0000-4000-8000-000000000001'::uuid$$,
  'the invite-staff service-role query is authorized'
);
select is(
  pg_temp.sqlstate_from('select * from public.staff_permissions'),
  '42501',
  'service role cannot use SELECT star on staff permissions'
);
reset role;

select ok(
  (
    select procedure.prosecdef
      and procedure.proowner = 'postgres'::regrole
      and 'search_path=""' = any(procedure.proconfig)
    from pg_proc as procedure
    where procedure.oid = 'public.can_read_notification_media(text)'::regprocedure
  ),
  'notification media helper is owner-controlled and has an empty search path'
);
select ok(
  has_function_privilege('authenticated', 'public.can_read_notification_media(text)', 'EXECUTE')
    and not has_function_privilege('anon', 'public.can_read_notification_media(text)', 'EXECUTE')
    and not has_function_privilege('service_role', 'public.can_read_notification_media(text)', 'EXECUTE'),
  'only authenticated clients can invoke the notification media predicate'
);
select ok(
  not has_table_privilege('authenticated', 'public.notifications', 'SELECT')
    and not has_table_privilege('authenticated', 'public.notification_recipients', 'SELECT'),
  'notification tables remain unavailable for direct authenticated reads'
);
select ok(
  not has_table_privilege('anon', 'public.visit_minors', 'SELECT')
    and not has_table_privilege('authenticated', 'public.visit_minors', 'SELECT')
    and not has_table_privilege('service_role', 'public.visit_minors', 'SELECT'),
  'minor records remain available only through guarded RPCs'
);
select ok(
  (
    select position('can_read_notification_media' in qual) > 0
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'recipients read notification media'
  ),
  'Storage notification media policy delegates to the hardened helper'
);

insert into auth.users(id, email, email_confirmed_at, raw_user_meta_data)
values
  (
    'fb580000-0000-4000-8000-000000000001',
    'permissions-recipient@example.invalid',
    now(),
    '{"date_of_birth":"1990-01-01","first_name":"Recipient","last_name":"Test"}'
  ),
  (
    'fb580000-0000-4000-8000-000000000002',
    'permissions-outsider@example.invalid',
    now(),
    '{"date_of_birth":"1990-01-01","first_name":"Outsider","last_name":"Test"}'
  );

insert into public.notifications(
  id, title_es, body_es, priority, status, audience, audience_user_id,
  image_path, published_at, created_by
)
values (
  'fb580000-0000-4000-8000-000000000010',
  'Aviso protegido',
  'Contenido protegido',
  'info',
  'published',
  'specific_user',
  'fb580000-0000-4000-8000-000000000001',
  'permissions/protected.webp',
  now(),
  'fb580000-0000-4000-8000-000000000001'
);
insert into public.notification_recipients(notification_id, user_id)
values (
  'fb580000-0000-4000-8000-000000000010',
  'fb580000-0000-4000-8000-000000000001'
);
insert into storage.objects(bucket_id, name, owner_id)
values (
  'notification-media',
  'permissions/protected.webp',
  'fb580000-0000-4000-8000-000000000001'
);

set local role authenticated;
select pg_temp.authenticate_as('fb580000-0000-4000-8000-000000000001');
select is(
  public.can_read_notification_media('permissions/protected.webp'),
  true,
  'an addressed recipient is authorized for the notification image'
);
select results_eq(
  $$select name from storage.objects
    where bucket_id = 'notification-media'
      and name = 'permissions/protected.webp'$$,
  $$values ('permissions/protected.webp'::text)$$,
  'the addressed recipient can read the Storage object'
);
select is(
  pg_temp.sqlstate_from('select * from public.notifications'),
  '42501',
  'the recipient still cannot query notification rows directly'
);

select pg_temp.authenticate_as('fb580000-0000-4000-8000-000000000002');
select is(
  public.can_read_notification_media('permissions/protected.webp'),
  false,
  'an unrelated user is rejected by the notification image helper'
);
select is(
  (
    select count(*)
    from storage.objects
    where bucket_id = 'notification-media'
      and name = 'permissions/protected.webp'
  ),
  0::bigint,
  'an unrelated user cannot read the Storage object'
);

select pg_temp.authenticate_as('fb580000-0000-4000-8000-000000000001');
select lives_ok(
  $$update public.profiles
    set first_name = 'Updated',
        last_name = 'Profile',
        avatar_kind = 'preset',
        avatar_path = null,
        avatar_preset = 'mountain',
        nationality_country_code = 'GT',
        department_code = 'quetzaltenango',
        sex = 'female',
        date_of_birth = '1990-01-01',
        phone = '+50255550001',
        document_type = 'passport',
        document_number = 'PERMISSIONS-58'
    where id = 'fb580000-0000-4000-8000-000000000001'$$,
  'authenticated users can update every profile field used by the PWA'
);
select is(
  pg_temp.sqlstate_from(
    $$update public.profiles
      set alternate_phone = '+50255559999'
      where id = 'fb580000-0000-4000-8000-000000000001'$$
  ),
  '42501',
  'authenticated users cannot update an administrative profile field'
);
reset role;

select ok(
  not has_table_privilege('authenticated', 'public.profiles', 'UPDATE')
    and has_column_privilege('authenticated', 'public.profiles', 'first_name', 'UPDATE')
    and has_column_privilege('authenticated', 'public.profiles', 'sex', 'UPDATE')
    and has_column_privilege('authenticated', 'public.profiles', 'department_code', 'UPDATE')
    and not has_column_privilege('authenticated', 'public.profiles', 'alternate_phone', 'UPDATE')
    and not has_column_privilege('authenticated', 'public.profiles', 'document_type_detail', 'UPDATE'),
  'profile UPDATE is limited to the PWA field allowlist'
);

select ok(
  not has_table_privilege('anon', 'public.push_subscriptions', 'SELECT')
    and not has_table_privilege('authenticated', 'public.push_subscriptions', 'SELECT')
    and not has_table_privilege('service_role', 'public.push_subscriptions', 'SELECT'),
  'disabled Web Push exposes no direct subscription reads'
);
select ok(
  not has_sequence_privilege('anon', 'public.audit_logs_id_seq', 'USAGE')
    and not has_sequence_privilege('authenticated', 'public.audit_logs_id_seq', 'USAGE')
    and not has_sequence_privilege('service_role', 'public.audit_logs_id_seq', 'USAGE')
    and not has_sequence_privilege('service_role', 'public.audit_logs_id_seq', 'UPDATE'),
  'Data API roles have no direct audit sequence privileges'
);
select is(
  (select enabled from public.runtime_feature_flags where feature = 'web_push'),
  false,
  'Web Push remains disabled'
);

select ok(
  not has_function_privilege('anon', 'public.admin_set_user_role(uuid,text)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.admin_set_user_role(uuid,text)', 'EXECUTE')
    and not has_function_privilege('service_role', 'public.admin_set_user_role(uuid,text)', 'EXECUTE'),
  'legacy role assignment RPC is not exposed through Data API roles'
);
select ok(
  not has_function_privilege('anon', 'public.admin_update_staff_permissions(uuid,jsonb)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.admin_update_staff_permissions(uuid,jsonb)', 'EXECUTE')
    and not has_function_privilege('service_role', 'public.admin_update_staff_permissions(uuid,jsonb)', 'EXECUTE'),
  'legacy permission update RPC is not exposed through Data API roles'
);
select ok(
  has_function_privilege('authenticated', 'public.admin_update_staff_permissions_v2(uuid,jsonb)', 'EXECUTE')
    and has_function_privilege('authenticated', 'public.admin_set_staff_access(uuid,boolean)', 'EXECUTE'),
  'current administrative RPCs remain available'
);

select * from finish();
rollback;
