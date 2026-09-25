create function public.staff_get_ascent_members(p_visit_id uuid)
returns table (
  visit_id uuid,
  user_id uuid,
  visitor_name text,
  member_role text,
  member_status text,
  checked_out_at timestamptz,
  finalized_by_administration boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (
    public.has_staff_permission('can_view_visitors')
    or public.has_staff_permission('can_manage_visits')
    or public.has_staff_permission('can_confirm_returns')
  ) then
    raise exception using errcode = '42501', message = 'Visit access is required.';
  end if;
  return query
  select member.visit_id, member.user_id,
    pg_catalog.concat_ws(' ', profile.first_name, profile.last_name),
    member.member_role::text, member.member_status::text,
    member.checked_out_at, member.checkout_method = 'staff'
  from public.visit_members as member
  join public.profiles as profile on profile.id = member.user_id
  where member.visit_id = p_visit_id
    and member.member_status <> 'withdrawn_before_start'
  order by (member.member_role = 'leader') desc, member.joined_at, member.user_id;
end;
$$;

revoke all on function public.staff_get_ascent_members(uuid)
from public, anon, authenticated;
grant execute on function public.staff_get_ascent_members(uuid)
to authenticated;
