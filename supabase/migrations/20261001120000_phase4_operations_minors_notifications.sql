-- Phase 4: operational consistency, accompanying minors and notifications.

alter table public.profiles add column if not exists sex text;
alter table public.profiles drop constraint if exists profiles_sex_valid;
alter table public.profiles add constraint profiles_sex_valid
  check (sex is null or sex in ('male', 'female'));

create or replace function public.staff_set_visitor_sex(p_user_id uuid,p_sex text)
returns void language plpgsql volatile security definer set search_path='' as $$
begin
  if auth.uid() is null or not public.has_staff_permission('can_register_walk_in_visitors') then raise exception using errcode='42501',message='Walk-in registration permission is required.'; end if;
  if p_sex not in ('male','female') then raise exception using errcode='22023',message='Invalid sex value.'; end if;
  update public.profiles set sex=p_sex where id=p_user_id and registration_origin='administrative';
  if not found then raise exception using errcode='P0002',message='Administrative visitor was not found.'; end if;
end; $$;
revoke all on function public.staff_set_visitor_sex(uuid,text) from public,anon,authenticated;
grant execute on function public.staff_set_visitor_sex(uuid,text) to authenticated;

create table public.visit_minors (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid not null references public.visits(id) on delete cascade,
  responsible_member_id uuid not null,
  full_name text not null check (char_length(btrim(full_name)) between 2 and 160),
  age smallint not null check (age >= 0 and age < 18),
  sex text not null check (sex in ('male', 'female')),
  relationship text not null check (char_length(btrim(relationship)) between 2 and 80),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint visit_minors_responsible_member_fk
    foreign key (visit_id, responsible_member_id)
    references public.visit_members(visit_id, user_id)
);

create index visit_minors_visit_id_idx on public.visit_minors(visit_id);
create index visit_minors_responsible_idx on public.visit_minors(visit_id, responsible_member_id);
alter table public.visit_minors enable row level security;

create policy "visit participants can read minors"
on public.visit_minors for select to authenticated
using (exists (
  select 1 from public.visit_members member
  where member.visit_id = visit_minors.visit_id and member.user_id = auth.uid()
));

create or replace function public.add_my_visit_minors(p_visit_id uuid, p_minors jsonb)
returns setof public.visit_minors
language plpgsql volatile security definer set search_path = '' as $$
declare
  current_user_id uuid := auth.uid();
  visit_status public.visit_status;
  minor jsonb;
begin
  if current_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;
  select visit.status into visit_status from public.visits visit
  where visit.id = p_visit_id for update;
  if visit_status is null then
    raise exception using errcode = '42501', message = 'Only the visit organizer can add accompanying minors.';
  end if;
  if visit_status <> 'forming' then
    raise exception using errcode = 'P0001', message = 'Minors can be changed only before the ascent starts.';
  end if;
  if not exists (select 1 from public.visit_members member where member.visit_id = p_visit_id and member.user_id = current_user_id and member.member_role = 'leader') then
    raise exception using errcode = '42501', message = 'A minor requires the organizer as a responsible adult.';
  end if;
  if not exists (select 1 from public.profiles profile where profile.id=current_user_id and profile.date_of_birth <= current_date - interval '18 years') then
    raise exception using errcode='23514',message='The responsible participant must be an adult.';
  end if;
  if jsonb_typeof(coalesce(p_minors, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_minors, '[]'::jsonb)) > 12 then
    raise exception using errcode = '22023', message = 'Invalid accompanying minors payload.';
  end if;
  for minor in select value from jsonb_array_elements(coalesce(p_minors, '[]'::jsonb)) loop
    if nullif(btrim(minor->>'full_name'), '') is null
      or (minor->>'age')::integer not between 0 and 17
      or minor->>'sex' not in ('male', 'female')
      or nullif(btrim(minor->>'relationship'), '') is null then
      raise exception using errcode = '22023', message = 'Each minor requires name, age, sex and relationship.';
    end if;
    insert into public.visit_minors(visit_id, responsible_member_id, full_name, age, sex, relationship, created_by)
    values (p_visit_id, current_user_id, btrim(minor->>'full_name'), (minor->>'age')::smallint, minor->>'sex', btrim(minor->>'relationship'), current_user_id);
  end loop;
  return query select * from public.visit_minors where visit_id = p_visit_id order by created_at;
