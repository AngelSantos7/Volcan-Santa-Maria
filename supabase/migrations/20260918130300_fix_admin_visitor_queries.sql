create or replace function public.staff_search_visitors(
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
      (
        select count(*)
        from public.visit_members as counted_member
        where counted_member.visit_id = member.visit_id
          and counted_member.member_status <>
            'withdrawn_before_start'::public.visit_member_status
      ) as participant_count
    from public.visit_members as member
    join public.profiles as profile on profile.id = member.user_id
    join public.visits as visit on visit.id = member.visit_id
    where member.member_status <> 'withdrawn_before_start'::public.visit_member_status
      and (
        normalized_search is null
        or concat_ws(' ', profile.first_name, profile.last_name)
          ilike '%' || normalized_search || '%'
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
  if not exists (
    select 1 from public.visit_members as membership
    where membership.user_id = p_user_id
  ) then
    raise exception using errcode = 'P0002', message = 'Visitor record was not found.';
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

create or replace function public.admin_list_staff()
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
  order by user_role.role::text,
    concat_ws(' ', profile.first_name, profile.last_name);
end;
$$;
