create or replace function public.staff_get_visitor_sensitive_details(
  p_user_id uuid,
  p_include_documents boolean default false
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  result jsonb;
begin
  if not public.has_staff_permission('can_view_sensitive_data') then
    raise exception using errcode = '42501', message = 'Sensitive data access is required.';
  end if;
  if coalesce(p_include_documents, false)
    and not public.has_staff_permission('can_view_identity_documents') then
    raise exception using errcode = '42501', message = 'Identity document access is required.';
  end if;

  -- Auth-backed profiles retain the established rule: they become visible to
  -- staff only after participating in a visit. Walk-in profiles have no role
  -- row and may be reviewed before their first administrative ascent.
  if not exists (
    select 1 from public.visit_members as membership
    where membership.user_id = p_user_id
  ) and exists (
    select 1 from public.user_roles as user_role
    where user_role.user_id = p_user_id
  ) then
    raise exception using errcode = 'P0002', message = 'Visitor record was not found.';
  end if;

  select pg_catalog.jsonb_build_object(
    'date_of_birth', profile.date_of_birth,
    'phone', profile.phone,
    'alternate_phone', profile.alternate_phone,
    'document_type', case when p_include_documents then profile.document_type::text else null end,
    'document_number', case when p_include_documents then profile.document_number else null end,
    'emergency_contact', case when contact.id is null then null else pg_catalog.jsonb_build_object(
      'first_name', contact.first_name,
      'last_name', contact.last_name,
      'relationship', contact.relationship,
      'phone', contact.phone
    ) end
  ) into result
  from public.profiles as profile
  left join public.emergency_contacts as contact on contact.user_id = profile.id
  where profile.id = p_user_id;

  if result is null then
    raise exception using errcode = 'P0002', message = 'Visitor record was not found.';
  end if;
  insert into public.audit_logs (actor_user_id, action, target_type, target_id, metadata)
  values (
    current_user_id, 'sensitive_data_viewed', 'visitor', p_user_id::text,
    pg_catalog.jsonb_build_object('included_identity_document', coalesce(p_include_documents, false))
  );
  if coalesce(p_include_documents, false) then
    insert into public.audit_logs (actor_user_id, action, target_type, target_id)
    values (current_user_id, 'identity_document_viewed', 'visitor', p_user_id::text);
  end if;
  return result;
end;
$$;

revoke all on function public.staff_get_visitor_sensitive_details(uuid, boolean)
from public, anon, authenticated;
grant execute on function public.staff_get_visitor_sensitive_details(uuid, boolean)
to authenticated;
