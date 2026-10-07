-- `current_role` is a PostgreSQL keyword. Using it as a PL/pgSQL variable made
-- permission checks read the SQL role (`authenticated`) instead of app_role.
create or replace function public.has_staff_permission(permission_name text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  current_user_id uuid:=auth.uid();
  assigned_role public.app_role;
  permission_allowed boolean:=false;
begin
  if current_user_id is null then return false; end if;
  select user_role.role into assigned_role
  from public.user_roles user_role where user_role.user_id=current_user_id;
  if assigned_role='admin'::public.app_role then return true; end if;
  if assigned_role is distinct from 'visitor_manager'::public.app_role then return false; end if;
  select case permission_name
    when 'can_view_visitors' then permission.can_view_visitors
    when 'can_view_sensitive_data' then permission.can_view_sensitive_data
    when 'can_view_identity_documents' then permission.can_view_identity_documents
    when 'can_manage_visits' then permission.can_manage_visits
    when 'can_confirm_returns' then permission.can_confirm_returns
    when 'can_register_walk_in_visitors' then permission.can_register_walk_in_visitors
    when 'can_export_reports' then permission.can_export_reports
    when 'can_manage_announcements' then permission.can_manage_announcements
    when 'can_manage_notifications' then permission.can_manage_notifications
    when 'can_manage_route' then permission.can_manage_route
    when 'can_manage_gallery' then permission.can_manage_gallery
    when 'can_view_emergency_contacts' then permission.can_view_emergency_contacts
    when 'can_manage_users' then permission.can_manage_users
    when 'can_manage_staff' then permission.can_manage_staff
    else false end
  into permission_allowed from public.staff_permissions permission
  where permission.user_id=current_user_id and permission.is_active;
  return coalesce(permission_allowed,false);
end;
$$;
revoke all on function public.has_staff_permission(text) from public,anon,authenticated;
grant execute on function public.has_staff_permission(text) to authenticated;
