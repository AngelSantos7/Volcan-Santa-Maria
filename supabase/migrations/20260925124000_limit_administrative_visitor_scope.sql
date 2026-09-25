create function public.assert_visit_member_profile_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.user_roles as user_role
    where user_role.user_id = new.user_id
      and user_role.role <> 'tourist'::public.app_role
  ) then
    raise exception using errcode = '42501', message = 'Only tourists or walk-in visitors can join an ascent.';
  end if;
  return new;
end;
$$;

revoke all on function public.assert_visit_member_profile_role()
from public, anon, authenticated;

create trigger visit_members_before_insert_validate_profile_role
before insert on public.visit_members
for each row execute function public.assert_visit_member_profile_role();

create or replace function public.staff_find_visitor(
  p_document_type text,
  p_document_number text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  normalized_type text := pg_catalog.lower(pg_catalog.btrim(p_document_type));
  normalized_number text := pg_catalog.upper(pg_catalog.regexp_replace(p_document_number, '\s+', '', 'g'));
  result jsonb;
begin
  if not (public.has_staff_permission('can_register_walk_in_visitors') or public.has_staff_permission('can_manage_visits')) then
    raise exception using errcode = '42501', message = 'Walk-in visitor permission is required.';
  end if;
  if normalized_type not in ('dpi', 'passport') or nullif(normalized_number, '') is null then
    raise exception using errcode = '22023', message = 'A valid identity document is required.';
  end if;
  select pg_catalog.jsonb_build_object(
    'visitor_id', profile.id,
    'full_name', pg_catalog.concat_ws(' ', profile.first_name, profile.last_name),
    'first_name', profile.first_name,
    'last_name', profile.last_name,
    'nationality_country_code', profile.nationality_country_code,
    'registration_origin', profile.registration_origin
  ) into result
  from public.profiles as profile
  where profile.document_type::text = normalized_type
    and pg_catalog.upper(pg_catalog.regexp_replace(profile.document_number, '\s+', '', 'g')) = normalized_number
    and not exists (
      select 1 from public.user_roles as user_role
      where user_role.user_id = profile.id and user_role.role <> 'tourist'
    )
  order by profile.created_at limit 1;
  return result;
end;
$$;

create or replace function public.staff_list_visitor_directory(
  p_search text default null,
  p_limit integer default 200
)
returns table (
  visitor_id uuid,
  full_name text,
  nationality_country_code text,
  registration_origin text,
  registered_at timestamptz,
  latest_visit_id uuid,
  latest_visit_status text,
  latest_member_status text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare normalized_search text := nullif(pg_catalog.btrim(p_search), '');
begin
  if not (
    public.has_staff_permission('can_view_visitors')
    or public.has_staff_permission('can_register_walk_in_visitors')
    or public.has_staff_permission('can_manage_visits')
  ) then
    raise exception using errcode = '42501', message = 'Visitor access is required.';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 250 then
    raise exception using errcode = '22023', message = 'Invalid page size.';
  end if;
  return query
  select profile.id, pg_catalog.concat_ws(' ', profile.first_name, profile.last_name),
    profile.nationality_country_code, profile.registration_origin,
    coalesce(profile.registered_at, profile.created_at), latest.visit_id,
    latest.visit_status, latest.member_status
  from public.profiles as profile
  left join lateral (
    select member.visit_id, visit.status::text as visit_status,
      member.member_status::text as member_status
    from public.visit_members as member
    join public.visits as visit on visit.id = member.visit_id
    where member.user_id = profile.id
    order by coalesce(visit.started_at, visit.planned_start_at, visit.created_at) desc
    limit 1
  ) as latest on true
  where nullif(profile.first_name, '') is not null
    and nullif(profile.last_name, '') is not null
    and not exists (
      select 1 from public.user_roles as user_role
      where user_role.user_id = profile.id and user_role.role <> 'tourist'
    )
    and (normalized_search is null or pg_catalog.concat_ws(' ', profile.first_name, profile.last_name)
      ilike '%' || normalized_search || '%')
  order by coalesce(profile.registered_at, profile.created_at) desc, full_name
  limit p_limit;
end;
$$;

create or replace function public.get_visitor_dashboard_stats(p_from timestamptz, p_to timestamptz)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare result jsonb;
begin
  if not public.has_staff_permission('can_view_visitors') then
    raise exception using errcode = '42501', message = 'Visitor access is required.';
  end if;
  perform public.assert_admin_range(p_from, p_to);
  with visit_sizes as (
    select member.visit_id, count(*)::integer as participant_count
    from public.visit_members as member
    where member.member_status <> 'withdrawn_before_start'
    group by member.visit_id
  ), period_visits as (
    select visit.*, coalesce(size.participant_count, 0) as participant_count
    from public.visits as visit left join visit_sizes as size on size.visit_id = visit.id
    where coalesce(visit.started_at, visit.planned_start_at, visit.created_at) >= p_from
      and coalesce(visit.started_at, visit.planned_start_at, visit.created_at) < p_to
      and visit.status <> 'cancelled'
  ) select pg_catalog.jsonb_build_object(
    'visitors_registered', (select count(*) from public.profiles as profile
      where coalesce(profile.registered_at, profile.created_at) >= p_from
        and coalesce(profile.registered_at, profile.created_at) < p_to
        and not exists (select 1 from public.user_roles as user_role
          where user_role.user_id = profile.id and user_role.role <> 'tourist')),
    'entries_registered', (select count(*) from public.visit_members as member
      join public.visits as visit on visit.id = member.visit_id
      where visit.started_at >= p_from and visit.started_at < p_to
        and member.member_status <> 'withdrawn_before_start'),
    'exits_registered', (select count(*) from public.visit_members as member
      join public.visits as visit on visit.id = member.visit_id
      where coalesce(member.checked_out_at, visit.completed_at) >= p_from
        and coalesce(member.checked_out_at, visit.completed_at) < p_to
        and member.member_status in ('returned_early', 'completed')),
    'currently_on_route', (select count(*) from public.visit_members as member
      join public.visits as visit on visit.id = member.visit_id
      where visit.status = 'in_progress' and member.member_status in ('active', 'returning_early')),
    'ascents_total', (select count(*) from period_visits),
    'ascents_group', (select count(*) from period_visits where participant_count > 1),
    'ascents_individual', (select count(*) from period_visits where participant_count = 1),
    'ascents_started', (select count(*) from public.visits where started_at >= p_from and started_at < p_to),
    'ascents_scheduled', (select count(*) from public.visits where status = 'forming' and planned_start_at >= p_from and planned_start_at < p_to),
    'ascents_completed', (select count(*) from public.visits where completed_at >= p_from and completed_at < p_to),
    'early_returns', (select count(*) from public.visit_members where member_status = 'returned_early'
      and checked_out_at >= p_from and checked_out_at < p_to),
    'pending_returns', (select count(*) from public.visit_members as member
      join public.visits as visit on visit.id = member.visit_id
      where visit.status = 'in_progress' and visit.expected_return_at < pg_catalog.clock_timestamp()
        and member.member_status in ('active', 'returning_early'))
  ) into result;
  return result;
end;
$$;

revoke all on function public.staff_find_visitor(text, text) from public, anon, authenticated;
revoke all on function public.staff_list_visitor_directory(text, integer) from public, anon, authenticated;
grant execute on function public.staff_find_visitor(text, text) to authenticated;
grant execute on function public.staff_list_visitor_directory(text, integer) to authenticated;
