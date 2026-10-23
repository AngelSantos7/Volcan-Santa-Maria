-- Retain the existing administrative reason while adding weather.
alter table public.visit_members drop constraint visit_members_exit_reason_allowed;
alter table public.visit_members add constraint visit_members_exit_reason_allowed check (
  exit_reason is null or exit_reason in ('physical_discomfort','injury','emergency','weather','personal_decision','other','administrative_return')
);






create or replace function public.confirm_my_early_checkout(
  p_visit_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  affected_rows integer;
begin
  if current_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'Authentication is required.';
  end if;

  perform 1 from public.visits where id=p_visit_id for update;
  update public.visit_members as member
  set
    member_status = 'returned_early'::public.visit_member_status,
    checked_out_at = pg_catalog.clock_timestamp(),
    checkout_method = 'self',
    checked_out_by = null
  where member.visit_id = p_visit_id
    and member.user_id = current_user_id
    and member.member_status = 'returning_early'::public.visit_member_status;

  get diagnostics affected_rows = row_count;
  if affected_rows <> 1 then
    raise exception using
      errcode = '42501',
      message = 'Only the returning participant can confirm their checkout.';
  end if;

  if not exists(select 1 from public.visit_members where visit_id=p_visit_id and member_status in ('active','returning_early')) then
    update public.visits set status='completed',completed_at=clock_timestamp() where id=p_visit_id and status='in_progress';
  end if;
  return current_user_id;
end;
$$;

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
        'route_id',historical_visit.route_id,
        'route_name',(select name_es from public.routes where id=historical_visit.route_id),
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

create or replace function public.staff_generate_visitor_report(
  p_from timestamptz,p_to timestamptz,p_report_type text
) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare payload jsonb; departments jsonb;
begin
  payload:=public.staff_generate_visitor_report_with_minors(p_from,p_to,p_report_type);
  select coalesce(jsonb_agg(jsonb_build_object(
    'department_code',breakdown.department_code,'visitors',breakdown.visitors
  ) order by breakdown.visitors desc,breakdown.department_code),'[]'::jsonb)
  into departments from (
    select profile.department_code,count(*)::integer visitors
    from public.visit_members member
    join public.visits visit on visit.id=member.visit_id
    join public.profiles profile on profile.id=member.user_id
    where profile.nationality_country_code='GT' and profile.department_code is not null
      and member.member_status<>'withdrawn_before_start'
      and coalesce(visit.started_at,visit.planned_start_at,visit.created_at)>=p_from
      and coalesce(visit.started_at,visit.planned_start_at,visit.created_at)<p_to
    group by profile.department_code
  ) breakdown;
  payload := jsonb_set(payload,'{rows}',(
    select coalesce(jsonb_agg(item || jsonb_build_object('route_name',r.name_es,'route_id',v.route_id) order by ordinal),'[]'::jsonb)
    from jsonb_array_elements(coalesce(payload->'rows','[]'::jsonb)) with ordinality as rows(item,ordinal)
    left join public.visits v on v.join_code=item->>'join_code'
    left join public.routes r on r.id=v.route_id
  ));
  return payload||jsonb_build_object('department_breakdown',departments,'route_breakdown',(
    select coalesce(jsonb_agg(jsonb_build_object('route_id',r.id,'route_name',r.name_es,
      'ascents',(select count(*) from public.visits v where v.route_id=r.id
        and coalesce(v.started_at,v.planned_start_at,v.created_at)>=p_from
        and coalesce(v.started_at,v.planned_start_at,v.created_at)<p_to))), '[]'::jsonb)
    from public.routes r
  ));
end;
$$;