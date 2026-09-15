create type public.visit_type as enum (
  'day_hike',
  'expedition_camping'
);

alter table public.visits
add column visit_type public.visit_type not null
default 'day_hike'::public.visit_type;

-- Existing rows, if any, are safely classified during the migration. Future
-- group visits must always provide their type through create_group_visit.
alter table public.visits
alter column visit_type drop default;

alter table public.visits
drop column expected_duration_minutes;

-- Remove the former duration-based overload so it cannot remain callable.
drop function public.create_group_visit(integer, boolean, text, boolean);

create or replace function public.create_group_visit(
  p_visit_type public.visit_type,
  p_expected_return_at timestamptz,
  p_has_local_guide boolean,
  p_guide_name text,
  p_terms_accepted boolean
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
  attempt integer;
begin
  if current_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'Authentication is required.';
  end if;

  if coalesce(p_terms_accepted, false) is not true then
    raise exception using
      errcode = '23514',
      message = 'You must accept the group visit terms.';
  end if;

  if p_visit_type is null then
    raise exception using
      errcode = '22023',
      message = 'A group visit type is required.';
  end if;

  if p_expected_return_at is null
    or p_expected_return_at <= pg_catalog.clock_timestamp() then
    raise exception using
      errcode = '22023',
      message = 'Expected return time must be in the future.';
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
  where route.slug = 'ascenso-cima'
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
        expected_return_at,
        has_local_guide,
        guide_name,
        status
      )
      values (
        default_route_id,
        current_user_id,
        new_join_code,
        p_visit_type,
        p_expected_return_at,
        coalesce(p_has_local_guide, false),
        normalized_guide_name,
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
  boolean,
  text,
  boolean
)
from public, anon, authenticated;
grant execute on function public.create_group_visit(
  public.visit_type,
  timestamptz,
  boolean,
  text,
  boolean
)
to authenticated;

create or replace function public.start_group_visit(visit_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  current_visit_status public.visit_status;
  selected_expected_return_at timestamptz;
  start_time timestamptz;
begin
  if current_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'Authentication is required.';
  end if;

  if not exists (
    select 1
    from public.visit_members as member
    where member.visit_id = $1
      and member.user_id = current_user_id
      and member.member_role = 'leader'::public.visit_member_role
  ) then
    raise exception using
      errcode = '42501',
      message = 'Only the group leader can start this visit.';
  end if;

  select visit.status, visit.expected_return_at
  into current_visit_status, selected_expected_return_at
  from public.visits as visit
  where visit.id = $1
  for update;

  if current_visit_status <> 'forming'::public.visit_status then
    raise exception using
      errcode = 'P0001',
      message = 'Only a forming group visit can be started.';
  end if;

  start_time := pg_catalog.clock_timestamp();

  if selected_expected_return_at is null
    or selected_expected_return_at <= start_time then
    raise exception using
      errcode = '22023',
      message = 'Expected return time must be after the visit starts.';
  end if;

  update public.visits
  set
    status = 'in_progress'::public.visit_status,
    started_at = start_time
  where id = $1;

  return $1;
end;
$$;

revoke all on function public.start_group_visit(uuid)
from public, anon, authenticated;
grant execute on function public.start_group_visit(uuid)
to authenticated;

-- The result shape changes, so the previous table-returning signature must be
-- dropped before it can be recreated without the duration field.
drop function public.get_group_visit_details(uuid);

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
  visit_type public.visit_type,
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
    visit.visit_type,
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
