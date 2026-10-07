create or replace function public.admin_list_audit_logs(
  p_from timestamptz default null,p_to timestamptz default null,
  p_action text default null,p_actor_search text default null,p_limit integer default 100
) returns table(
  id bigint,created_at timestamptz,actor_user_id uuid,actor_name text,
  actor_email text,action text,target_type text,target_id text,metadata jsonb
) language plpgsql stable security definer set search_path='' as $$
begin
  if not public.is_admin() then
    raise exception using errcode='42501',message='Administrator access is required.';
  end if;
  if p_limit is null or p_limit<1 or p_limit>250 then
    raise exception using errcode='22023',message='Invalid page size.';
  end if;
  return query select audit.id,audit.created_at,audit.actor_user_id,
    concat_ws(' ',actor_profile.first_name,actor_profile.last_name),actor_auth.email::text,
    audit.action,audit.target_type,audit.target_id,
    audit.metadata||jsonb_strip_nulls(jsonb_build_object(
      'target_name',nullif(concat_ws(' ',target_profile.first_name,target_profile.last_name),''),
      'join_code',target_visit.join_code
    ))
  from public.audit_logs audit
  left join auth.users actor_auth on actor_auth.id=audit.actor_user_id
  left join public.profiles actor_profile on actor_profile.id=audit.actor_user_id
  left join public.profiles target_profile on target_profile.id::text=audit.target_id
  left join public.visits target_visit on target_visit.id::text=audit.target_id
  where (p_from is null or audit.created_at>=p_from)
    and (p_to is null or audit.created_at<p_to)
    and (nullif(p_action,'') is null or audit.action=p_action)
    and (nullif(btrim(p_actor_search),'') is null
      or concat_ws(' ',actor_profile.first_name,actor_profile.last_name) ilike '%'||btrim(p_actor_search)||'%'
      or actor_auth.email ilike '%'||btrim(p_actor_search)||'%')
  order by audit.created_at desc,audit.id desc limit p_limit;
end;
$$;
revoke all on function public.admin_list_audit_logs(timestamptz,timestamptz,text,text,integer) from public,anon,authenticated;
grant execute on function public.admin_list_audit_logs(timestamptz,timestamptz,text,text,integer) to authenticated;
