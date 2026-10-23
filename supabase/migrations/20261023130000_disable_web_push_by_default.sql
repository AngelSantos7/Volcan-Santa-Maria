-- Production preparation: Web Push stays available for a future rollout but
-- subscription registration is disabled unless explicitly enabled server-side.
create table public.runtime_feature_flags (
  feature text primary key,
  enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  constraint runtime_feature_flags_feature_not_blank check (btrim(feature) <> '')
);

alter table public.runtime_feature_flags enable row level security;
revoke all on table public.runtime_feature_flags from public, anon, authenticated;
grant select, update on table public.runtime_feature_flags to service_role;

insert into public.runtime_feature_flags(feature, enabled)
values ('web_push', false);

create or replace function public.register_push_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_user_agent text default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  subscription_id uuid;
  caller_id uuid := auth.uid();
  push_enabled boolean;
begin
  select flag.enabled
  into push_enabled
  from public.runtime_feature_flags as flag
  where flag.feature = 'web_push';

  if coalesce(push_enabled, false) is not true then
    raise exception using errcode = '55000', message = 'Web Push is disabled.';
  end if;
  if caller_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;
  if not public.is_allowed_push_endpoint(p_endpoint)
    or coalesce(length(p_p256dh), 0) not between 1 and 512
    or coalesce(length(p_auth), 0) not between 1 and 512 then
    raise exception using errcode = '22023', message = 'Invalid push subscription.';
  end if;

  insert into public.push_subscriptions as existing(
    user_id,
    endpoint,
    p256dh,
    auth,
    user_agent
  )
  values (
    caller_id,
    p_endpoint,
    p_p256dh,
    p_auth,
    left(p_user_agent, 500)
  )
  on conflict (endpoint) do update
    set p256dh = excluded.p256dh,
        auth = excluded.auth,
        user_agent = excluded.user_agent,
        updated_at = now()
    where existing.user_id = caller_id
  returning id into subscription_id;

  if not found then
    raise exception using errcode = '42501', message = 'Unable to register push subscription.';
  end if;
  return subscription_id;
end;
$$;

revoke all on function public.register_push_subscription(text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.register_push_subscription(text, text, text, text)
  to authenticated;