end; $$;
revoke all on function public.add_my_visit_minors(uuid,jsonb) from public, anon, authenticated;
grant execute on function public.add_my_visit_minors(uuid,jsonb) to authenticated;

-- Prevent an adult with associated minors from being removed without reassignment.
create or replace function public.protect_minor_responsible_member()
returns trigger language plpgsql set search_path = '' as $$
begin
  if exists (select 1 from public.visit_minors minor where minor.visit_id = old.visit_id and minor.responsible_member_id = old.user_id) then
    raise exception using errcode = '23503', message = 'Reassign or remove the accompanying minors before removing their responsible adult.';
  end if;
  return old;
end; $$;
create trigger protect_minor_responsible_member_before_delete
before delete on public.visit_members for each row execute function public.protect_minor_responsible_member();

drop function public.staff_get_ascent_members(uuid);
create function public.staff_get_ascent_members(p_visit_id uuid)
returns table(visit_id uuid,user_id uuid,visitor_name text,member_role text,member_status text,checked_out_at timestamptz,finalized_by_administration boolean,is_minor boolean,responsible_name text)
language plpgsql stable security definer set search_path='' as $$
begin
  if not(public.has_staff_permission('can_view_visitors') or public.has_staff_permission('can_manage_visits') or public.has_staff_permission('can_confirm_returns')) then raise exception using errcode='42501',message='Visit access is required.'; end if;
  return query
  select m.visit_id,m.user_id,concat_ws(' ',p.first_name,p.last_name),m.member_role::text,m.member_status::text,m.checked_out_at,m.checkout_method='staff',false,null::text
  from public.visit_members m join public.profiles p on p.id=m.user_id where m.visit_id=p_visit_id
  union all
  select minor.visit_id,minor.id,minor.full_name,'member',responsible.member_status::text,responsible.checked_out_at,responsible.checkout_method='staff',true,concat_ws(' ',profile.first_name,profile.last_name)
  from public.visit_minors minor join public.visit_members responsible on responsible.visit_id=minor.visit_id and responsible.user_id=minor.responsible_member_id join public.profiles profile on profile.id=responsible.user_id where minor.visit_id=p_visit_id
  order by is_minor,visitor_name;
end; $$;
revoke all on function public.staff_get_ascent_members(uuid) from public,anon,authenticated;
grant execute on function public.staff_get_ascent_members(uuid) to authenticated;

create or replace function public.staff_list_ascents(p_status text default 'all',p_limit integer default 100)
returns table(visit_id uuid,join_code text,organizer_name text,visit_type text,participant_count bigint,planned_start_at timestamptz,started_at timestamptz,expected_return_at timestamptz,completed_at timestamptz,visit_status text,creation_origin text,finalized_by_administration boolean)
language plpgsql stable security definer set search_path='' as $$
begin
  if not(public.has_staff_permission('can_view_visitors') or public.has_staff_permission('can_manage_visits')) then raise exception using errcode='42501',message='Visit access is required.'; end if;
  if p_limit is null or p_limit<1 or p_limit>250 then raise exception using errcode='22023',message='Invalid page size.'; end if;
  return query select v.id,v.join_code,concat_ws(' ',op.first_name,op.last_name),v.visit_type::text,
    count(m.user_id) filter(where m.member_status<>'withdrawn_before_start')+(select count(*) from public.visit_minors minor where minor.visit_id=v.id),
    v.planned_start_at,v.started_at,v.expected_return_at,v.completed_at,v.status::text,v.creation_origin,coalesce(bool_or(m.checkout_method='staff'),false)
  from public.visits v join public.visit_members organizer on organizer.visit_id=v.id and organizer.member_role='leader' join public.profiles op on op.id=organizer.user_id left join public.visit_members m on m.visit_id=v.id
  where p_status='all' or (p_status='scheduled' and v.status='forming') or (p_status='in_progress' and v.status='in_progress' and v.started_at is not null) or (p_status='completed' and v.status='completed') or (p_status='cancelled' and v.status='cancelled')
  group by v.id,op.first_name,op.last_name
  order by case when v.status='in_progress' and v.expected_return_at<now() then 0 when v.status='in_progress' then 1 when v.status='forming' and v.start_mode='now' then 3 when v.status='forming' and v.planned_start_at::date=current_date then 4 when v.status='forming' then 5 when v.status='completed' then 6 else 7 end,
    case when v.status='in_progress' then v.expected_return_at when v.status='forming' then v.planned_start_at else v.completed_at end asc nulls last limit p_limit;
