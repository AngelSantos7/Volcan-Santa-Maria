-- SEC-001: no current application consumer needs group-wide tourist checkout.
-- Adults use complete_my_visit_participation / confirm_my_early_checkout;
-- staff use the separately authorized administrative return RPCs.
revoke all on function public.complete_group_visit(uuid)
from public, anon, authenticated;

-- SEC-002: retain the legacy response contract, but use the current contact
-- authorization (specific permission, active staff, operational window, Admin
-- exception) and keep identity-document authorization independent.
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
  result jsonb;
  identity_details jsonb;
begin
  if not public.has_staff_permission('can_view_emergency_contacts') then
    raise exception using errcode = '42501', message = 'Emergency contact access is required.';
  end if;
  if coalesce(p_include_documents, false)
    and not public.has_staff_permission('can_view_identity_documents') then
    raise exception using errcode = '42501', message = 'Identity document access is required.';
  end if;

  -- Preserve the existing visitor scope, including pre-ascent walk-in records
  -- for Admin. Managers still need the operational context checked below.
  if not exists (
    select 1 from public.visit_members where user_id = p_user_id
  ) and exists (
    select 1 from public.user_roles where user_id = p_user_id
  ) then
    raise exception using errcode = 'P0002', message = 'Visitor record was not found.';
  end if;

  result := public.staff_get_operational_contacts(p_user_id, 'legacy_sensitive_details');

  if coalesce(p_include_documents, false) then
    identity_details := public.staff_get_identity_details(p_user_id);
  end if;

  result := (result - 'visit_id') || pg_catalog.jsonb_build_object(
    -- Birth date belongs to the separately authorized identity response.
    'date_of_birth', identity_details -> 'date_of_birth',
    'document_type', identity_details -> 'document_type',
    'document_number', identity_details -> 'document_number'
  );
  -- The delegated RPCs audit contact/identity access. Keep the legacy event
  -- for existing audit consumers, without storing the returned sensitive data.
  insert into public.audit_logs (actor_user_id, action, target_type, target_id, metadata)
  values (
    auth.uid(), 'sensitive_data_viewed', 'visitor', p_user_id::text,
    pg_catalog.jsonb_build_object('included_identity_document', coalesce(p_include_documents, false))
  );
  return result;
end;
$$;

revoke all on function public.staff_get_visitor_sensitive_details(uuid, boolean)
from public, anon, authenticated;
grant execute on function public.staff_get_visitor_sensitive_details(uuid, boolean)
to authenticated;
