alter function public.staff_generate_visitor_report(timestamptz,timestamptz,text)
rename to staff_generate_visitor_report_with_minors;

create function public.staff_generate_visitor_report(
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
  return payload||jsonb_build_object('department_breakdown',departments);
end;
$$;
revoke all on function public.staff_generate_visitor_report_with_minors(timestamptz,timestamptz,text) from public,anon,authenticated;
revoke all on function public.staff_generate_visitor_report(timestamptz,timestamptz,text) from public,anon,authenticated;
grant execute on function public.staff_generate_visitor_report(timestamptz,timestamptz,text) to authenticated;