end; $$;

-- Keep one unambiguous administrative-return contract. It is idempotent for an
-- already-finalized participant and serializes concurrent attempts.
drop function if exists public.staff_register_administrative_group_return_v2(uuid,text,text,timestamptz,text);
drop function if exists public.staff_register_administrative_return_v2(uuid,uuid,text,text,timestamptz,text);
drop function if exists public.staff_register_administrative_group_return(uuid,text,text,timestamptz);
drop function if exists public.staff_register_administrative_return(uuid,uuid,text,text,timestamptz);

create function public.staff_register_administrative_return(
  p_visit_id uuid,
  p_user_id uuid,
  p_reason text,
  p_notes text default null,
  p_effective_return_at timestamptz default null,
  p_reason_detail text default null
) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  current_user_id uuid := auth.uid();
  request_time timestamptz := clock_timestamp();
  effective_time timestamptz := coalesce(p_effective_return_at, clock_timestamp());
  normalized_reason text := lower(btrim(p_reason));
  normalized_notes text := nullif(btrim(p_notes), '');
  normalized_detail text := nullif(btrim(p_reason_detail), '');
  previous_status public.visit_member_status;
  current_visit_status public.visit_status;
  group_completed boolean := false;
begin
  if current_user_id is null or not public.has_staff_permission('can_confirm_returns') then
    raise exception using errcode = '42501', message = 'Return confirmation permission is required.';
  end if;
  if normalized_reason not in ('confirmed_in_person','phone_battery','no_connection','forgot_to_finish','early_return','other')
    or (normalized_reason = 'other' and normalized_detail is null)
    or char_length(coalesce(normalized_detail,'')) > 200
    or char_length(coalesce(normalized_notes,'')) > 1000
    or effective_time > request_time + interval '5 minutes' then
    raise exception using errcode = '22023', message = 'Invalid administrative return information.';
  end if;
  select member.member_status, visit.status into previous_status, current_visit_status
  from public.visit_members member join public.visits visit on visit.id = member.visit_id
  where member.visit_id = p_visit_id and member.user_id = p_user_id
  for update of member, visit;
  if previous_status is null then
    raise exception using errcode = 'P0002', message = 'Visit membership was not found.';
  end if;
  if previous_status in ('completed','returned_early') then
    return jsonb_build_object('visit_id',p_visit_id,'visitor_id',p_user_id,'already_confirmed',true,'group_completed',current_visit_status='completed');
  end if;
  if current_visit_status <> 'in_progress' or previous_status not in ('active','returning_early') then
    raise exception using errcode = 'P0001', message = 'This participant is not awaiting a return confirmation.';
  end if;
  update public.visit_members set
    member_status = case when previous_status='returning_early' or normalized_reason='early_return' then 'returned_early'::public.visit_member_status else 'completed'::public.visit_member_status end,
    return_started_at = case when previous_status='returning_early' then return_started_at when normalized_reason='early_return' then effective_time else null end,
    exit_reason = case when previous_status='returning_early' then exit_reason when normalized_reason='early_return' then 'administrative_return' else null end,
    checked_out_at = effective_time, checkout_method = 'staff', checked_out_by = current_user_id,
    administrative_return_reason = normalized_reason, administrative_return_reason_detail = normalized_detail,
    administrative_return_notes = normalized_notes, administrative_return_recorded_at = request_time,
    administrative_return_retrospective = effective_time < request_time - interval '1 minute'
  where visit_id = p_visit_id and user_id = p_user_id;
  if not exists (select 1 from public.visit_members where visit_id=p_visit_id and member_status in ('active','returning_early')) then
    update public.visits set status='completed', completed_at=request_time where id=p_visit_id and status='in_progress';
    group_completed := found;
  end if;
  insert into public.audit_logs(actor_user_id,action,target_type,target_id,metadata)
  values(current_user_id,'administrative_individual_return_recorded','visitor',p_user_id::text,
    jsonb_strip_nulls(jsonb_build_object('visit_id',p_visit_id,'reason',normalized_reason,'reason_detail',normalized_detail,'effective_return_at',effective_time,'minors_follow_responsible',true)));
  return jsonb_build_object('visit_id',p_visit_id,'visitor_id',p_user_id,'effective_return_at',effective_time,'group_completed',group_completed,'already_confirmed',false);
