create table public.staff_permissions (
  user_id uuid primary key references auth.users (id) on delete cascade,
  is_active boolean not null default false,
  can_view_visitors boolean not null default false,
  can_view_sensitive_data boolean not null default false,
  can_view_identity_documents boolean not null default false,
  can_manage_visits boolean not null default false,
  can_confirm_returns boolean not null default false,
  can_register_walk_in_visitors boolean not null default false,
  can_manage_announcements boolean not null default false,
  can_manage_route boolean not null default false,
  can_manage_users boolean not null default false,
  can_manage_staff boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_user_id uuid references auth.users (id) on delete set null,
  action text not null check (nullif(btrim(action), '') is not null),
  target_type text not null check (nullif(btrim(target_type), '') is not null),
  target_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint audit_logs_metadata_object check (jsonb_typeof(metadata) = 'object')
);

create index audit_logs_created_at_idx on public.audit_logs (created_at desc);
create index audit_logs_actor_idx on public.audit_logs (actor_user_id, created_at desc);
create index audit_logs_action_idx on public.audit_logs (action, created_at desc);

alter table public.staff_permissions enable row level security;
alter table public.audit_logs enable row level security;
revoke all on table public.staff_permissions from public, anon, authenticated;
revoke all on table public.audit_logs from public, anon, authenticated;
revoke all on sequence public.audit_logs_id_seq from public, anon, authenticated;

create function public.set_staff_permissions_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = pg_catalog.clock_timestamp();
  return new;
end;
$$;

revoke all on function public.set_staff_permissions_updated_at()
from public, anon, authenticated;

create trigger staff_permissions_before_update_set_updated_at
before update on public.staff_permissions
for each row execute function public.set_staff_permissions_updated_at();

