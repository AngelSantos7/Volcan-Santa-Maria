create or replace function public.get_group_visit_details(
  p_visit_id uuid
)
returns table (
  visit_id uuid,
  route_id uuid,
  route_name_es text,
  route_name_en text,
  status public.visit_status,
  join_code text,
  expected_duration_minutes integer,
  has_local_guide boolean,
  guide_name text,
  started_at timestamptz,
  expected_return_at timestamptz,
  completed_at timestamptz,
  created_by uuid,
  participants jsonb
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
    or not public.is_current_user_visit_member(p_visit_id) then
    raise exception using
      errcode = '42501',
      message = 'Access to this group visit is denied.';
  end if;

  return query
  select
    visit.id as visit_id,
    visit.route_id,
    route.name_es as route_name_es,
    route.name_en as route_name_en,
    visit.status,
    case
      when visit.status = 'forming'::public.visit_status
        then visit.join_code
      else null
    end as join_code,
    visit.expected_duration_minutes,
    visit.has_local_guide,
    visit.guide_name,
    visit.started_at,
    visit.expected_return_at,
    visit.completed_at,
    visit.created_by,
    (
      select coalesce(
        pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'user_id', member.user_id,
            'first_name', profile.first_name,
            'last_name', profile.last_name,
            'member_role', member.member_role,
            'joined_at', member.joined_at
          )
          order by
            (member.member_role = 'leader'::public.visit_member_role) desc,
            member.joined_at,
            member.user_id
        ),
        '[]'::jsonb
      )
      from public.visit_members as member
      join public.profiles as profile on profile.id = member.user_id
      where member.visit_id = visit.id
    ) as participants
  from public.visits as visit
  join public.routes as route on route.id = visit.route_id
  where visit.id = p_visit_id;
end;
$$;

revoke all on function public.get_group_visit_details(uuid)
from public, anon, authenticated;
grant execute on function public.get_group_visit_details(uuid)
to authenticated;

create or replace function public.get_my_active_group_visit()
returns table (
  visit_id uuid,
  status public.visit_status
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

  return query
  select
    visit.id as visit_id,
    visit.status
  from public.visit_members as member
  join public.visits as visit on visit.id = member.visit_id
  where member.user_id = current_user_id
    and visit.status in (
      'forming'::public.visit_status,
      'in_progress'::public.visit_status
    )
  order by
    (visit.status = 'in_progress'::public.visit_status) desc,
    visit.created_at desc,
    visit.id
  limit 1;
end;
$$;

revoke all on function public.get_my_active_group_visit()
from public, anon, authenticated;
grant execute on function public.get_my_active_group_visit()
to authenticated;
