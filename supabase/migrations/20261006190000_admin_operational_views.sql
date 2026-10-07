-- Derived operational views for the consolidated Spanish administration UI.

drop function if exists public.staff_list_ascents(text, integer, text);
create function public.staff_list_ascents(
  p_status text default 'all', p_limit integer default 100, p_search text default null
) returns table(
  visit_id uuid, join_code text, organizer_name text, visit_type text,
  participant_count bigint, adult_count bigint, minor_count bigint,
  minor_matches jsonb, planned_start_at timestamptz, started_at timestamptz,
  expected_return_at timestamptz, completed_at timestamptz, visit_status text,
  creation_origin text, finalized_by_administration boolean
) language plpgsql stable security definer set search_path = '' as $$
declare normalized_search text := nullif(pg_catalog.btrim(p_search), '');
begin
  if not(public.has_staff_permission('can_view_visitors') or public.has_staff_permission('can_manage_visits') or public.has_staff_permission('can_confirm_returns')) then
    raise exception using errcode='42501', message='Visit access is required.';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 250 then
    raise exception using errcode='22023', message='Invalid page size.';
  end if;
  return query
  select
    visit.id, visit.join_code,
    pg_catalog.concat_ws(' ', organizer_profile.first_name, organizer_profile.last_name),
    visit.visit_type::text,
    (select count(*) from public.visit_members counted where counted.visit_id=visit.id and counted.member_status<>'withdrawn_before_start')
      + (select count(*) from public.visit_minors minor where minor.visit_id=visit.id),
    (select count(*) from public.visit_members counted where counted.visit_id=visit.id and counted.member_status<>'withdrawn_before_start'),
    (select count(*) from public.visit_minors minor where minor.visit_id=visit.id),
    case when normalized_search is null then '[]'::jsonb else (
      select coalesce(jsonb_agg(jsonb_build_object(
        'full_name', minor.full_name,
        'responsible_name', pg_catalog.concat_ws(' ', responsible.first_name, responsible.last_name)
      ) order by minor.full_name), '[]'::jsonb)
      from public.visit_minors minor
      join public.profiles responsible on responsible.id=minor.responsible_member_id
      where minor.visit_id=visit.id and minor.full_name ilike '%'||normalized_search||'%'
    ) end,
    visit.planned_start_at, visit.started_at, visit.expected_return_at,
    visit.completed_at, public.visit_operational_status(visit.id),
    visit.creation_origin,
    exists(select 1 from public.visit_members member where member.visit_id=visit.id and member.checkout_method='staff')
  from public.visits visit
  join public.visit_members organizer on organizer.visit_id=visit.id and organizer.member_role='leader'
  join public.profiles organizer_profile on organizer_profile.id=organizer.user_id
  where (p_status='all' or public.visit_operational_status(visit.id)=p_status)
    and (normalized_search is null
      or visit.join_code ilike '%'||normalized_search||'%'
      or exists(
        select 1 from public.visit_members searched_member
        join public.profiles searched_profile on searched_profile.id=searched_member.user_id
        where searched_member.visit_id=visit.id
          and pg_catalog.concat_ws(' ', searched_profile.first_name, searched_profile.last_name) ilike '%'||normalized_search||'%'
      )
      or exists(select 1 from public.visit_minors searched_minor where searched_minor.visit_id=visit.id and searched_minor.full_name ilike '%'||normalized_search||'%')
    )
  order by case
      when visit.status='in_progress' and visit.expected_return_at<pg_catalog.now() then 0
      when public.visit_operational_status(visit.id)='pending_returns' then 1
      when visit.status='in_progress' then 2
      when visit.status='forming' and visit.planned_start_at is null then 3
      when visit.status='forming' and visit.planned_start_at::date=current_date then 4
      when visit.status='forming' then 5
      when visit.status='completed' then 6 else 7 end,
    coalesce(visit.expected_return_at, visit.planned_start_at, visit.completed_at) asc nulls last
  limit p_limit;
end;
$$;
revoke all on function public.staff_list_ascents(text, integer, text) from public, anon, authenticated;
grant execute on function public.staff_list_ascents(text, integer, text) to authenticated;

