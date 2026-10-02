alter function public.get_visitor_dashboard_stats(timestamptz,timestamptz) rename to get_visitor_dashboard_stats_phase3;
create function public.get_visitor_dashboard_stats(p_from timestamptz,p_to timestamptz)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare base jsonb; adult_count bigint; minor_count bigint; minors_on_route bigint; minor_exits bigint;
begin
  base:=public.get_visitor_dashboard_stats_phase3(p_from,p_to);
  select count(*) into adult_count from public.visit_members m join public.visits v on v.id=m.visit_id where v.status<>'cancelled' and m.member_status<>'withdrawn_before_start' and coalesce(v.started_at,v.planned_start_at,v.created_at)>=p_from and coalesce(v.started_at,v.planned_start_at,v.created_at)<p_to;
  select count(*) into minor_count from public.visit_minors minor join public.visits v on v.id=minor.visit_id where v.status<>'cancelled' and coalesce(v.started_at,v.planned_start_at,v.created_at)>=p_from and coalesce(v.started_at,v.planned_start_at,v.created_at)<p_to;
  select count(*) into minors_on_route from public.visit_minors minor join public.visit_members responsible on responsible.visit_id=minor.visit_id and responsible.user_id=minor.responsible_member_id join public.visits v on v.id=minor.visit_id where v.status='in_progress' and v.started_at is not null and responsible.member_status in('active','returning_early');
  select count(*) into minor_exits from public.visit_minors minor join public.visit_members responsible on responsible.visit_id=minor.visit_id and responsible.user_id=minor.responsible_member_id join public.visits v on v.id=minor.visit_id where coalesce(responsible.checked_out_at,v.completed_at)>=p_from and coalesce(responsible.checked_out_at,v.completed_at)<p_to and responsible.member_status in('completed','returned_early');
  return base||jsonb_build_object('adults_count',adult_count,'minors_count',minor_count,'total_visitors',adult_count+minor_count,'entries_registered',(base->>'entries_registered')::bigint+minor_count,'exits_registered',(base->>'exits_registered')::bigint+minor_exits,'currently_on_route',(base->>'currently_on_route')::bigint+minors_on_route);
end; $$;
revoke all on function public.get_visitor_dashboard_stats_phase3(timestamptz,timestamptz) from public,anon,authenticated;
revoke all on function public.get_visitor_dashboard_stats(timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.get_visitor_dashboard_stats(timestamptz,timestamptz) to authenticated;

alter function public.get_visitor_dashboard_series(timestamptz,timestamptz) rename to get_visitor_dashboard_series_phase3;
create function public.get_visitor_dashboard_series(p_from timestamptz,p_to timestamptz)
returns table(report_date date,visitors bigint,ascents bigint,exits bigint,early_returns bigint)
language sql stable security definer set search_path='' as $$
  select base.report_date,base.visitors+(select count(*) from public.visit_minors minor join public.visits v on v.id=minor.visit_id where (coalesce(v.started_at,v.planned_start_at,v.created_at) at time zone 'America/Guatemala')::date=base.report_date and v.status<>'cancelled'),base.ascents,base.exits+(select count(*) from public.visit_minors minor join public.visit_members responsible on responsible.visit_id=minor.visit_id and responsible.user_id=minor.responsible_member_id join public.visits v on v.id=minor.visit_id where (coalesce(responsible.checked_out_at,v.completed_at) at time zone 'America/Guatemala')::date=base.report_date and responsible.member_status in('completed','returned_early')),base.early_returns
  from public.get_visitor_dashboard_series_phase3(p_from,p_to) base;
$$;
revoke all on function public.get_visitor_dashboard_series_phase3(timestamptz,timestamptz) from public,anon,authenticated;
revoke all on function public.get_visitor_dashboard_series(timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.get_visitor_dashboard_series(timestamptz,timestamptz) to authenticated;

alter function public.staff_generate_visitor_report(timestamptz,timestamptz,text) rename to staff_generate_visitor_report_phase3;
create function public.staff_generate_visitor_report(p_from timestamptz,p_to timestamptz,p_report_type text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare payload jsonb; stats jsonb; minor_rows jsonb;
begin
  payload:=public.staff_generate_visitor_report_phase3(p_from,p_to,p_report_type); stats:=public.get_visitor_dashboard_stats(p_from,p_to);
  if p_report_type='detailed' then
    select coalesce(jsonb_agg(jsonb_build_object('event_date',coalesce(v.started_at,v.planned_start_at,v.created_at),'visitor_name',minor.full_name,'nationality_country_code',null,'join_code',v.join_code,'ascent_type',v.visit_type::text,'started_at',v.started_at,'expected_return_at',v.expected_return_at,'checked_out_at',coalesce(responsible.checked_out_at,case when responsible.member_status='completed' then v.completed_at end),'duration_minutes',case when v.started_at is not null and coalesce(responsible.checked_out_at,v.completed_at) is not null then floor(extract(epoch from(coalesce(responsible.checked_out_at,v.completed_at)-v.started_at))/60)::integer end,'operational_status','minor_'||responsible.member_status::text,'creation_origin',v.creation_origin,'completion_method',case when responsible.checkout_method='staff' then 'administrative' when responsible.member_status in('completed','returned_early') then 'normal' else 'pending' end)),'[]'::jsonb) into minor_rows from public.visit_minors minor join public.visits v on v.id=minor.visit_id join public.visit_members responsible on responsible.visit_id=minor.visit_id and responsible.user_id=minor.responsible_member_id where (coalesce(v.started_at,v.planned_start_at,v.created_at)>=p_from and coalesce(v.started_at,v.planned_start_at,v.created_at)<p_to) or (coalesce(responsible.checked_out_at,v.completed_at)>=p_from and coalesce(responsible.checked_out_at,v.completed_at)<p_to);
    payload:=jsonb_set(payload,'{rows}',coalesce(payload->'rows','[]'::jsonb)||minor_rows);
  end if;
  return jsonb_set(payload,'{summary}',coalesce(payload->'summary','{}'::jsonb)||jsonb_build_object('adults_count',stats->'adults_count','minors_count',stats->'minors_count','total_visitors',stats->'total_visitors','entries_registered',stats->'entries_registered','exits_registered',stats->'exits_registered','currently_on_route',stats->'currently_on_route'));
end; $$;
revoke all on function public.staff_generate_visitor_report_phase3(timestamptz,timestamptz,text) from public,anon,authenticated;
revoke all on function public.staff_generate_visitor_report(timestamptz,timestamptz,text) from public,anon,authenticated;
grant execute on function public.staff_generate_visitor_report(timestamptz,timestamptz,text) to authenticated;
