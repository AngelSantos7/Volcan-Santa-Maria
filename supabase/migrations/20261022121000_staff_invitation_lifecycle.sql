-- Invitation cancellation retains the Auth identity and audit history.
alter table public.staff_permissions add column invitation_revoked_at timestamptz;
create function public.cancel_pending_staff_invitation(p_user_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  if not public.is_admin() then raise exception using errcode='42501',message='Administrator access is required.'; end if;
  perform 1 from public.staff_permissions where user_id=p_user_id for update;
  if not exists(select 1 from public.staff_permissions p join auth.users u on u.id=p.user_id
    where p.user_id=p_user_id and p.invitation_status='pending' and p.invitation_revoked_at is null
      and nullif(u.encrypted_password,'') is null) then
    raise exception using errcode='23514',message='Only an unactivated invitation can be removed.';
  end if;
  update public.staff_permissions set is_active=false, invitation_status='inactive', invitation_revoked_at=clock_timestamp() where user_id=p_user_id;
  insert into public.audit_logs(actor_user_id,action,target_type,target_id,metadata)
  values(auth.uid(),'staff_invitation_deleted','staff_user',p_user_id::text,'{"identity_retained":true}'::jsonb);
end;
$$;
revoke all on function public.cancel_pending_staff_invitation(uuid) from public,anon,authenticated;
grant execute on function public.cancel_pending_staff_invitation(uuid) to authenticated;

create function public.staff_invitation_email_available(p_email text)
returns boolean language sql stable security definer set search_path='' as $$
  select not exists(select 1 from auth.users where lower(email)=lower(trim(p_email)));
$$;
revoke all on function public.staff_invitation_email_available(text) from public,anon,authenticated;
grant execute on function public.staff_invitation_email_available(text) to service_role;


create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = '' as $$
declare birth_date date;
begin
  -- invited_at is assigned by Auth, never trusted from editable user metadata.
  if new.invited_at is null then
    birth_date := nullif(new.raw_user_meta_data ->> 'date_of_birth','')::date;
    if not public.is_adult(birth_date) then
      raise exception using errcode='23514',message='adult_required';
    end if;
  end if;
  insert into public.profiles(id, first_name, last_name, date_of_birth)
  values(
    new.id,
    new.raw_user_meta_data ->> 'first_name',
    new.raw_user_meta_data ->> 'last_name', birth_date
  );
  insert into public.user_roles(user_id, role)
  values(new.id, case when new.invited_at is not null then 'visitor_manager'::public.app_role else 'tourist'::public.app_role end);
  if new.raw_user_meta_data ->> 'terms_version' = '1.0'
    and new.raw_user_meta_data ->> 'privacy_version' = '1.0'
    and coalesce((new.raw_user_meta_data ->> 'legal_consent_accepted')::boolean, false)
  then
    insert into public.user_consents(user_id, terms_version, privacy_version)
    values(new.id, '1.0', '1.0');
  end if;
  return new;
end;
$$;

create or replace function public.admin_set_staff_access(p_user_id uuid, p_is_active boolean)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  previous_active boolean;
begin
  if exists(select 1 from public.staff_permissions where user_id=p_user_id and (invitation_status='pending' or invitation_revoked_at is not null)) then
    raise exception using errcode='23514',message='Pending invitations must be accepted first.';
  end if;
  if not public.is_admin(current_user_id) then
    raise exception using errcode = '42501', message = 'Administrator access is required.';
  end if;
  if not exists (
    select 1 from public.user_roles
    where user_id = p_user_id and role = 'visitor_manager'::public.app_role
  ) then
    raise exception using errcode = 'P0002', message = 'Visitor manager was not found.';
  end if;

  insert into public.staff_permissions (user_id, is_active)
  values (p_user_id, coalesce(p_is_active, false))
  on conflict (user_id) do update set is_active = excluded.is_active
  returning is_active into previous_active;

  insert into public.audit_logs (actor_user_id, action, target_type, target_id, metadata)
  values (
    current_user_id,
    case when p_is_active then 'staff_activated' else 'staff_deactivated' end,
    'staff_user',
    p_user_id::text,
    jsonb_build_object('is_active', coalesce(p_is_active, false))
  );
  return previous_active;
end;
$$;

create or replace function public.admin_list_staff()
returns table(user_id uuid,full_name text,email text,role text,is_active boolean,invitation_status text,updated_at timestamptz)
language plpgsql stable security definer set search_path='' as $$
begin
  if not public.is_admin() then raise exception using errcode='42501',message='Administrator access is required.'; end if;
  return query select role.user_id,pg_catalog.concat_ws(' ',profile.first_name,profile.last_name),auth_user.email::text,
    role.role::text,case when role.role='admin' then true else coalesce(permission.is_active,false) end,
    case when role.role='admin' then 'active' else coalesce(permission.invitation_status,'inactive') end,
    coalesce(permission.updated_at,profile.updated_at,role.created_at)
  from public.user_roles role join auth.users auth_user on auth_user.id=role.user_id
  left join public.profiles profile on profile.id=role.user_id
  left join public.staff_permissions permission on permission.user_id=role.user_id
  where permission.invitation_revoked_at is null and role.role in('admin','visitor_manager') order by role.role::text,full_name;
end;
$$;