create function public.is_admin(requested_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select requested_user_id is not null and exists (
    select 1
    from public.user_roles as user_role
    where user_role.user_id = requested_user_id
      and user_role.role = 'admin'::public.app_role
  );
$$;

create function public.is_visitor_manager(requested_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select requested_user_id is not null and exists (
    select 1
    from public.user_roles as user_role
    join public.staff_permissions as permission
      on permission.user_id = user_role.user_id
    where user_role.user_id = requested_user_id
      and user_role.role = 'visitor_manager'::public.app_role
      and permission.is_active
  );
$$;

create function public.is_admin_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_admin(auth.uid()) or public.is_visitor_manager(auth.uid());
$$;

create function public.has_staff_permission(permission_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  permission_allowed boolean;
begin
  if public.is_admin(current_user_id) then
    return true;
  end if;

  if not public.is_visitor_manager(current_user_id) then
    return false;
  end if;

  select case permission_name
    when 'can_view_visitors' then p.can_view_visitors
    when 'can_view_sensitive_data' then p.can_view_sensitive_data
    when 'can_view_identity_documents' then p.can_view_identity_documents
    when 'can_manage_visits' then p.can_manage_visits
    when 'can_confirm_returns' then p.can_confirm_returns
    when 'can_register_walk_in_visitors' then p.can_register_walk_in_visitors
    when 'can_manage_announcements' then p.can_manage_announcements
    when 'can_manage_route' then p.can_manage_route
    when 'can_manage_users' then p.can_manage_users
    when 'can_manage_staff' then p.can_manage_staff
    else false
  end
  into permission_allowed
  from public.staff_permissions as p
  where p.user_id = current_user_id and p.is_active;

  return coalesce(permission_allowed, false);
end;
$$;

revoke all on function public.is_admin(uuid) from public, anon, authenticated;
revoke all on function public.is_visitor_manager(uuid) from public, anon, authenticated;
revoke all on function public.is_admin_staff() from public, anon, authenticated;
revoke all on function public.has_staff_permission(text) from public, anon, authenticated;
grant execute on function public.is_admin(uuid) to authenticated;
grant execute on function public.is_visitor_manager(uuid) to authenticated;
grant execute on function public.is_admin_staff() to authenticated;
grant execute on function public.has_staff_permission(text) to authenticated;

create function public.get_admin_session()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  result jsonb;
begin
  if current_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;

  select jsonb_build_object(
    'user_id', current_user_id,
    'email', auth_user.email,
    'first_name', profile.first_name,
    'last_name', profile.last_name,
    'role', user_role.role::text,
    'is_active', case
      when user_role.role = 'admin'::public.app_role then true
      else coalesce(permission.is_active, false)
    end,
    'permissions', jsonb_build_object(
      'can_view_visitors', user_role.role = 'admin'::public.app_role or coalesce(permission.can_view_visitors, false),
      'can_view_sensitive_data', user_role.role = 'admin'::public.app_role or coalesce(permission.can_view_sensitive_data, false),
      'can_view_identity_documents', user_role.role = 'admin'::public.app_role or coalesce(permission.can_view_identity_documents, false),
      'can_manage_visits', user_role.role = 'admin'::public.app_role or coalesce(permission.can_manage_visits, false),
      'can_confirm_returns', user_role.role = 'admin'::public.app_role or coalesce(permission.can_confirm_returns, false),
      'can_register_walk_in_visitors', user_role.role = 'admin'::public.app_role or coalesce(permission.can_register_walk_in_visitors, false),
      'can_manage_announcements', user_role.role = 'admin'::public.app_role or coalesce(permission.can_manage_announcements, false),
      'can_manage_route', user_role.role = 'admin'::public.app_role or coalesce(permission.can_manage_route, false),
      'can_manage_users', user_role.role = 'admin'::public.app_role or coalesce(permission.can_manage_users, false),
      'can_manage_staff', user_role.role = 'admin'::public.app_role or coalesce(permission.can_manage_staff, false)
    )
  )
  into result
  from public.user_roles as user_role
  join auth.users as auth_user on auth_user.id = user_role.user_id
  left join public.profiles as profile on profile.id = user_role.user_id
  left join public.staff_permissions as permission on permission.user_id = user_role.user_id
  where user_role.user_id = current_user_id;

  return coalesce(result, jsonb_build_object(
    'user_id', current_user_id,
    'role', 'tourist',
    'is_active', false,
    'permissions', '{}'::jsonb
  ));
end;
$$;

revoke all on function public.get_admin_session() from public, anon, authenticated;
grant execute on function public.get_admin_session() to authenticated;

create function public.assert_admin_range(p_from timestamptz, p_to timestamptz)
returns void
language plpgsql
immutable
security invoker
set search_path = ''
as $$
begin
  if p_from is null or p_to is null or p_from >= p_to then
    raise exception using errcode = '22023', message = 'A valid half-open date range is required.';
  end if;
  if p_to - p_from > interval '2 years' then
    raise exception using errcode = '22023', message = 'The requested range is too large.';
  end if;
end;
$$;

revoke all on function public.assert_admin_range(timestamptz, timestamptz)
from public, anon, authenticated;

create function public.get_visitor_dashboard_stats(
  p_from timestamptz,
  p_to timestamptz
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if not public.has_staff_permission('can_view_visitors') then
    raise exception using errcode = '42501', message = 'Visitor access is required.';
  end if;
  perform public.assert_admin_range(p_from, p_to);

  with visit_sizes as (
    select member.visit_id, count(*)::integer as participant_count
    from public.visit_members as member
    where member.member_status <> 'withdrawn_before_start'::public.visit_member_status
    group by member.visit_id
  ), period_visits as (
    select visit.*, coalesce(size.participant_count, 0) as participant_count
    from public.visits as visit
    left join visit_sizes as size on size.visit_id = visit.id
    where coalesce(visit.started_at, visit.planned_start_at, visit.created_at) >= p_from
      and coalesce(visit.started_at, visit.planned_start_at, visit.created_at) < p_to
      and visit.status <> 'cancelled'::public.visit_status
  )
  select jsonb_build_object(
    'visitors_registered', (
      select count(*) from public.visit_members as member
      where member.joined_at >= p_from and member.joined_at < p_to
        and member.member_status <> 'withdrawn_before_start'::public.visit_member_status
    ),
    'entries_registered', (
      select count(*)
      from public.visit_members as member
      join public.visits as visit on visit.id = member.visit_id
      where visit.started_at >= p_from and visit.started_at < p_to
        and member.member_status <> 'withdrawn_before_start'::public.visit_member_status
    ),
    'exits_registered', (
      select count(*)
      from public.visit_members as member
      join public.visits as visit on visit.id = member.visit_id
      where coalesce(member.checked_out_at, visit.completed_at) >= p_from
        and coalesce(member.checked_out_at, visit.completed_at) < p_to
        and member.member_status in (
          'returned_early'::public.visit_member_status,
          'completed'::public.visit_member_status
        )
    ),
    'currently_on_route', (
      select count(*)
      from public.visit_members as member
      join public.visits as visit on visit.id = member.visit_id
      where visit.status = 'in_progress'::public.visit_status
        and member.member_status in (
          'active'::public.visit_member_status,
          'returning_early'::public.visit_member_status
        )
    ),
    'ascents_total', (select count(*) from period_visits),
    'ascents_group', (select count(*) from period_visits where participant_count > 1),
    'ascents_individual', (select count(*) from period_visits where participant_count = 1),
    'ascents_started', (
      select count(*) from public.visits as visit
      where visit.started_at >= p_from and visit.started_at < p_to
    ),
    'ascents_scheduled', (
      select count(*) from public.visits as visit
      where visit.status = 'forming'::public.visit_status
        and visit.planned_start_at >= p_from and visit.planned_start_at < p_to
    ),
    'ascents_completed', (
      select count(*) from public.visits as visit
      where visit.completed_at >= p_from and visit.completed_at < p_to
    ),
    'early_returns', (
      select count(*) from public.visit_members as member
      where member.member_status = 'returned_early'::public.visit_member_status
        and member.checked_out_at >= p_from and member.checked_out_at < p_to
    ),
    'pending_returns', (
      select count(*)
      from public.visit_members as member
      join public.visits as visit on visit.id = member.visit_id
      where visit.status = 'in_progress'::public.visit_status
        and visit.expected_return_at < pg_catalog.clock_timestamp()
        and member.member_status in (
          'active'::public.visit_member_status,
          'returning_early'::public.visit_member_status
        )
    )
  ) into result;

  return result;
end;
$$;

create function public.get_visitor_dashboard_series(
  p_from timestamptz,
  p_to timestamptz
)
returns table (
  report_date date,
  visitors bigint,
  ascents bigint,
  exits bigint,
  early_returns bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.has_staff_permission('can_view_visitors') then
    raise exception using errcode = '42501', message = 'Visitor access is required.';
  end if;
  perform public.assert_admin_range(p_from, p_to);

  return query
  with dates as (
    select generated_day::date as report_date
    from generate_series(
      (p_from at time zone 'America/Guatemala')::date,
      ((p_to - interval '1 microsecond') at time zone 'America/Guatemala')::date,
      interval '1 day'
    ) as generated_day
  ), entries as (
    select
      (visit.started_at at time zone 'America/Guatemala')::date as report_date,
      count(*) as visitors,
      count(distinct visit.id) as ascents
    from public.visits as visit
    join public.visit_members as member on member.visit_id = visit.id
    where visit.started_at >= p_from and visit.started_at < p_to
      and member.member_status <> 'withdrawn_before_start'::public.visit_member_status
    group by 1
  ), departures as (
    select
      (coalesce(member.checked_out_at, visit.completed_at) at time zone 'America/Guatemala')::date as report_date,
      count(*) as exits,
      count(*) filter (
        where member.member_status = 'returned_early'::public.visit_member_status
      ) as early_returns
    from public.visit_members as member
    join public.visits as visit on visit.id = member.visit_id
    where coalesce(member.checked_out_at, visit.completed_at) >= p_from
      and coalesce(member.checked_out_at, visit.completed_at) < p_to
      and member.member_status in (
        'returned_early'::public.visit_member_status,
        'completed'::public.visit_member_status
      )
    group by 1
  )
  select
    dates.report_date,
    coalesce(entries.visitors, 0)::bigint,
    coalesce(entries.ascents, 0)::bigint,
    coalesce(departures.exits, 0)::bigint,
    coalesce(departures.early_returns, 0)::bigint
  from dates
  left join entries using (report_date)
  left join departures using (report_date)
  order by dates.report_date;
end;
$$;

revoke all on function public.get_visitor_dashboard_stats(timestamptz, timestamptz)
from public, anon, authenticated;
revoke all on function public.get_visitor_dashboard_series(timestamptz, timestamptz)
from public, anon, authenticated;
grant execute on function public.get_visitor_dashboard_stats(timestamptz, timestamptz)
to authenticated;
grant execute on function public.get_visitor_dashboard_series(timestamptz, timestamptz)
to authenticated;

create function public.staff_search_visitors(
  p_search text default null,
  p_status text default null,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  user_id uuid,
  visit_id uuid,
  full_name text,
  nationality_country_code text,
  avatar_kind text,
  avatar_path text,
  avatar_preset text,
  group_type text,
  member_status text,
  visit_status text,
  planned_start_at timestamptz,
  started_at timestamptz,
  expected_return_at timestamptz,
  participant_count bigint,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  normalized_search text := nullif(pg_catalog.btrim(p_search), '');
begin
  if not public.has_staff_permission('can_view_visitors') then
    raise exception using errcode = '42501', message = 'Visitor access is required.';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 100 or p_offset is null or p_offset < 0 then
    raise exception using errcode = '22023', message = 'Invalid pagination.';
  end if;
  if p_from is not null and p_to is not null then
    perform public.assert_admin_range(p_from, p_to);
  end if;

  return query
  with member_rows as (
    select
      member.user_id,
      member.visit_id,
      concat_ws(' ', profile.first_name, profile.last_name) as full_name,
      profile.nationality_country_code,
      profile.avatar_kind,
      profile.avatar_path,
      profile.avatar_preset,
      member.member_status::text as member_status,
      visit.status::text as visit_status,
      visit.planned_start_at,
      visit.started_at,
      visit.expected_return_at,
      count(*) over (partition by member.visit_id) as participant_count
    from public.visit_members as member
    join public.profiles as profile on profile.id = member.user_id
    join public.visits as visit on visit.id = member.visit_id
    where member.member_status <> 'withdrawn_before_start'::public.visit_member_status
      and (
        normalized_search is null
        or concat_ws(' ', profile.first_name, profile.last_name) ilike '%' || normalized_search || '%'
      )
      and (
        nullif(p_status, '') is null or p_status = 'all'
        or member.member_status::text = p_status
        or visit.status::text = p_status
      )
      and (p_from is null or coalesce(visit.started_at, visit.planned_start_at, member.joined_at) >= p_from)
      and (p_to is null or coalesce(visit.started_at, visit.planned_start_at, member.joined_at) < p_to)
  )
  select
    row_data.user_id,
    row_data.visit_id,
    row_data.full_name,
    row_data.nationality_country_code,
    row_data.avatar_kind,
    row_data.avatar_path,
    row_data.avatar_preset,
    case when row_data.participant_count > 1 then 'group' else 'individual' end,
    row_data.member_status,
    row_data.visit_status,
    row_data.planned_start_at,
    row_data.started_at,
    row_data.expected_return_at,
    row_data.participant_count,
    count(*) over ()
  from member_rows as row_data
  order by coalesce(row_data.started_at, row_data.planned_start_at) desc nulls last,
    row_data.full_name, row_data.user_id
  limit p_limit offset p_offset;
end;
$$;

create function public.staff_get_visitor_summary(p_user_id uuid, p_visit_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if not public.has_staff_permission('can_view_visitors') then
    raise exception using errcode = '42501', message = 'Visitor access is required.';
  end if;

  select jsonb_build_object(
    'user_id', profile.id,
    'visit_id', visit.id,
    'first_name', profile.first_name,
    'last_name', profile.last_name,
    'nationality_country_code', profile.nationality_country_code,
    'avatar_kind', profile.avatar_kind,
    'avatar_path', profile.avatar_path,
    'avatar_preset', profile.avatar_preset,
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
    'participant_count', (
      select count(*) from public.visit_members as counted
      where counted.visit_id = visit.id
        and counted.member_status <> 'withdrawn_before_start'::public.visit_member_status
    ),
    'history', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'visit_id', historical_visit.id,
        'join_code', historical_visit.join_code,
        'visit_type', historical_visit.visit_type::text,
        'visit_status', historical_visit.status::text,
        'member_status', historical_member.member_status::text,
        'planned_start_at', historical_visit.planned_start_at,
        'started_at', historical_visit.started_at,
        'expected_return_at', historical_visit.expected_return_at,
        'completed_at', historical_visit.completed_at,
        'checked_out_at', historical_member.checked_out_at
      ) order by coalesce(historical_visit.started_at, historical_visit.planned_start_at, historical_visit.created_at) desc), '[]'::jsonb)
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

create function public.staff_get_visitor_sensitive_details(
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

  select jsonb_build_object(
    'date_of_birth', profile.date_of_birth,
    'phone', profile.phone,
    'document_type', case when p_include_documents then profile.document_type::text else null end,
    'document_number', case when p_include_documents then profile.document_number else null end,
    'emergency_contact', case when contact.id is null then null else jsonb_build_object(
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
    current_user_id,
    'sensitive_data_viewed',
    'visitor',
    p_user_id::text,
    jsonb_build_object('included_identity_document', coalesce(p_include_documents, false))
  );
  if coalesce(p_include_documents, false) then
    insert into public.audit_logs (actor_user_id, action, target_type, target_id)
    values (current_user_id, 'identity_document_viewed', 'visitor', p_user_id::text);
  end if;

  return result;
end;
$$;

revoke all on function public.staff_search_visitors(text, text, timestamptz, timestamptz, integer, integer)
from public, anon, authenticated;
revoke all on function public.staff_get_visitor_summary(uuid, uuid)
from public, anon, authenticated;
revoke all on function public.staff_get_visitor_sensitive_details(uuid, boolean)
from public, anon, authenticated;
grant execute on function public.staff_search_visitors(text, text, timestamptz, timestamptz, integer, integer)
to authenticated;
grant execute on function public.staff_get_visitor_summary(uuid, uuid)
to authenticated;
grant execute on function public.staff_get_visitor_sensitive_details(uuid, boolean)
to authenticated;

create policy avatars_select_admin_staff
on storage.objects
for select
to authenticated
using (
  bucket_id = 'avatars'
  and public.has_staff_permission('can_view_visitors')
);

create function public.staff_list_ascents(
  p_status text default 'all',
  p_limit integer default 100
)
returns table (
  visit_id uuid,
  join_code text,
  organizer_name text,
  visit_type text,
  participant_count bigint,
  planned_start_at timestamptz,
  started_at timestamptz,
  expected_return_at timestamptz,
  completed_at timestamptz,
  visit_status text
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
    concat_ws(' ', profile.first_name, profile.last_name),
    visit.visit_type::text,
    count(member.user_id) filter (
      where member.member_status <> 'withdrawn_before_start'::public.visit_member_status
    ),
    visit.planned_start_at,
    visit.started_at,
    visit.expected_return_at,
    visit.completed_at,
    visit.status::text
  from public.visits as visit
  join public.profiles as profile on profile.id = visit.created_by
  left join public.visit_members as member on member.visit_id = visit.id
  where p_status = 'all'
    or (p_status = 'scheduled' and visit.status = 'forming'::public.visit_status)
    or (p_status = 'in_progress' and visit.status = 'in_progress'::public.visit_status)
    or (p_status = 'completed' and visit.status = 'completed'::public.visit_status)
  group by visit.id, profile.first_name, profile.last_name
  order by coalesce(visit.started_at, visit.planned_start_at, visit.created_at) desc
  limit p_limit;
end;
$$;

create function public.staff_list_return_controls(p_limit integer default 100)
returns table (
  visit_id uuid,
  user_id uuid,
  visitor_name text,
  join_code text,
  member_status text,
  started_at timestamptz,
  expected_return_at timestamptz,
  return_started_at timestamptz,
  checked_out_at timestamptz,
  attention_state text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
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
    concat_ws(' ', profile.first_name, profile.last_name),
    visit.join_code,
    member.member_status::text,
    visit.started_at,
    visit.expected_return_at,
    member.return_started_at,
    member.checked_out_at,
    case
      when member.member_status = 'returned_early'::public.visit_member_status then 'early_return_completed'
      when member.member_status = 'returning_early'::public.visit_member_status then 'early_return'
      when visit.expected_return_at < pg_catalog.clock_timestamp() then 'overdue'
      when visit.expected_return_at < pg_catalog.clock_timestamp() + interval '2 hours' then 'due_soon'
      else 'on_route'
    end
  from public.visit_members as member
  join public.visits as visit on visit.id = member.visit_id
  join public.profiles as profile on profile.id = member.user_id
  where visit.status = 'in_progress'::public.visit_status
    and member.member_status in (
      'active'::public.visit_member_status,
      'returning_early'::public.visit_member_status,
      'returned_early'::public.visit_member_status
    )
  order by
    case
      when visit.expected_return_at < pg_catalog.clock_timestamp()
        and member.member_status <> 'returned_early'::public.visit_member_status then 0
      when member.member_status = 'returning_early'::public.visit_member_status then 1
      else 2
    end,
    visit.expected_return_at,
    profile.first_name
  limit p_limit;
end;
$$;

revoke all on function public.staff_list_ascents(text, integer)
from public, anon, authenticated;
revoke all on function public.staff_list_return_controls(integer)
from public, anon, authenticated;
grant execute on function public.staff_list_ascents(text, integer) to authenticated;
grant execute on function public.staff_list_return_controls(integer) to authenticated;

create function public.admin_list_staff()
returns table (
  user_id uuid,
  full_name text,
  email text,
  role text,
  is_active boolean,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception using errcode = '42501', message = 'Administrator access is required.';
  end if;
  return query
  select
    user_role.user_id,
    concat_ws(' ', profile.first_name, profile.last_name),
    auth_user.email::text,
    user_role.role::text,
    case when user_role.role = 'admin'::public.app_role then true else coalesce(permission.is_active, false) end,
    coalesce(permission.updated_at, profile.updated_at, user_role.created_at)
  from public.user_roles as user_role
  join auth.users as auth_user on auth_user.id = user_role.user_id
  left join public.profiles as profile on profile.id = user_role.user_id
  left join public.staff_permissions as permission on permission.user_id = user_role.user_id
  where user_role.role in (
    'admin'::public.app_role,
    'visitor_manager'::public.app_role
  )
  order by user_role.role::text, full_name;
end;
$$;

create function public.admin_get_staff_permissions(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if not public.is_admin() then
    raise exception using errcode = '42501', message = 'Administrator access is required.';
  end if;
  select jsonb_build_object(
    'user_id', user_role.user_id,
    'role', user_role.role::text,
    'full_name', concat_ws(' ', profile.first_name, profile.last_name),
    'email', auth_user.email,
    'is_active', coalesce(permission.is_active, false),
    'can_view_visitors', coalesce(permission.can_view_visitors, false),
    'can_view_sensitive_data', coalesce(permission.can_view_sensitive_data, false),
    'can_view_identity_documents', coalesce(permission.can_view_identity_documents, false),
    'can_manage_visits', coalesce(permission.can_manage_visits, false),
    'can_confirm_returns', coalesce(permission.can_confirm_returns, false),
    'can_register_walk_in_visitors', coalesce(permission.can_register_walk_in_visitors, false),
    'can_manage_announcements', coalesce(permission.can_manage_announcements, false),
    'can_manage_route', coalesce(permission.can_manage_route, false),
    'can_manage_users', coalesce(permission.can_manage_users, false),
    'can_manage_staff', coalesce(permission.can_manage_staff, false),
    'updated_at', permission.updated_at
  ) into result
  from public.user_roles as user_role
  join auth.users as auth_user on auth_user.id = user_role.user_id
  left join public.profiles as profile on profile.id = user_role.user_id
  left join public.staff_permissions as permission on permission.user_id = user_role.user_id
  where user_role.user_id = p_user_id
    and user_role.role = 'visitor_manager'::public.app_role;

  if result is null then
    raise exception using errcode = 'P0002', message = 'Visitor manager was not found.';
  end if;
  return result;
end;
$$;

create function public.admin_update_staff_permissions(
  p_user_id uuid,
  p_permissions jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  previous_permissions jsonb;
  updated_permissions jsonb;
  allowed_keys constant text[] := array[
    'can_view_visitors', 'can_view_sensitive_data',
    'can_view_identity_documents', 'can_manage_visits',
    'can_confirm_returns', 'can_register_walk_in_visitors',
    'can_manage_announcements', 'can_manage_route',
    'can_manage_users', 'can_manage_staff'
  ];
begin
  if not public.is_admin(current_user_id) then
    raise exception using errcode = '42501', message = 'Administrator access is required.';
  end if;
  if p_permissions is null or jsonb_typeof(p_permissions) <> 'object'
    or exists (select 1 from jsonb_object_keys(p_permissions) as supplied(key) where not (supplied.key = any(allowed_keys)))
    or exists (select 1 from jsonb_each(p_permissions) as supplied(key, value) where jsonb_typeof(supplied.value) <> 'boolean') then
    raise exception using errcode = '22023', message = 'Invalid permission payload.';
  end if;
  if not exists (
    select 1 from public.user_roles
    where user_id = p_user_id and role = 'visitor_manager'::public.app_role
  ) then
    raise exception using errcode = 'P0002', message = 'Visitor manager was not found.';
  end if;

  insert into public.staff_permissions (user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;

  select to_jsonb(permission) - 'user_id' - 'created_at' - 'updated_at'
  into previous_permissions
  from public.staff_permissions as permission where permission.user_id = p_user_id;

  update public.staff_permissions as permission
  set
    can_view_visitors = coalesce((p_permissions ->> 'can_view_visitors')::boolean, permission.can_view_visitors),
    can_view_sensitive_data = coalesce((p_permissions ->> 'can_view_sensitive_data')::boolean, permission.can_view_sensitive_data),
    can_view_identity_documents = coalesce((p_permissions ->> 'can_view_identity_documents')::boolean, permission.can_view_identity_documents),
    can_manage_visits = coalesce((p_permissions ->> 'can_manage_visits')::boolean, permission.can_manage_visits),
    can_confirm_returns = coalesce((p_permissions ->> 'can_confirm_returns')::boolean, permission.can_confirm_returns),
    can_register_walk_in_visitors = coalesce((p_permissions ->> 'can_register_walk_in_visitors')::boolean, permission.can_register_walk_in_visitors),
    can_manage_announcements = coalesce((p_permissions ->> 'can_manage_announcements')::boolean, permission.can_manage_announcements),
    can_manage_route = coalesce((p_permissions ->> 'can_manage_route')::boolean, permission.can_manage_route),
    can_manage_users = coalesce((p_permissions ->> 'can_manage_users')::boolean, permission.can_manage_users),
    can_manage_staff = coalesce((p_permissions ->> 'can_manage_staff')::boolean, permission.can_manage_staff)
  where permission.user_id = p_user_id
  returning to_jsonb(permission) - 'user_id' - 'created_at' - 'updated_at'
  into updated_permissions;

  insert into public.audit_logs (actor_user_id, action, target_type, target_id, metadata)
  values (
    current_user_id,
    'staff_permissions_changed',
    'staff_user',
    p_user_id::text,
    jsonb_build_object('before', previous_permissions, 'after', updated_permissions)
  );
  return updated_permissions;
end;
$$;

create function public.admin_set_staff_access(p_user_id uuid, p_is_active boolean)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  previous_active boolean;
begin
  if not public.is_admin(current_user_id) then
    raise exception using errcode = '42501', message = 'Administrator access is required.';
  end if;
  if not exists (
    select 1 from public.user_roles
    where user_id = p_user_id and role = 'visitor_manager'::public.app_role
  ) then
    raise exception using errcode = 'P0002', message = 'Visitor manager was not found.';
  end if;

  insert into public.staff_permissions (user_id, is_active)
  values (p_user_id, coalesce(p_is_active, false))
  on conflict (user_id) do update set is_active = excluded.is_active
  returning is_active into previous_active;

  insert into public.audit_logs (actor_user_id, action, target_type, target_id, metadata)
  values (
    current_user_id,
    case when p_is_active then 'staff_activated' else 'staff_deactivated' end,
    'staff_user',
    p_user_id::text,
    jsonb_build_object('is_active', coalesce(p_is_active, false))
  );
  return previous_active;
end;
$$;

create function public.admin_set_user_role(p_user_id uuid, p_role text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  previous_role text;
begin
  if not public.is_admin(current_user_id) then
    raise exception using errcode = '42501', message = 'Administrator access is required.';
  end if;
  if p_role not in ('tourist', 'visitor_manager', 'admin') then
    raise exception using errcode = '22023', message = 'Unsupported role.';
  end if;
  if p_user_id = current_user_id and p_role <> 'admin' then
    raise exception using errcode = '22023', message = 'Administrators cannot demote their own account.';
  end if;

  select role::text into previous_role
  from public.user_roles where user_id = p_user_id for update;
  if previous_role is null then
    raise exception using errcode = 'P0002', message = 'User role was not found.';
  end if;

  update public.user_roles
  set role = p_role::public.app_role
  where user_id = p_user_id;

  if p_role = 'visitor_manager' then
    insert into public.staff_permissions (user_id, is_active)
    values (p_user_id, false)
    on conflict (user_id) do nothing;
  elsif p_role = 'tourist' then
    update public.staff_permissions set is_active = false where user_id = p_user_id;
  end if;

  insert into public.audit_logs (actor_user_id, action, target_type, target_id, metadata)
  values (
    current_user_id,
    'user_role_changed',
    'user',
    p_user_id::text,
    jsonb_build_object('previous_role', previous_role, 'new_role', p_role)
  );
  return p_role;
end;
$$;

create function public.admin_list_audit_logs(
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_action text default null,
  p_actor_search text default null,
  p_limit integer default 100
)
returns table (
  id bigint,
  created_at timestamptz,
  actor_user_id uuid,
  actor_name text,
  actor_email text,
  action text,
  target_type text,
  target_id text,
  metadata jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception using errcode = '42501', message = 'Administrator access is required.';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 250 then
    raise exception using errcode = '22023', message = 'Invalid page size.';
  end if;
  return query
  select
    audit.id,
    audit.created_at,
    audit.actor_user_id,
    concat_ws(' ', profile.first_name, profile.last_name),
    auth_user.email::text,
    audit.action,
    audit.target_type,
    audit.target_id,
    audit.metadata
  from public.audit_logs as audit
  left join auth.users as auth_user on auth_user.id = audit.actor_user_id
  left join public.profiles as profile on profile.id = audit.actor_user_id
  where (p_from is null or audit.created_at >= p_from)
    and (p_to is null or audit.created_at < p_to)
    and (nullif(p_action, '') is null or audit.action = p_action)
    and (
      nullif(pg_catalog.btrim(p_actor_search), '') is null
      or concat_ws(' ', profile.first_name, profile.last_name) ilike '%' || pg_catalog.btrim(p_actor_search) || '%'
      or auth_user.email ilike '%' || pg_catalog.btrim(p_actor_search) || '%'
    )
  order by audit.created_at desc, audit.id desc
  limit p_limit;
end;
$$;

revoke all on function public.admin_list_staff() from public, anon, authenticated;
revoke all on function public.admin_get_staff_permissions(uuid) from public, anon, authenticated;
revoke all on function public.admin_update_staff_permissions(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.admin_set_staff_access(uuid, boolean) from public, anon, authenticated;
revoke all on function public.admin_set_user_role(uuid, text) from public, anon, authenticated;
revoke all on function public.admin_list_audit_logs(timestamptz, timestamptz, text, text, integer)
from public, anon, authenticated;
grant execute on function public.admin_list_staff() to authenticated;
grant execute on function public.admin_get_staff_permissions(uuid) to authenticated;
grant execute on function public.admin_update_staff_permissions(uuid, jsonb) to authenticated;
grant execute on function public.admin_set_staff_access(uuid, boolean) to authenticated;
grant execute on function public.admin_set_user_role(uuid, text) to authenticated;
grant execute on function public.admin_list_audit_logs(timestamptz, timestamptz, text, text, integer)
to authenticated;
