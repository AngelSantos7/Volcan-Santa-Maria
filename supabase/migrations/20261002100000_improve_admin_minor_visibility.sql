-- Expose the existing per-ascent minor data through the established staff RPCs.
-- No table, RLS policy or minor lifecycle behavior is changed here.

drop function public.staff_get_ascent_members(uuid);
create function public.staff_get_ascent_members(p_visit_id uuid)
returns table(
  visit_id uuid,
  user_id uuid,
  visitor_name text,
  member_role text,
  member_status text,
  checked_out_at timestamptz,
  finalized_by_administration boolean,
  is_minor boolean,
  responsible_name text,
  responsible_member_id uuid,
  age smallint,
  sex text,
  relationship text
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (
    public.has_staff_permission('can_view_visitors')
    or public.has_staff_permission('can_manage_visits')
    or public.has_staff_permission('can_confirm_returns')
  ) then
    raise exception using errcode = '42501', message = 'Visit access is required.';
  end if;

  return query
  select combined.* from (
  select
    member.visit_id,
    member.user_id,
    pg_catalog.concat_ws(' ', profile.first_name, profile.last_name),
    member.member_role::text,
    member.member_status::text,
    member.checked_out_at,
    member.checkout_method = 'staff',
    false,
    null::text,
    null::uuid,
    null::smallint,
    null::text,
    null::text
  from public.visit_members as member
  join public.profiles as profile on profile.id = member.user_id
  where member.visit_id = p_visit_id

  union all

  select
    minor.visit_id,
    minor.id,
    minor.full_name,
    'member',
    public.visit_minor_operational_status(visit.status, responsible.member_status),
    responsible.checked_out_at,
    responsible.checkout_method = 'staff',
    true,
    pg_catalog.concat_ws(' ', responsible_profile.first_name, responsible_profile.last_name),
    minor.responsible_member_id,
    minor.age,
    minor.sex,
    minor.relationship
  from public.visit_minors as minor
  join public.visits as visit on visit.id = minor.visit_id
  join public.visit_members as responsible
    on responsible.visit_id = minor.visit_id
    and responsible.user_id = minor.responsible_member_id
  join public.profiles as responsible_profile on responsible_profile.id = responsible.user_id
  where minor.visit_id = p_visit_id
  ) as combined(
    visit_id,
    user_id,
    visitor_name,
    member_role,
    member_status,
    checked_out_at,
    finalized_by_administration,
    is_minor,
    responsible_name,
    responsible_member_id,
    age,
    sex,
    relationship
  )
  order by coalesce(combined.responsible_member_id, combined.user_id),
    combined.is_minor,
    combined.visitor_name;
end;
$$;
revoke all on function public.staff_get_ascent_members(uuid) from public, anon, authenticated;
grant execute on function public.staff_get_ascent_members(uuid) to authenticated;

drop function if exists public.staff_list_ascents(text, integer);
drop function if exists public.staff_list_ascents(text, integer, text);
create function public.staff_list_ascents(
  p_status text default 'all',
  p_limit integer default 100,
  p_search text default null
)
returns table(
  visit_id uuid,
  join_code text,
  organizer_name text,
  visit_type text,
  participant_count bigint,
  adult_count bigint,
  minor_count bigint,
  minor_matches jsonb,
  planned_start_at timestamptz,
  started_at timestamptz,
  expected_return_at timestamptz,
  completed_at timestamptz,
  visit_status text,
  creation_origin text,
  finalized_by_administration boolean
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (
    public.has_staff_permission('can_view_visitors')
    or public.has_staff_permission('can_manage_visits')
  ) then
    raise exception using errcode = '42501', message = 'Visit access is required.';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 250 then
    raise exception using errcode = '22023', message = 'Invalid page size.';
  end if;

  return query
  select
    visit.id,
    visit.join_code,
    pg_catalog.concat_ws(' ', organizer_profile.first_name, organizer_profile.last_name),
    visit.visit_type::text,
    (select count(*) from public.visit_members as counted
      where counted.visit_id = visit.id
        and counted.member_status <> 'withdrawn_before_start')
      + (select count(*) from public.visit_minors as counted_minor
        where counted_minor.visit_id = visit.id),
    (select count(*) from public.visit_members as counted
      where counted.visit_id = visit.id
        and counted.member_status <> 'withdrawn_before_start'),
    (select count(*) from public.visit_minors as counted_minor
      where counted_minor.visit_id = visit.id),
    case when nullif(pg_catalog.btrim(p_search), '') is null then '[]'::jsonb
      else (
        select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'full_name', matched_minor.full_name,
          'responsible_name', pg_catalog.concat_ws(' ', responsible_profile.first_name, responsible_profile.last_name)
        ) order by matched_minor.full_name), '[]'::jsonb)
        from public.visit_minors as matched_minor
        join public.profiles as responsible_profile
          on responsible_profile.id = matched_minor.responsible_member_id
        where matched_minor.visit_id = visit.id
          and matched_minor.full_name ilike '%' || pg_catalog.btrim(p_search) || '%'
      ) end,
    visit.planned_start_at,
    visit.started_at,
    visit.expected_return_at,
    visit.completed_at,
    visit.status::text,
    visit.creation_origin,
    exists (
      select 1 from public.visit_members as finalized
      where finalized.visit_id = visit.id and finalized.checkout_method = 'staff'
    )
  from public.visits as visit
  join public.visit_members as organizer
    on organizer.visit_id = visit.id and organizer.member_role = 'leader'
  join public.profiles as organizer_profile on organizer_profile.id = organizer.user_id
  where (
    p_status = 'all'
    or (p_status = 'scheduled' and visit.status = 'forming')
    or (p_status = 'in_progress' and visit.status = 'in_progress' and visit.started_at is not null)
    or (p_status = 'completed' and visit.status = 'completed')
    or (p_status = 'cancelled' and visit.status = 'cancelled')
  ) and (
    nullif(pg_catalog.btrim(p_search), '') is null
    or visit.join_code ilike '%' || pg_catalog.btrim(p_search) || '%'
    or pg_catalog.concat_ws(' ', organizer_profile.first_name, organizer_profile.last_name)
      ilike '%' || pg_catalog.btrim(p_search) || '%'
    or exists (
      select 1 from public.visit_minors as searched_minor
      where searched_minor.visit_id = visit.id
        and searched_minor.full_name ilike '%' || pg_catalog.btrim(p_search) || '%'
    )
  )
  order by
    case
      when visit.status = 'in_progress' and visit.expected_return_at < pg_catalog.now() then 0
      when visit.status = 'in_progress' then 1
      when visit.status = 'forming' and visit.start_mode = 'now' then 3
      when visit.status = 'forming' and visit.planned_start_at::date = current_date then 4
      when visit.status = 'forming' then 5
      when visit.status = 'completed' then 6
      else 7
    end,
    case when visit.status = 'in_progress' then visit.expected_return_at
      when visit.status = 'forming' then visit.planned_start_at
      else visit.completed_at end asc nulls last
  limit p_limit;
