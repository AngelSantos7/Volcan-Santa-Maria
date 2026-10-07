-- Keep identity-document access separate from emergency contact access.
create function public.staff_get_identity_details(p_user_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  result jsonb;
  visitor_name text;
begin
  if not public.has_staff_permission('can_view_identity_documents') then
    raise exception using errcode='42501', message='Identity document access is required.';
  end if;
  if not exists(select 1 from public.visit_members where user_id=p_user_id)
    and exists(select 1 from public.user_roles where user_id=p_user_id) then
    raise exception using errcode='P0002', message='Visitor record was not found.';
  end if;
  select jsonb_build_object(
      'date_of_birth', profile.date_of_birth,
      'document_type', profile.document_type::text,
      'document_number', profile.document_number
    ), concat_ws(' ',profile.first_name,profile.last_name)
  into result,visitor_name from public.profiles profile where profile.id=p_user_id;
  if result is null then raise exception using errcode='P0002',message='Visitor record was not found.'; end if;
  insert into public.audit_logs(actor_user_id,action,target_type,target_id,metadata)
  values(auth.uid(),'identity_document_viewed','visitor',p_user_id::text,
    jsonb_build_object('target_name',visitor_name));
  return result;
end;
$$;
revoke all on function public.staff_get_identity_details(uuid) from public,anon,authenticated;
grant execute on function public.staff_get_identity_details(uuid) to authenticated;

create or replace function public.admin_get_staff_permissions(p_user_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception using errcode='42501',message='Administrator access is required.';
  end if;
  select jsonb_build_object(
    'user_id',role.user_id,'role',role.role::text,
    'full_name',concat_ws(' ',profile.first_name,profile.last_name),'email',auth_user.email,
    'is_active',coalesce(permission.is_active,false),
    'can_view_visitors',coalesce(permission.can_view_visitors,false),
    'can_view_sensitive_data',coalesce(permission.can_view_sensitive_data,false),
    'can_view_identity_documents',coalesce(permission.can_view_identity_documents,false),
    'can_manage_visits',coalesce(permission.can_manage_visits,false),
    'can_confirm_returns',coalesce(permission.can_confirm_returns,false),
    'can_register_walk_in_visitors',coalesce(permission.can_register_walk_in_visitors,false),
    'can_export_reports',coalesce(permission.can_export_reports,false),
    'can_manage_announcements',coalesce(permission.can_manage_announcements,false),
    'can_manage_notifications',coalesce(permission.can_manage_notifications,false),
    'can_manage_route',coalesce(permission.can_manage_route,false),
    'can_manage_gallery',coalesce(permission.can_manage_gallery,false),
    'can_view_emergency_contacts',coalesce(permission.can_view_emergency_contacts,false),
    'can_manage_users',coalesce(permission.can_manage_users,false),
    'can_manage_staff',coalesce(permission.can_manage_staff,false),
    'updated_at',permission.updated_at
  ) into result
  from public.user_roles role
  join auth.users auth_user on auth_user.id=role.user_id
  left join public.profiles profile on profile.id=role.user_id
  left join public.staff_permissions permission on permission.user_id=role.user_id
  where role.user_id=p_user_id and role.role='visitor_manager';
  return result;
end;
$$;
revoke all on function public.admin_get_staff_permissions(uuid) from public,anon,authenticated;
grant execute on function public.admin_get_staff_permissions(uuid) to authenticated;

-- Preserve the strict operational authorization while enriching the audit trail.
create or replace function public.staff_get_operational_contacts(
  p_user_id uuid,
  p_context text default 'active_ascent'
) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  current_user_id uuid:=auth.uid(); result jsonb; active_visit_id uuid;
  visit_code text; visitor_name text; operational_state text;
begin
  if not public.has_staff_permission('can_view_emergency_contacts') then
    raise exception using errcode='42501',message='Emergency contact access is required.';
  end if;
  select visit.id,visit.join_code,
    case when visit.expected_return_at<now() then 'overdue' else public.visit_operational_status(visit.id) end
  into active_visit_id,visit_code,operational_state
  from public.visit_members member join public.visits visit on visit.id=member.visit_id
  where member.user_id=p_user_id and visit.status='in_progress'
    and member.member_status in('active','returning_early')
  order by visit.expected_return_at nulls last limit 1;
  if active_visit_id is null and not public.is_admin(current_user_id) then
    raise exception using errcode='42501',message='Emergency contacts are available only during an active or pending return.';
  end if;
  select jsonb_build_object(
      'phone',profile.phone,'alternate_phone',profile.alternate_phone,
      'emergency_contact',case when contact.id is null then null else jsonb_build_object(
        'first_name',contact.first_name,'last_name',contact.last_name,
        'relationship',contact.relationship,'phone',contact.phone) end,
      'visit_id',active_visit_id
    ),concat_ws(' ',profile.first_name,profile.last_name)
  into result,visitor_name from public.profiles profile
  left join public.emergency_contacts contact on contact.user_id=profile.id where profile.id=p_user_id;
  if result is null then raise exception using errcode='P0002',message='Visitor was not found.'; end if;
  insert into public.audit_logs(actor_user_id,action,target_type,target_id,metadata)
  values(current_user_id,'emergency_contact_viewed','visitor',p_user_id::text,
    jsonb_build_object('visit_id',active_visit_id,'join_code',visit_code,
      'target_name',visitor_name,'operational_state',operational_state,
      'context',coalesce(nullif(btrim(p_context),''),'active_ascent')));
  return result;
end;
$$;
revoke all on function public.staff_get_operational_contacts(uuid,text) from public,anon,authenticated;
grant execute on function public.staff_get_operational_contacts(uuid,text) to authenticated;

-- Remove legacy consent-bypassing entry points; existing stored data is unchanged.
revoke execute on function public.add_my_visit_minors(uuid,jsonb) from authenticated;
revoke execute on function public.create_group_visit_with_minors(
  public.visit_type,timestamptz,timestamptz,boolean,text,boolean,boolean,text,jsonb
) from authenticated;

drop policy if exists route_media_objects_read_authenticated on storage.objects;
create policy route_media_objects_read_active_or_staff
on storage.objects for select to authenticated using (
  bucket_id='route-media' and (
    public.has_staff_permission('can_manage_gallery')
    or exists(
      select 1 from public.route_media media
      join public.routes route on route.id=media.route_id
      where media.storage_path=storage.objects.name
        and media.is_active and route.is_active
    )
  )
);
