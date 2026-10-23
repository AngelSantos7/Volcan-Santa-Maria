-- SEC-009: make database provisioning and its audit event one transaction,
-- and make resend auditing mandatory before another email is dispatched.

create or replace function public.admin_find_recoverable_staff_invitation(p_email text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  candidate_id uuid;
begin
  if not public.is_admin() then
    raise exception using errcode = '42501', message = 'Administrator access is required.';
  end if;

  if nullif(pg_catalog.btrim(p_email), '') is null or pg_catalog.length(p_email) > 254 then
    raise exception using errcode = '22023', message = 'Invalid staff invitation email.';
  end if;

  select auth_user.id
  into candidate_id
  from auth.users as auth_user
  join public.user_roles as assigned_role on assigned_role.user_id = auth_user.id
  left join public.staff_permissions as permission on permission.user_id = auth_user.id
  where pg_catalog.lower(auth_user.email) = pg_catalog.lower(pg_catalog.btrim(p_email))
    and auth_user.invited_at is not null
    and auth_user.raw_user_meta_data -> 'staff_invitation' = 'true'::jsonb
    and (
      (assigned_role.role = 'tourist' and permission.user_id is null)
      or (
        assigned_role.role = 'visitor_manager'
        and (
          permission.user_id is null
          or (permission.invitation_status = 'pending' and permission.invitation_revoked_at is null)
        )
      )
    )
  limit 1;

  return candidate_id;
end;
$$;

revoke all on function public.admin_find_recoverable_staff_invitation(text)
from public, anon, authenticated;
grant execute on function public.admin_find_recoverable_staff_invitation(text)
to authenticated;

create or replace function public.admin_finalize_staff_invitation(
  p_user_id uuid,
  p_email text,
  p_phone text,
  p_permissions jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  invited_email text;
  invited_at timestamptz;
  invited_metadata jsonb;
  assigned_role public.app_role;
  existing_permission public.staff_permissions%rowtype;
  has_permission boolean := false;
  already_audited boolean := false;
begin
  if not public.is_admin(current_user_id) then
    raise exception using errcode = '42501', message = 'Administrator access is required.';
  end if;

  if p_user_id is null
    or nullif(pg_catalog.btrim(p_email), '') is null
    or pg_catalog.length(p_email) > 254
    or p_phone is null
    or p_phone !~ '^\+502[2-7][0-9]{7}$'
    or p_permissions is null
    or pg_catalog.jsonb_typeof(p_permissions) <> 'object' then
    raise exception using errcode = '22023', message = 'Invalid staff invitation data.';
  end if;

  select auth_user.email, auth_user.invited_at, auth_user.raw_user_meta_data
  into invited_email, invited_at, invited_metadata
  from auth.users as auth_user
  where auth_user.id = p_user_id
  for update;

  if not found
    or pg_catalog.lower(invited_email) is distinct from pg_catalog.lower(pg_catalog.btrim(p_email))
    or invited_at is null
    or invited_metadata -> 'staff_invitation' is distinct from 'true'::jsonb then
    raise exception using errcode = '23514', message = 'The recoverable staff invitation is invalid.';
  end if;

  select role.role
  into assigned_role
  from public.user_roles as role
  where role.user_id = p_user_id
  for update;

  if assigned_role is null or assigned_role not in ('tourist', 'visitor_manager') then
    raise exception using errcode = '23514', message = 'The staff invitation role is invalid.';
  end if;

  select permission.*
  into existing_permission
  from public.staff_permissions as permission
  where permission.user_id = p_user_id
  for update;
  has_permission := found;

  select exists (
    select 1
    from public.audit_logs as log
    where log.action = 'staff_invitation_created'
      and log.target_type = 'staff_user'
      and log.target_id = p_user_id::text
  ) into already_audited;

  if has_permission then
    if assigned_role <> 'visitor_manager'
      or existing_permission.invitation_status <> 'pending'
      or existing_permission.invitation_revoked_at is not null then
      raise exception using errcode = '23514', message = 'The staff invitation state is not recoverable.';
    end if;

    if not already_audited then
      insert into public.audit_logs (actor_user_id, action, target_type, target_id, metadata)
      values (
        current_user_id,
        'staff_invitation_created',
        'staff_user',
        p_user_id::text,
        pg_catalog.jsonb_build_object('source', 'invite_staff_recovery')
      );
    end if;

    return pg_catalog.jsonb_build_object(
      'user_id', p_user_id,
      'already_finalized', already_audited,
      'recovered', not already_audited
    );
  end if;

  update public.user_roles
  set role = 'visitor_manager'
  where user_id = p_user_id
    and role in ('tourist', 'visitor_manager');
  if not found then
    raise exception using errcode = '23514', message = 'The staff invitation role could not be finalized.';
  end if;

  update public.profiles
  set phone = p_phone
  where id = p_user_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'The invited staff profile was not found.';
  end if;

  insert into public.staff_permissions (
    user_id,
    is_active,
    invitation_status,
    can_view_visitors,
    can_register_walk_in_visitors,
    can_manage_visits,
    can_confirm_returns,
    can_manage_notifications,
    can_manage_gallery,
    can_view_identity_documents,
    can_view_emergency_contacts
  )
  values (
    p_user_id,
    false,
    'pending',
    coalesce(p_permissions -> 'can_view_visitors', 'false'::jsonb) = 'true'::jsonb,
    coalesce(p_permissions -> 'can_register_walk_in_visitors', 'false'::jsonb) = 'true'::jsonb,
    coalesce(p_permissions -> 'can_manage_visits', 'false'::jsonb) = 'true'::jsonb,
    coalesce(p_permissions -> 'can_confirm_returns', 'false'::jsonb) = 'true'::jsonb,
    coalesce(p_permissions -> 'can_manage_notifications', 'false'::jsonb) = 'true'::jsonb,
    coalesce(p_permissions -> 'can_manage_gallery', 'false'::jsonb) = 'true'::jsonb,
    coalesce(p_permissions -> 'can_view_identity_documents', 'false'::jsonb) = 'true'::jsonb,
    coalesce(p_permissions -> 'can_view_emergency_contacts', 'false'::jsonb) = 'true'::jsonb
  );

  insert into public.audit_logs (actor_user_id, action, target_type, target_id, metadata)
  values (
    current_user_id,
    'staff_invitation_created',
    'staff_user',
    p_user_id::text,
    pg_catalog.jsonb_build_object('source', 'invite_staff')
  );

  return pg_catalog.jsonb_build_object(
    'user_id', p_user_id,
    'already_finalized', false,
    'recovered', assigned_role = 'visitor_manager'
  );
end;
$$;

revoke all on function public.admin_finalize_staff_invitation(uuid, text, text, jsonb)
from public, anon, authenticated;
grant execute on function public.admin_finalize_staff_invitation(uuid, text, text, jsonb)
to authenticated;

create or replace function public.admin_record_staff_invitation_resend_request(
  p_user_id uuid,
  p_email text
)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  audit_id bigint;
begin
  if not public.is_admin(current_user_id) then
    raise exception using errcode = '42501', message = 'Administrator access is required.';
  end if;

  if not exists (
    select 1
    from public.staff_permissions as permission
    join public.user_roles as assigned_role on assigned_role.user_id = permission.user_id
    join auth.users as auth_user on auth_user.id = permission.user_id
    where permission.user_id = p_user_id
      and permission.invitation_status = 'pending'
      and permission.invitation_revoked_at is null
      and assigned_role.role = 'visitor_manager'
      and pg_catalog.lower(auth_user.email) = pg_catalog.lower(pg_catalog.btrim(p_email))
  ) then
    raise exception using errcode = '23514', message = 'Only a pending invitation can be resent.';
  end if;

  insert into public.audit_logs (actor_user_id, action, target_type, target_id, metadata)
  values (
    current_user_id,
    'staff_invitation_resend_requested',
    'staff_user',
    p_user_id::text,
    '{}'::jsonb
  )
  returning id into audit_id;

  return audit_id;
end;
$$;

revoke all on function public.admin_record_staff_invitation_resend_request(uuid, text)
from public, anon, authenticated;
grant execute on function public.admin_record_staff_invitation_resend_request(uuid, text)
to authenticated;