end;
$$;
revoke all on function public.staff_list_ascents(text, integer, text) from public, anon, authenticated;
grant execute on function public.staff_list_ascents(text, integer, text) to authenticated;

drop function public.staff_list_return_controls(integer);
create function public.staff_list_return_controls(p_limit integer default 100)
returns table(
  visit_id uuid,
  user_id uuid,
  visitor_name text,
  join_code text,
  member_status text,
  started_at timestamptz,
  expected_return_at timestamptz,
  return_started_at timestamptz,
  checked_out_at timestamptz,
  attention_state text,
  participant_count bigint,
  minors jsonb,
  creation_origin text,
  finalized_by_administration boolean
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (
    public.has_staff_permission('can_view_visitors')
    or public.has_staff_permission('can_confirm_returns')
  ) then
    raise exception using errcode = '42501', message = 'Return access is required.';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 250 then
    raise exception using errcode = '22023', message = 'Invalid page size.';
  end if;

  return query
  select
    visit.id,
    member.user_id,
    pg_catalog.concat_ws(' ', profile.first_name, profile.last_name),
    visit.join_code,
    member.member_status::text,
    visit.started_at,
    visit.expected_return_at,
    member.return_started_at,
    member.checked_out_at,
    case when member.checkout_method = 'staff' then 'administratively_completed'
      when member.member_status = 'returned_early' then 'early_return_completed'
      when member.member_status = 'returning_early' then 'early_return'
      when visit.expected_return_at < pg_catalog.now() then 'overdue'
      when visit.expected_return_at < pg_catalog.now() + interval '2 hours' then 'due_soon'
      else 'on_route' end,
    (select count(*) from public.visit_members as counted
      where counted.visit_id = visit.id
        and counted.member_status <> 'withdrawn_before_start')
      + (select count(*) from public.visit_minors as counted_minor
        where counted_minor.visit_id = visit.id),
    (select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id', minor.id,
      'full_name', minor.full_name,
      'age', minor.age,
      'sex', minor.sex,
      'relationship', minor.relationship,
      'member_status', public.visit_minor_operational_status(visit.status, member.member_status),
      'checked_out_at', member.checked_out_at
    ) order by minor.full_name), '[]'::jsonb)
    from public.visit_minors as minor
    where minor.visit_id = visit.id and minor.responsible_member_id = member.user_id),
    visit.creation_origin,
    coalesce(member.checkout_method = 'staff', false)
  from public.visit_members as member
  join public.visits as visit on visit.id = member.visit_id
  join public.profiles as profile on profile.id = member.user_id
  where (
    visit.status = 'in_progress'
    and member.member_status in ('active', 'returning_early', 'returned_early')
  ) or (
    member.checkout_method = 'staff'
    and member.checked_out_at > pg_catalog.now() - interval '7 days'
  )
  order by
    case when visit.status = 'in_progress'
      and visit.expected_return_at < pg_catalog.now()
      and member.member_status <> 'returned_early' then 0
      when member.member_status = 'returning_early' then 1
      else 2 end,
    coalesce(member.checked_out_at, visit.expected_return_at) desc,
    profile.first_name
  limit p_limit;