drop function if exists public.staff_list_visitor_directory(text, integer);
create function public.staff_list_visitor_directory(p_search text default null, p_limit integer default 200)
returns table(
  visitor_id uuid, full_name text, nationality_country_code text,
  department_code text, sex text, registration_origin text,
  registered_at timestamptz, ascent_count bigint, last_ascent_at timestamptz,
  latest_visit_id uuid, latest_visit_status text, latest_member_status text
) language plpgsql stable security definer set search_path = '' as $$
declare normalized_search text := nullif(pg_catalog.btrim(p_search), '');
begin
  if not(public.has_staff_permission('can_view_visitors') or public.has_staff_permission('can_register_walk_in_visitors') or public.has_staff_permission('can_manage_visits')) then
    raise exception using errcode='42501', message='Visitor access is required.';
  end if;
  return query
  select profile.id, pg_catalog.concat_ws(' ',profile.first_name,profile.last_name),
    profile.nationality_country_code, profile.department_code, profile.sex,
    profile.registration_origin, coalesce(profile.registered_at,profile.created_at),
    (select count(*) from public.visit_members member where member.user_id=profile.id),
    latest.visit_date, latest.visit_id, latest.visit_status, latest.member_status
  from public.profiles profile
  left join lateral (
    select member.visit_id, public.visit_operational_status(visit.id) visit_status,
      member.member_status::text member_status,
      coalesce(visit.started_at,visit.planned_start_at,visit.created_at) visit_date
    from public.visit_members member join public.visits visit on visit.id=member.visit_id
    where member.user_id=profile.id
    order by coalesce(visit.started_at,visit.planned_start_at,visit.created_at) desc limit 1
  ) latest on true
  where nullif(profile.first_name,'') is not null and nullif(profile.last_name,'') is not null
    and (normalized_search is null or pg_catalog.concat_ws(' ',profile.first_name,profile.last_name) ilike '%'||normalized_search||'%')
  order by coalesce(latest.visit_date,profile.registered_at,profile.created_at) desc
  limit least(coalesce(p_limit,200),250);
end;
$$;
revoke all on function public.staff_list_visitor_directory(text, integer) from public, anon, authenticated;
grant execute on function public.staff_list_visitor_directory(text, integer) to authenticated;

create function public.get_operational_dashboard()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if not public.has_staff_permission('can_view_visitors') then
    raise exception using errcode='42501', message='Visitor access is required.';
  end if;
  select jsonb_build_object(
    'people_on_route', (
      select count(*) from public.visit_members member join public.visits visit on visit.id=member.visit_id
      where visit.status='in_progress' and member.member_status in('active','returning_early')
    ) + (
      select count(*) from public.visit_minors minor
      join public.visits visit on visit.id=minor.visit_id
      join public.visit_members responsible on responsible.visit_id=minor.visit_id and responsible.user_id=minor.responsible_member_id
      where visit.status='in_progress' and responsible.member_status in('active','returning_early')
    ),
    'adults_on_route', (select count(*) from public.visit_members member join public.visits visit on visit.id=member.visit_id where visit.status='in_progress' and member.member_status in('active','returning_early')),
    'minors_on_route', (select count(*) from public.visit_minors minor join public.visits visit on visit.id=minor.visit_id join public.visit_members responsible on responsible.visit_id=minor.visit_id and responsible.user_id=minor.responsible_member_id where visit.status='in_progress' and responsible.member_status in('active','returning_early')),
    'active_ascents', (select count(*) from public.visits where status='in_progress'),
    'pending_return_ascents', (select count(*) from public.visits visit where public.visit_operational_status(visit.id)='pending_returns'),
    'overdue_ascents', (select count(*) from public.visits where status='in_progress' and expected_return_at<pg_catalog.now()),
    'planned_today', (select count(*) from public.visits where status='forming' and planned_start_at::date=current_date),
    'attention', coalesce((select jsonb_agg(jsonb_build_object(
      'visit_id',visit.id,'join_code',visit.join_code,'expected_return_at',visit.expected_return_at,
      'minutes_late',greatest(0,floor(extract(epoch from(pg_catalog.now()-visit.expected_return_at))/60)::integer),
      'pending_people',(select count(*) from public.visit_members member where member.visit_id=visit.id and member.member_status in('active','returning_early'))
        +(select count(*) from public.visit_minors minor join public.visit_members responsible on responsible.visit_id=minor.visit_id and responsible.user_id=minor.responsible_member_id where minor.visit_id=visit.id and responsible.member_status in('active','returning_early'))
    ) order by visit.expected_return_at) from public.visits visit where visit.status='in_progress' and visit.expected_return_at<pg_catalog.now()),'[]'::jsonb)
  ) into result;
  return result;
