alter table public.visits
  add column planned_start_at timestamptz,
  add column recommendations_accepted_at timestamptz,
  add column recommendations_version text,
  add constraint visits_planned_start_before_return check (
    planned_start_at is null
    or expected_return_at is null
    or planned_start_at < expected_return_at
  ),
  add constraint visits_recommendations_acceptance_consistent check (
    (
      recommendations_accepted_at is null
      and recommendations_version is null
    )
    or (
      recommendations_accepted_at is not null
      and nullif(btrim(recommendations_version), '') is not null
    )
  );

drop function public.create_group_visit(
  public.visit_type,
  timestamptz,
  boolean,
  text,
  boolean
);

create function public.create_group_visit(
  p_visit_type public.visit_type,
  p_planned_start_at timestamptz,
  p_expected_return_at timestamptz,
  p_has_local_guide boolean,
  p_guide_name text,
  p_terms_accepted boolean,
  p_recommendations_accepted boolean
)
returns table (visit_id uuid, join_code text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  default_route_id uuid;
  new_visit_id uuid;
  new_join_code text;
  normalized_guide_name text;
begin
  if current_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'Authentication is required.';
  end if;

  if not public.is_current_user_email_verified() then
    raise exception using
      errcode = 'P0001',
      message = 'email_not_verified';
  end if;

  if coalesce(p_terms_accepted, false) is not true then
    raise exception using
      errcode = '23514',
      message = 'You must accept the group visit terms.';
  end if;

  if coalesce(p_recommendations_accepted, false) is not true then
    raise exception using
      errcode = '23514',
      message = 'You must accept the ascent recommendations.';
  end if;

  if p_visit_type is null then
    raise exception using
      errcode = '22023',
      message = 'A group visit type is required.';
  end if;

  if p_planned_start_at is null then
    raise exception using
      errcode = '22023',
      message = 'A planned start time is required.';
  end if;

  if p_expected_return_at is null
    or p_expected_return_at <= pg_catalog.clock_timestamp() then
    raise exception using
      errcode = '22023',
      message = 'Expected return time must be in the future.';
  end if;

  if p_planned_start_at >= p_expected_return_at then
    raise exception using
      errcode = '22023',
      message = 'Planned start time must be before expected return time.';
  end if;

  if coalesce(p_has_local_guide, false) then
    normalized_guide_name := nullif(pg_catalog.btrim(p_guide_name), '');
    if normalized_guide_name is null then
      raise exception using
        errcode = '23514',
        message = 'Guide name is required when the group has a local guide.';
    end if;
  else
    normalized_guide_name := null;
  end if;

  perform public.assert_group_visit_eligibility(current_user_id);
  perform public.assert_no_active_group_visit(current_user_id);

  select route.id
  into default_route_id
  from public.routes as route
  where route.slug = 'ascenso-a-la-cima'
    and route.is_active;

  if default_route_id is null then
    raise exception using
      errcode = 'P0002',
      message = 'The default summit route is not available.';
  end if;

  for attempt in 1..10 loop
    new_join_code := public.generate_group_join_code();

    begin
      insert into public.visits (
        route_id,
        created_by,
        join_code,
        visit_type,
        planned_start_at,
        expected_return_at,
        has_local_guide,
        guide_name,
        recommendations_accepted_at,
        recommendations_version,
        status
      )
      values (
        default_route_id,
        current_user_id,
        new_join_code,
        p_visit_type,
        p_planned_start_at,
        p_expected_return_at,
        coalesce(p_has_local_guide, false),
        normalized_guide_name,
        pg_catalog.clock_timestamp(),
        'v1',
        'forming'::public.visit_status
      )
      returning id into new_visit_id;

      exit;
    exception
      when unique_violation then
        if attempt = 10 then
          raise exception using
            errcode = 'P0001',
            message = 'Could not generate a unique group join code.';
        end if;
    end;
  end loop;

  insert into public.visit_members (
    visit_id,
    user_id,
    member_role,
    terms_accepted_at
  )
  values (
    new_visit_id,
    current_user_id,
    'leader'::public.visit_member_role,
    pg_catalog.clock_timestamp()
  );

  return query
  select new_visit_id, new_join_code;
end;
$$;

revoke all on function public.create_group_visit(
  public.visit_type,
  timestamptz,
  timestamptz,
  boolean,
  text,
  boolean,
  boolean
)
from public, anon, authenticated;
grant execute on function public.create_group_visit(
  public.visit_type,
  timestamptz,
  timestamptz,
  boolean,
  text,
  boolean,
  boolean
)
to authenticated;

drop function public.get_group_visit_details(uuid);

create function public.get_group_visit_details(p_visit_id uuid)
returns table (
  visit_id uuid,
  route_id uuid,
  route_name_es text,
  route_name_en text,
  status public.visit_status,
  join_code text,
  visit_type public.visit_type,
  has_local_guide boolean,
  guide_name text,
  planned_start_at timestamptz,
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
    visit.id,
    visit.route_id,
    route.name_es,
    route.name_en,
    visit.status,
    case when visit.status = 'forming'::public.visit_status
      then visit.join_code else null end,
    visit.visit_type,
    visit.has_local_guide,
    visit.guide_name,
    visit.planned_start_at,
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
            'member_status', member.member_status,
            'joined_at', member.joined_at,
            'return_started_at', member.return_started_at,
            'checked_out_at', member.checked_out_at
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
    )
  from public.visits as visit
  join public.routes as route on route.id = visit.route_id
  where visit.id = p_visit_id;
end;
$$;

revoke all on function public.get_group_visit_details(uuid)
from public, anon, authenticated;
grant execute on function public.get_group_visit_details(uuid)
to authenticated;

drop function public.get_my_visit_history(integer, integer);

create function public.get_my_visit_history(
  p_limit integer default 20,
  p_offset integer default 0
)
returns table (
  visit_id uuid,
  visit_date timestamptz,
  visit_type public.visit_type,
  visit_status public.visit_status,
  route_name_es text,
  route_name_en text,
  member_role public.visit_member_role,
  member_status public.visit_member_status,
  planned_start_at timestamptz,
  started_at timestamptz,
  expected_return_at timestamptz,
  completed_at timestamptz,
  return_started_at timestamptz,
  checked_out_at timestamptz,
  participant_count bigint
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

  if p_limit is null or p_limit < 1 or p_limit > 50 then
    raise exception using
      errcode = '22023',
      message = 'History page size must be between 1 and 50.';
  end if;

  if p_offset is null or p_offset < 0 then
    raise exception using
      errcode = '22023',
      message = 'History offset cannot be negative.';
  end if;

  return query
  select
    visit.id,
    coalesce(visit.started_at, visit.planned_start_at, visit.created_at),
    visit.visit_type,
    visit.status,
    route.name_es,
    route.name_en,
    own_membership.member_role,
    own_membership.member_status,
    visit.planned_start_at,
    visit.started_at,
    visit.expected_return_at,
    visit.completed_at,
    own_membership.return_started_at,
    own_membership.checked_out_at,
    (
      select pg_catalog.count(*)
      from public.visit_members as counted_member
      where counted_member.visit_id = visit.id
        and counted_member.member_status <>
          'withdrawn_before_start'::public.visit_member_status
    )
  from public.visit_members as own_membership
  join public.visits as visit on visit.id = own_membership.visit_id
  join public.routes as route on route.id = visit.route_id
  where own_membership.user_id = current_user_id
    and not (
      visit.status in (
        'forming'::public.visit_status,
        'in_progress'::public.visit_status
      )
      and (
        own_membership.member_status in (
          'active'::public.visit_member_status,
          'returning_early'::public.visit_member_status
        )
        or (
          own_membership.member_role = 'leader'::public.visit_member_role
          and own_membership.member_status =
            'returned_early'::public.visit_member_status
        )
      )
    )
  order by
    coalesce(visit.started_at, visit.planned_start_at, visit.created_at) desc,
    visit.id
  limit p_limit
  offset p_offset;
end;
$$;

revoke all on function public.get_my_visit_history(integer, integer)
from public, anon, authenticated;
grant execute on function public.get_my_visit_history(integer, integer)
to authenticated;
