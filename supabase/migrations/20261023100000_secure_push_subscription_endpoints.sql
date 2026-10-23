-- SEC-005/006: RPC-only writes, owner-preserving atomic upsert and provider policy.
-- Provider path/query is opaque. Keep this policy aligned with push-endpoint.ts.
create function public.is_allowed_push_endpoint(p_endpoint text)
returns boolean language plpgsql immutable set search_path='' as $$
declare authority text; label text; resource text; path text;
begin
  if p_endpoint is null or length(p_endpoint)>2048 or left(p_endpoint,8)<>'https://'
    or p_endpoint ~ '[^!-~]|[<>"''`{}^|]' or strpos(p_endpoint,chr(92))>0 or strpos(p_endpoint,'#')>0
    or regexp_replace(p_endpoint,'%[0-9a-fA-F]{2}','','g') like '%\%%' escape '\'
    or p_endpoint ~* '%(0[0-9a-f]|1[0-9a-f]|7f|5c)' then return false; end if;
  authority:=split_part(substr(p_endpoint,9),'/',1);
  if length(authority)>253 then return false; end if;
  foreach label in array string_to_array(authority,'.') loop
    if label !~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$' then return false; end if;
  end loop;
  if not (authority in ('fcm.googleapis.com','updates.push.services.mozilla.com')
    or authority like '%.push.apple.com' or authority like '%.notify.windows.com') then return false; end if;
  resource:=substr(p_endpoint,9+length(authority));
  if left(resource,1)<>'/' or length(resource)<=1 then return false; end if;
  path:=split_part(resource,'?',1);
  -- WHATWG URL removes dot segments, including percent-encoded dots. Reject
  -- aliases rather than normalizing a provider's opaque subscription token.
  if path ~* '(^|/)([.]|%2e){1,2}(/|$)' then return false; end if;
  if length(path)<=1 and (strpos(resource,'?')=0
    or length(substr(resource,strpos(resource,'?')+1))=0) then return false; end if;
  return true;
end;
$$;
revoke all on function public.is_allowed_push_endpoint(text) from public,anon,authenticated;
grant execute on function public.is_allowed_push_endpoint(text) to authenticated,service_role;

-- Existing unsafe rows are retained, but never sent by the updated Edge.
-- NOT VALID avoids deleting data or failing deployment on historical rows;
-- PostgreSQL enforces the constraint on every new/updated row immediately.
alter table public.push_subscriptions add constraint push_endpoint_allowed
  check (public.is_allowed_push_endpoint(endpoint)) not valid;
revoke all on table public.push_subscriptions from anon,authenticated;
grant select on table public.push_subscriptions to authenticated;
-- Keep existing RLS enabled and deny-all policies (there are no read policies).
-- Clients use the registration/removal RPCs; service_role remains server-only.

create or replace function public.register_push_subscription(p_endpoint text,p_p256dh text,p_auth text,p_user_agent text default null)
returns uuid language plpgsql volatile security definer set search_path='' as $$
declare subscription_id uuid; caller_id uuid:=auth.uid();
begin
  if caller_id is null then raise exception using errcode='42501',message='Authentication is required.'; end if;
  if not public.is_allowed_push_endpoint(p_endpoint)
    or coalesce(length(p_p256dh),0) not between 1 and 512
    or coalesce(length(p_auth),0) not between 1 and 512 then
    raise exception using errcode='22023',message='Invalid push subscription.';
  end if;
  insert into public.push_subscriptions as existing(user_id,endpoint,p256dh,auth,user_agent)
  values(caller_id,p_endpoint,p_p256dh,p_auth,left(p_user_agent,500))
  on conflict(endpoint) do update set p256dh=excluded.p256dh,auth=excluded.auth,
    user_agent=excluded.user_agent,updated_at=now()
    where existing.user_id=caller_id
  returning id into subscription_id;
  if not found then
    raise exception using errcode='42501',message='Unable to register push subscription.';
  end if;
  return subscription_id;
end;
$$;
revoke all on function public.register_push_subscription(text,text,text,text) from public,anon,authenticated;
grant execute on function public.register_push_subscription(text,text,text,text) to authenticated;