end; $$;

create function public.staff_register_administrative_group_return(
  p_visit_id uuid, p_reason text, p_notes text default null,
  p_effective_return_at timestamptz default null, p_reason_detail text default null
) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare member_record record; returned_count integer := 0;
begin
  if auth.uid() is null or not public.has_staff_permission('can_confirm_returns') then
    raise exception using errcode='42501', message='Return confirmation permission is required.';
  end if;
  perform 1 from public.visits where id=p_visit_id and status='in_progress' for update;
  for member_record in select user_id from public.visit_members where visit_id=p_visit_id and member_status in ('active','returning_early') order by joined_at loop
    perform public.staff_register_administrative_return(p_visit_id,member_record.user_id,p_reason,p_notes,p_effective_return_at,p_reason_detail);
    returned_count := returned_count + 1;
  end loop;
  if returned_count > 0 then
    insert into public.audit_logs(actor_user_id,action,target_type,target_id,metadata)
    values(auth.uid(),'administrative_group_return_recorded','visit',p_visit_id::text,jsonb_build_object('participant_count',returned_count,'reason',p_reason));
  end if;
  return jsonb_build_object('visit_id',p_visit_id,'participant_count',returned_count,'already_confirmed',returned_count=0);
end; $$;
revoke all on function public.staff_register_administrative_return(uuid,uuid,text,text,timestamptz,text) from public,anon,authenticated;
revoke all on function public.staff_register_administrative_group_return(uuid,text,text,timestamptz,text) from public,anon,authenticated;
grant execute on function public.staff_register_administrative_return(uuid,uuid,text,text,timestamptz,text) to authenticated;
grant execute on function public.staff_register_administrative_group_return(uuid,text,text,timestamptz,text) to authenticated;

alter table public.staff_permissions add column if not exists can_manage_notifications boolean not null default false;

create type public.notification_priority as enum ('info','caution','urgent');
create type public.notification_status as enum ('draft','scheduled','published','expired','cancelled');
create type public.notification_audience as enum ('all_users','in_progress','planned','specific_visit','specific_user');

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  title_es text not null check (char_length(btrim(title_es)) between 1 and 120),
  body_es text not null check (char_length(btrim(body_es)) between 1 and 2000),
  title_en text check (title_en is null or char_length(btrim(title_en)) between 1 and 120),
  body_en text check (body_en is null or char_length(btrim(body_en)) between 1 and 2000),
  priority public.notification_priority not null default 'info',
  status public.notification_status not null default 'draft',
  audience public.notification_audience not null,
  audience_visit_id uuid references public.visits(id),
  audience_user_id uuid references auth.users(id),
  image_path text,
  destination_url text not null default '/?view=notifications',
  scheduled_at timestamptz,
  published_at timestamptz,
  expires_at timestamptz,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((audience='specific_visit')=(audience_visit_id is not null)),
  check ((audience='specific_user')=(audience_user_id is not null))
);