end;
$$;
revoke all on function public.get_operational_dashboard() from public, anon, authenticated;
grant execute on function public.get_operational_dashboard() to authenticated;

drop policy if exists route_media_select_active_for_active_routes on public.route_media;
create policy route_media_select_active_or_staff
on public.route_media for select to authenticated
using (
  public.has_staff_permission('can_manage_gallery')
  or (is_active and exists(select 1 from public.routes route where route.id=route_media.route_id and route.is_active))
);

drop function if exists public.admin_list_staff();
create function public.admin_list_staff()
returns table(user_id uuid,full_name text,email text,role text,is_active boolean,invitation_status text,updated_at timestamptz)
language plpgsql stable security definer set search_path='' as $$
begin
  if not public.is_admin() then raise exception using errcode='42501',message='Administrator access is required.'; end if;
  return query select role.user_id,pg_catalog.concat_ws(' ',profile.first_name,profile.last_name),auth_user.email::text,
    role.role::text,case when role.role='admin' then true else coalesce(permission.is_active,false) end,
    case when role.role='admin' then 'active' else coalesce(permission.invitation_status,'inactive') end,
    coalesce(permission.updated_at,profile.updated_at,role.created_at)
  from public.user_roles role join auth.users auth_user on auth_user.id=role.user_id
  left join public.profiles profile on profile.id=role.user_id
  left join public.staff_permissions permission on permission.user_id=role.user_id
  where role.role in('admin','visitor_manager') order by role.role::text,full_name;
end;
$$;
revoke all on function public.admin_list_staff() from public,anon,authenticated;
grant execute on function public.admin_list_staff() to authenticated;

create function public.admin_update_staff_permissions_v2(p_user_id uuid,p_permissions jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare result jsonb;
begin
  if not public.is_admin() then raise exception using errcode='42501',message='Administrator access is required.'; end if;
  if not exists(select 1 from public.user_roles where user_id=p_user_id and role='visitor_manager') then raise exception using errcode='P0002',message='Visitor manager was not found.'; end if;
  insert into public.staff_permissions(user_id) values(p_user_id) on conflict(user_id) do nothing;
  update public.staff_permissions as permission set
    can_view_visitors=coalesce((p_permissions->>'can_view_visitors')::boolean,permission.can_view_visitors),
    can_register_walk_in_visitors=coalesce((p_permissions->>'can_register_walk_in_visitors')::boolean,permission.can_register_walk_in_visitors),
    can_manage_visits=coalesce((p_permissions->>'can_manage_visits')::boolean,permission.can_manage_visits),
    can_confirm_returns=coalesce((p_permissions->>'can_confirm_returns')::boolean,permission.can_confirm_returns),
    can_manage_notifications=coalesce((p_permissions->>'can_manage_notifications')::boolean,permission.can_manage_notifications),
    can_manage_gallery=coalesce((p_permissions->>'can_manage_gallery')::boolean,permission.can_manage_gallery),
    can_view_identity_documents=coalesce((p_permissions->>'can_view_identity_documents')::boolean,permission.can_view_identity_documents),
    can_view_emergency_contacts=coalesce((p_permissions->>'can_view_emergency_contacts')::boolean,permission.can_view_emergency_contacts)
  where permission.user_id=p_user_id returning to_jsonb(permission)-'created_at' into result;
  insert into public.audit_logs(actor_user_id,action,target_type,target_id,metadata)
  values(auth.uid(),'staff_permissions_changed','staff_user',p_user_id::text,jsonb_build_object('permissions',p_permissions));
  return result;
end;
$$;
revoke all on function public.admin_update_staff_permissions_v2(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.admin_update_staff_permissions_v2(uuid,jsonb) to authenticated;
