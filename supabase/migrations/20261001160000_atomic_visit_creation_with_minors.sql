create function public.create_group_visit_with_minors(
  p_visit_type public.visit_type,p_planned_start_at timestamptz,p_expected_return_at timestamptz,
  p_has_local_guide boolean,p_guide_name text,p_terms_accepted boolean,
  p_recommendations_accepted boolean,p_start_mode text,p_minors jsonb default '[]'::jsonb
) returns table(visit_id uuid,join_code text)
language plpgsql volatile security definer set search_path='' as $$
declare created_visit_id uuid; created_join_code text;
begin
  select created.visit_id,created.join_code into created_visit_id,created_join_code
  from public.create_group_visit(p_visit_type,p_planned_start_at,p_expected_return_at,p_has_local_guide,p_guide_name,p_terms_accepted,p_recommendations_accepted,p_start_mode) created;
  if jsonb_array_length(coalesce(p_minors,'[]'::jsonb))>0 then perform public.add_my_visit_minors(created_visit_id,p_minors); end if;
  return query select created_visit_id,created_join_code;
end; $$;
revoke all on function public.create_group_visit_with_minors(public.visit_type,timestamptz,timestamptz,boolean,text,boolean,boolean,text,jsonb) from public,anon,authenticated;
grant execute on function public.create_group_visit_with_minors(public.visit_type,timestamptz,timestamptz,boolean,text,boolean,boolean,text,jsonb) to authenticated;