end;
$$;
revoke all on function public.staff_list_return_controls(integer) from public, anon, authenticated;
grant execute on function public.staff_list_return_controls(integer) to authenticated;

create or replace function public.staff_get_visitor_summary(p_user_id uuid, p_visit_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if not public.has_staff_permission('can_view_visitors') then
    raise exception using errcode = '42501', message = 'Visitor access is required.';
  end if;

  select pg_catalog.jsonb_build_object(
    'user_id', profile.id,
    'visit_id', visit.id,
    'first_name', profile.first_name,
    'last_name', profile.last_name,
    'nationality_country_code', profile.nationality_country_code,
    'avatar_kind', profile.avatar_kind,
    'avatar_path', profile.avatar_path,
    'avatar_preset', profile.avatar_preset,
    'registration_origin', profile.registration_origin,
    'registered_by', profile.registered_by,
    'registered_at', profile.registered_at,
    'member_role', membership.member_role::text,
    'member_status', membership.member_status::text,
    'visit_status', visit.status::text,
    'join_code', visit.join_code,
    'visit_type', visit.visit_type::text,
    'route_name', route.name_es,
    'planned_start_at', visit.planned_start_at,
    'started_at', visit.started_at,
    'expected_return_at', visit.expected_return_at,
    'completed_at', visit.completed_at,
    'return_started_at', membership.return_started_at,
    'checked_out_at', membership.checked_out_at,
    'creation_origin', visit.creation_origin,
    'created_by_staff', visit.created_by_staff,
    'administrative_created_at', visit.administrative_created_at,
    'finalized_by_administration', membership.checkout_method = 'staff',
    'administrative_return_recorded_at', membership.administrative_return_recorded_at,
    'participant_count',
      (select count(*) from public.visit_members as counted
        where counted.visit_id = visit.id
          and counted.member_status <> 'withdrawn_before_start')
      + (select count(*) from public.visit_minors as counted_minor
        where counted_minor.visit_id = visit.id),
    'history', (
      select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'visit_id', historical_visit.id,
        'join_code', historical_visit.join_code,
        'visit_type', historical_visit.visit_type::text,
        'visit_status', historical_visit.status::text,
        'member_status', historical_member.member_status::text,
        'planned_start_at', historical_visit.planned_start_at,
        'started_at', historical_visit.started_at,
        'expected_return_at', historical_visit.expected_return_at,
        'completed_at', historical_visit.completed_at,
        'checked_out_at', historical_member.checked_out_at,
        'creation_origin', historical_visit.creation_origin,
        'finalized_by_administration', historical_member.checkout_method = 'staff',
        'minors', (
          select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
            'id', minor.id,
            'full_name', minor.full_name,
            'age', minor.age,
            'sex', minor.sex,
            'relationship', minor.relationship,
            'member_status', public.visit_minor_operational_status(historical_visit.status, historical_member.member_status),
            'checked_out_at', historical_member.checked_out_at
          ) order by minor.full_name), '[]'::jsonb)
          from public.visit_minors as minor
          where minor.visit_id = historical_visit.id
            and minor.responsible_member_id = historical_member.user_id
        )
      ) order by coalesce(
        historical_visit.started_at,
        historical_visit.planned_start_at,
        historical_visit.created_at
      ) desc), '[]'::jsonb)
      from public.visit_members as historical_member
      join public.visits as historical_visit on historical_visit.id = historical_member.visit_id
      where historical_member.user_id = profile.id
    )
  ) into result
  from public.visit_members as membership
  join public.profiles as profile on profile.id = membership.user_id
  join public.visits as visit on visit.id = membership.visit_id
  join public.routes as route on route.id = visit.route_id
  where membership.user_id = p_user_id and membership.visit_id = p_visit_id;

  if result is null then
    raise exception using errcode = 'P0002', message = 'Visitor record was not found.';
  end if;
  return result;
end;
$$;
