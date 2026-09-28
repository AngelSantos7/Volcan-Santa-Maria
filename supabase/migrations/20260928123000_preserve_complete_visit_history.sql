drop function public.get_my_visit_history(integer, integer);

create function public.get_my_visit_history(p_limit integer default 20, p_offset integer default 0)
returns table (
  visit_id uuid, visit_date timestamptz, visit_type public.visit_type,
  visit_status public.visit_status, route_name_es text, route_name_en text,
  member_role public.visit_member_role, member_status public.visit_member_status,
  planned_start_at timestamptz, started_at timestamptz,
  expected_return_at timestamptz, completed_at timestamptz,
  return_started_at timestamptz, checked_out_at timestamptz,
  participant_count bigint, creation_origin text, completion_method text
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 50
    or p_offset is null or p_offset < 0 then
    raise exception using errcode = '22023', message = 'Invalid history pagination.';
  end if;
  return query
  select visit.id, coalesce(visit.started_at, visit.planned_start_at, visit.created_at),
    visit.visit_type, visit.status, route.name_es, route.name_en,
    member.member_role, member.member_status, visit.planned_start_at,
    visit.started_at, visit.expected_return_at, visit.completed_at,
    member.return_started_at, member.checked_out_at,
    (select count(*) from public.visit_members counted
      where counted.visit_id = visit.id
        and counted.member_status <> 'withdrawn_before_start'),
    visit.creation_origin,
    case when member.checkout_method = 'staff' then 'administrative'
      when member.member_status in ('completed', 'returned_early') then 'normal'
      else 'pending' end
  from public.visit_members member
  join public.visits visit on visit.id = member.visit_id
  join public.routes route on route.id = visit.route_id
  where member.user_id = auth.uid()
    and not (
      visit.status in ('forming', 'in_progress')
      and (
        member.member_status in ('active', 'returning_early')
        or (member.member_role = 'leader' and member.member_status = 'returned_early')
      )
    )
  order by coalesce(visit.started_at, visit.planned_start_at, visit.created_at) desc,
    visit.id
  limit p_limit offset p_offset;
end;
$$;

revoke all on function public.get_my_visit_history(integer, integer)
from public, anon, authenticated;
grant execute on function public.get_my_visit_history(integer, integer)
to authenticated;