create table public.notification_recipients (
  notification_id uuid not null references public.notifications(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  read_at timestamptz,
  dismissed_at timestamptz,
  snoozed_until timestamptz,
  snooze_count smallint not null default 0 check (snooze_count between 0 and 1),
  delivered_at timestamptz,
  primary key(notification_id,user_id)
);

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index notification_recipients_user_idx on public.notification_recipients(user_id,read_at);
create index push_subscriptions_user_idx on public.push_subscriptions(user_id);
alter table public.notifications enable row level security;
alter table public.notification_recipients enable row level security;
alter table public.push_subscriptions enable row level security;

create policy "users read own notification records" on public.notification_recipients
for select to authenticated using (user_id=auth.uid());
create policy "users read addressed notifications" on public.notifications
for select to authenticated using (exists(select 1 from public.notification_recipients recipient where recipient.notification_id=notifications.id and recipient.user_id=auth.uid()));

create or replace function public.has_staff_permission(permission_name text)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare current_user_id uuid:=auth.uid(); user_role public.app_role; permission_allowed boolean:=false;
begin
  if current_user_id is null then return false; end if;
  select role into user_role from public.user_roles where user_id=current_user_id;
  if user_role='admin' then return true; end if;
  if user_role<>'visitor_manager' then return false; end if;
  select case permission_name
    when 'can_view_visitors' then p.can_view_visitors when 'can_view_sensitive_data' then p.can_view_sensitive_data
    when 'can_view_identity_documents' then p.can_view_identity_documents when 'can_manage_visits' then p.can_manage_visits
    when 'can_confirm_returns' then p.can_confirm_returns when 'can_register_walk_in_visitors' then p.can_register_walk_in_visitors
    when 'can_export_reports' then p.can_export_reports when 'can_manage_announcements' then p.can_manage_announcements
    when 'can_manage_notifications' then p.can_manage_notifications when 'can_manage_route' then p.can_manage_route
    when 'can_manage_users' then p.can_manage_users when 'can_manage_staff' then p.can_manage_staff else false end
  into permission_allowed from public.staff_permissions p where p.user_id=current_user_id and p.is_active;
  return coalesce(permission_allowed,false);
end; $$;

create or replace function public.staff_save_notification(p_notification jsonb)
returns uuid language plpgsql volatile security definer set search_path='' as $$
declare current_user_id uuid:=auth.uid(); notification_id uuid; requested_status public.notification_status; target_audience public.notification_audience; action_name text;
begin
  if current_user_id is null or not public.has_staff_permission('can_manage_notifications') then raise exception using errcode='42501',message='Notification management permission is required.'; end if;
  requested_status:=coalesce((p_notification->>'status')::public.notification_status,'draft');
  target_audience:=(p_notification->>'audience')::public.notification_audience;
  if requested_status not in ('draft','scheduled','published') then raise exception using errcode='22023',message='Invalid notification status.'; end if;
  if requested_status='scheduled' and coalesce((p_notification->>'scheduled_at')::timestamptz,now())<=now() then raise exception using errcode='22023',message='Scheduled time must be in the future.'; end if;
  insert into public.notifications(title_es,body_es,title_en,body_en,priority,status,audience,audience_visit_id,audience_user_id,image_path,scheduled_at,published_at,expires_at,created_by)
  values(btrim(p_notification->>'title_es'),btrim(p_notification->>'body_es'),nullif(btrim(p_notification->>'title_en'),''),nullif(btrim(p_notification->>'body_en'),''),
    coalesce((p_notification->>'priority')::public.notification_priority,'info'),requested_status,target_audience,(p_notification->>'audience_visit_id')::uuid,(p_notification->>'audience_user_id')::uuid,
    nullif(p_notification->>'image_path',''),(p_notification->>'scheduled_at')::timestamptz,case when requested_status='published' then now() end,(p_notification->>'expires_at')::timestamptz,current_user_id)
  returning id into notification_id;
  if requested_status='published' then
    insert into public.notification_recipients(notification_id,user_id)
    select notification_id,u.id from auth.users u where
      (target_audience='all_users') or
      (target_audience='specific_user' and u.id=(p_notification->>'audience_user_id')::uuid) or
      (target_audience='specific_visit' and exists(select 1 from public.visit_members m where m.visit_id=(p_notification->>'audience_visit_id')::uuid and m.user_id=u.id)) or
      (target_audience='in_progress' and exists(select 1 from public.visit_members m join public.visits v on v.id=m.visit_id where m.user_id=u.id and v.status='in_progress' and v.started_at is not null and m.member_status in ('active','returning_early'))) or
      (target_audience='planned' and exists(select 1 from public.visit_members m join public.visits v on v.id=m.visit_id where m.user_id=u.id and v.status='forming' and v.start_mode='scheduled' and v.planned_start_at>now() and m.member_status='active'));
  end if;
  action_name:=case requested_status when 'published' then 'notification_published' when 'scheduled' then 'notification_scheduled' else 'notification_created' end;
  insert into public.audit_logs(actor_user_id,action,target_type,target_id,metadata) values(current_user_id,action_name,'notification',notification_id::text,jsonb_build_object('audience',target_audience,'priority',p_notification->>'priority','status',requested_status));
  return notification_id;
end; $$;

create or replace function public.staff_list_notifications()
returns setof public.notifications language sql stable security definer set search_path='' as $$
  select n.* from public.notifications n where public.has_staff_permission('can_manage_notifications') order by n.created_at desc;
$$;

create or replace function public.get_my_notifications()
returns table(notification_id uuid,title_es text,body_es text,title_en text,body_en text,priority public.notification_priority,image_path text,destination_url text,published_at timestamptz,expires_at timestamptz,read_at timestamptz,dismissed_at timestamptz,snoozed_until timestamptz,snooze_count smallint)
language sql stable security definer set search_path='' as $$
  select n.id,n.title_es,n.body_es,n.title_en,n.body_en,n.priority,n.image_path,n.destination_url,n.published_at,n.expires_at,r.read_at,r.dismissed_at,r.snoozed_until,r.snooze_count
  from public.notification_recipients r join public.notifications n on n.id=r.notification_id
  where r.user_id=auth.uid() and n.status='published' and (n.expires_at is null or n.expires_at>now()) order by n.published_at desc;
$$;

create or replace function public.mark_notification_read(p_notification_id uuid)
returns void language sql volatile security definer set search_path='' as $$
  update public.notification_recipients set read_at=coalesce(read_at,now()),dismissed_at=coalesce(dismissed_at,now()),snoozed_until=null where notification_id=p_notification_id and user_id=auth.uid();
$$;
create or replace function public.snooze_notification(p_notification_id uuid)
returns void language plpgsql volatile security definer set search_path='' as $$
begin
  update public.notification_recipients set snooze_count=snooze_count+1,snoozed_until=now()+interval '2 hours'
  where notification_id=p_notification_id and user_id=auth.uid() and read_at is null and snooze_count=0;
  if not found then raise exception using errcode='P0001',message='This notification cannot be postponed again.'; end if;
end; $$;

create or replace function public.register_push_subscription(p_endpoint text,p_p256dh text,p_auth text,p_user_agent text default null)
returns uuid language plpgsql volatile security definer set search_path='' as $$
declare subscription_id uuid;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='Authentication is required.'; end if;
  if length(p_endpoint)>2048 or length(p_p256dh)>512 or length(p_auth)>512 then raise exception using errcode='22023',message='Invalid push subscription.'; end if;
  insert into public.push_subscriptions(user_id,endpoint,p256dh,auth,user_agent) values(auth.uid(),p_endpoint,p_p256dh,p_auth,left(p_user_agent,500))
  on conflict(endpoint) do update set user_id=auth.uid(),p256dh=excluded.p256dh,auth=excluded.auth,user_agent=excluded.user_agent,updated_at=now()
  returning id into subscription_id; return subscription_id;
end; $$;
create or replace function public.remove_push_subscription(p_endpoint text)
returns void language sql volatile security definer set search_path='' as $$ delete from public.push_subscriptions where endpoint=p_endpoint and user_id=auth.uid(); $$;

revoke all on function public.staff_save_notification(jsonb),public.staff_list_notifications(),public.get_my_notifications(),public.mark_notification_read(uuid),public.snooze_notification(uuid),public.register_push_subscription(text,text,text,text),public.remove_push_subscription(text) from public,anon,authenticated;
grant execute on function public.staff_save_notification(jsonb),public.staff_list_notifications() to authenticated;
grant execute on function public.get_my_notifications(),public.mark_notification_read(uuid),public.snooze_notification(uuid),public.register_push_subscription(text,text,text,text),public.remove_push_subscription(text) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('notification-media','notification-media',false,5242880,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create policy "authorized staff upload notification media" on storage.objects for insert to authenticated
with check(bucket_id='notification-media' and public.has_staff_permission('can_manage_notifications'));
create policy "authorized staff manage notification media" on storage.objects for delete to authenticated
using(bucket_id='notification-media' and public.has_staff_permission('can_manage_notifications'));
create policy "recipients read notification media" on storage.objects for select to authenticated
using(bucket_id='notification-media' and exists(select 1 from public.notifications n join public.notification_recipients r on r.notification_id=n.id where n.image_path=name and r.user_id=auth.uid()));

-- Extend permission session/admin RPC output without exposing subscriptions.
create or replace function public.get_admin_session() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare current_user_id uuid:=auth.uid(); result jsonb;
begin
  if current_user_id is null then raise exception using errcode='42501',message='Authentication is required.'; end if;
  select jsonb_build_object('user_id',current_user_id,'email',u.email,'first_name',p.first_name,'last_name',p.last_name,'role',r.role::text,'is_active',case when r.role='admin' then true else coalesce(sp.is_active,false) end,'permissions',jsonb_build_object('can_view_visitors',r.role='admin' or coalesce(sp.can_view_visitors,false),'can_view_sensitive_data',r.role='admin' or coalesce(sp.can_view_sensitive_data,false),'can_view_identity_documents',r.role='admin' or coalesce(sp.can_view_identity_documents,false),'can_manage_visits',r.role='admin' or coalesce(sp.can_manage_visits,false),'can_confirm_returns',r.role='admin' or coalesce(sp.can_confirm_returns,false),'can_register_walk_in_visitors',r.role='admin' or coalesce(sp.can_register_walk_in_visitors,false),'can_export_reports',r.role='admin' or coalesce(sp.can_export_reports,false),'can_manage_announcements',r.role='admin' or coalesce(sp.can_manage_announcements,false),'can_manage_notifications',r.role='admin' or coalesce(sp.can_manage_notifications,false),'can_manage_route',r.role='admin' or coalesce(sp.can_manage_route,false),'can_manage_users',r.role='admin' or coalesce(sp.can_manage_users,false),'can_manage_staff',r.role='admin' or coalesce(sp.can_manage_staff,false))) into result from public.user_roles r join auth.users u on u.id=r.user_id left join public.profiles p on p.id=r.user_id left join public.staff_permissions sp on sp.user_id=r.user_id where r.user_id=current_user_id;
  if result is null or (result->>'role') not in ('admin','visitor_manager') then raise exception using errcode='42501',message='Administrative access is required.'; end if; return result;
end; $$;

create or replace function public.admin_get_staff_permissions(p_user_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  if auth.uid() is null or not public.is_admin() then raise exception using errcode='42501',message='Administrator access is required.'; end if;
  select jsonb_build_object('user_id',r.user_id,'role',r.role::text,'full_name',concat_ws(' ',p.first_name,p.last_name),'email',u.email,'is_active',coalesce(sp.is_active,false),'can_view_visitors',coalesce(sp.can_view_visitors,false),'can_view_sensitive_data',coalesce(sp.can_view_sensitive_data,false),'can_view_identity_documents',coalesce(sp.can_view_identity_documents,false),'can_manage_visits',coalesce(sp.can_manage_visits,false),'can_confirm_returns',coalesce(sp.can_confirm_returns,false),'can_register_walk_in_visitors',coalesce(sp.can_register_walk_in_visitors,false),'can_export_reports',coalesce(sp.can_export_reports,false),'can_manage_announcements',coalesce(sp.can_manage_announcements,false),'can_manage_notifications',coalesce(sp.can_manage_notifications,false),'can_manage_route',coalesce(sp.can_manage_route,false),'can_manage_users',coalesce(sp.can_manage_users,false),'can_manage_staff',coalesce(sp.can_manage_staff,false),'updated_at',sp.updated_at) into result from public.user_roles r join auth.users u on u.id=r.user_id left join public.profiles p on p.id=r.user_id left join public.staff_permissions sp on sp.user_id=r.user_id where r.user_id=p_user_id and r.role='visitor_manager'; return result;
end; $$;

create or replace function public.admin_update_staff_permissions(p_user_id uuid,p_permissions jsonb) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare current_user_id uuid:=auth.uid(); before_value jsonb; after_value jsonb; allowed_keys text[]:=array['can_view_visitors','can_view_sensitive_data','can_view_identity_documents','can_manage_visits','can_confirm_returns','can_register_walk_in_visitors','can_export_reports','can_manage_announcements','can_manage_notifications','can_manage_route','can_manage_users','can_manage_staff']; invalid_key text;
begin
  if current_user_id is null or not public.is_admin() then raise exception using errcode='42501',message='Administrator access is required.'; end if;
  select key into invalid_key from jsonb_object_keys(p_permissions) key where not(key=any(allowed_keys)) limit 1; if invalid_key is not null then raise exception using errcode='22023',message='Unsupported permission key.'; end if;
  if not exists(select 1 from public.user_roles where user_id=p_user_id and role='visitor_manager') then raise exception using errcode='P0002',message='Visitor manager was not found.'; end if;
  insert into public.staff_permissions(user_id) values(p_user_id) on conflict(user_id) do nothing;
  select to_jsonb(sp)-'user_id'-'created_at'-'updated_at' into before_value from public.staff_permissions sp where sp.user_id=p_user_id;
  update public.staff_permissions sp set can_view_visitors=coalesce((p_permissions->>'can_view_visitors')::boolean,sp.can_view_visitors),can_view_sensitive_data=coalesce((p_permissions->>'can_view_sensitive_data')::boolean,sp.can_view_sensitive_data),can_view_identity_documents=coalesce((p_permissions->>'can_view_identity_documents')::boolean,sp.can_view_identity_documents),can_manage_visits=coalesce((p_permissions->>'can_manage_visits')::boolean,sp.can_manage_visits),can_confirm_returns=coalesce((p_permissions->>'can_confirm_returns')::boolean,sp.can_confirm_returns),can_register_walk_in_visitors=coalesce((p_permissions->>'can_register_walk_in_visitors')::boolean,sp.can_register_walk_in_visitors),can_export_reports=coalesce((p_permissions->>'can_export_reports')::boolean,sp.can_export_reports),can_manage_announcements=coalesce((p_permissions->>'can_manage_announcements')::boolean,sp.can_manage_announcements),can_manage_notifications=coalesce((p_permissions->>'can_manage_notifications')::boolean,sp.can_manage_notifications),can_manage_route=coalesce((p_permissions->>'can_manage_route')::boolean,sp.can_manage_route),can_manage_users=coalesce((p_permissions->>'can_manage_users')::boolean,sp.can_manage_users),can_manage_staff=coalesce((p_permissions->>'can_manage_staff')::boolean,sp.can_manage_staff) where sp.user_id=p_user_id returning to_jsonb(sp)-'user_id'-'created_at'-'updated_at' into after_value;
  insert into public.audit_logs(actor_user_id,action,target_type,target_id,metadata) values(current_user_id,'staff_permissions_changed','staff_user',p_user_id::text,jsonb_build_object('before',before_value,'after',after_value)); return after_value;
end; $$;
