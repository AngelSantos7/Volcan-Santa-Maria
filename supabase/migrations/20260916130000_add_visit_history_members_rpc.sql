create or replace function public.get_visit_history_members(
  p_visit_id uuid
)
returns table (
  first_name text,
  last_name text,
  member_role public.visit_member_role,
  member_status public.visit_member_status,
  checked_out_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'Authentication is required.';
  end if;

  if p_visit_id is null
    or not exists (
      select 1
      from public.visit_members as own_membership
      where own_membership.visit_id = p_visit_id
        and own_membership.user_id = current_user_id
    ) then
    raise exception using
      errcode = '42501',
      message = 'Access to these visit members is denied.';
  end if;

  return query
  select
    profile.first_name,
    profile.last_name,
    member.member_role,
    member.member_status,
    member.checked_out_at
  from public.visit_members as member
  join public.profiles as profile on profile.id = member.user_id
  where member.visit_id = p_visit_id
  order by
    (member.member_role = 'leader'::public.visit_member_role) desc,
    member.joined_at,
    member.user_id;
end;
$$;

revoke all on function public.get_visit_history_members(uuid)
from public, anon, authenticated;
grant execute on function public.get_visit_history_members(uuid)
to authenticated;
