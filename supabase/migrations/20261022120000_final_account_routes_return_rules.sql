-- Incremental final rules. Existing profiles and visits are not rewritten.
-- Only the two route catalog records receive current GPX metadata.
create function public.is_adult(p_birth_date date, p_on_date date default (now() at time zone 'America/Guatemala')::date)
returns boolean language sql stable set search_path='' as $$
  select coalesce(p_birth_date <= (p_on_date - interval '18 years')::date, false);
$$;
revoke all on function public.is_adult(date,date) from public,anon;
grant execute on function public.is_adult(date,date) to authenticated;

create function public.enforce_tourist_birth_date()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.date_of_birth is distinct from old.date_of_birth
    and exists(select 1 from public.user_roles where user_id=new.id and role='tourist')
    and not public.is_adult(new.date_of_birth) then
    raise exception using errcode='23514',message='adult_required';
  end if;
  return new;
end;
$$;
create trigger enforce_tourist_birth_date before update of date_of_birth on public.profiles
for each row execute function public.enforce_tourist_birth_date();


create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = '' as $$
declare birth_date date;
begin
  -- invited_at is assigned by Auth, never trusted from editable user metadata.
  if new.invited_at is null then
    birth_date := nullif(new.raw_user_meta_data ->> 'date_of_birth','')::date;
    if not public.is_adult(birth_date) then
      raise exception using errcode='23514',message='adult_required';
    end if;
  end if;
  insert into public.profiles(id, first_name, last_name, date_of_birth)
  values(
    new.id,
    new.raw_user_meta_data ->> 'first_name',
    new.raw_user_meta_data ->> 'last_name', birth_date
  );
  insert into public.user_roles(user_id, role)
  values(new.id, 'tourist'::public.app_role);
  if new.raw_user_meta_data ->> 'terms_version' = '1.0'
    and new.raw_user_meta_data ->> 'privacy_version' = '1.0'
    and coalesce((new.raw_user_meta_data ->> 'legal_consent_accepted')::boolean, false)
  then
    insert into public.user_consents(user_id, terms_version, privacy_version)
    values(new.id, '1.0', '1.0');
  end if;
  return new;
end;
$$;

create or replace function public.assert_group_visit_eligibility(
  requested_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists(select 1 from public.profiles where id=requested_user_id and public.is_adult(date_of_birth)) then
    raise exception using errcode='23514',message='adult_required';
  end if;
  if not exists (
    select 1
    from public.user_roles as user_role
    where user_role.user_id = requested_user_id
      and user_role.role = 'tourist'::public.app_role
  ) then
    raise exception using
      errcode = '42501',
      message = 'A tourist account is required for group visits.';
  end if;

  if not exists (
    select 1
    from public.profiles as profile
    where profile.id = requested_user_id
      and nullif(pg_catalog.btrim(profile.first_name), '') is not null
      and nullif(pg_catalog.btrim(profile.last_name), '') is not null
      and profile.nationality_country_code is not null
      and profile.date_of_birth is not null
      and nullif(pg_catalog.btrim(profile.phone), '') is not null
      and profile.document_type is not null
      and nullif(pg_catalog.btrim(profile.document_number), '') is not null
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'Complete your tourist profile before creating or joining a group visit.';
  end if;

  if not exists (
    select 1
    from public.emergency_contacts as contact
    where contact.user_id = requested_user_id
      and nullif(pg_catalog.btrim(contact.first_name), '') is not null
      and nullif(pg_catalog.btrim(contact.last_name), '') is not null
      and nullif(pg_catalog.btrim(contact.relationship), '') is not null
      and nullif(pg_catalog.btrim(contact.phone), '') is not null
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'Add a valid emergency contact before creating or joining a group visit.';
  end if;
end;
$$;

create or replace function public.add_my_visit_minors(
  p_visit_id uuid,
  p_minors jsonb,
  p_responsibility_consent_accepted boolean
) returns setof public.visit_minors
language plpgsql volatile security definer set search_path = '' as $$
declare
  current_user_id uuid := auth.uid();
  current_visit_status public.visit_status;
  normalized_minors jsonb := coalesce(p_minors, '[]'::jsonb);
begin
  if current_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;
  select visit.status into current_visit_status
  from public.visits as visit where visit.id = p_visit_id for update;
  if current_visit_status is null or not exists (
    select 1 from public.visit_members as member
    where member.visit_id = p_visit_id
      and member.user_id = current_user_id
      and member.member_status <> 'withdrawn_before_start'
  ) then
    raise exception using errcode = '42501', message = 'Only a participant can register their accompanying minors.';
  end if;
  if current_visit_status <> 'forming' then
    raise exception using errcode = 'P0001', message = 'Minors can be registered only before the ascent starts.';
  end if;
  if not exists (
    select 1 from public.profiles as profile
    where profile.id = current_user_id
      and public.is_adult(profile.date_of_birth)
  ) then
    raise exception using errcode = '23514', message = 'The responsible participant must be an adult.';
  end if;
  if jsonb_typeof(normalized_minors) <> 'array'
    or jsonb_array_length(normalized_minors) > 12 then
    raise exception using errcode = '22023', message = 'Invalid accompanying minors payload.';
  end if;
  if jsonb_array_length(normalized_minors) > 0
    and coalesce(p_responsibility_consent_accepted, false) is not true then
    raise exception using errcode = '23514', message = 'Minor responsibility consent is required.';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(normalized_minors)
      as supplied(full_name text, age integer, sex text, relationship text)
    where nullif(pg_catalog.btrim(supplied.full_name), '') is null
      or supplied.age not between 0 and 17
      or supplied.sex not in ('male', 'female')
      or nullif(pg_catalog.btrim(supplied.relationship), '') is null
      or pg_catalog.char_length(pg_catalog.btrim(supplied.full_name)) > 160
      or pg_catalog.char_length(pg_catalog.btrim(supplied.relationship)) > 80
  ) then
    raise exception using errcode = '22023', message = 'Each minor requires valid name, age, sex and relationship.';
  end if;

  insert into public.visit_minors(
    visit_id, responsible_member_id, full_name, age, sex, relationship,
    created_by, responsibility_consent_version,
    responsibility_consent_accepted_at
  )
  select
    p_visit_id, current_user_id, pg_catalog.btrim(supplied.full_name),
    supplied.age::smallint, supplied.sex, pg_catalog.btrim(supplied.relationship),
    current_user_id, '1.0', pg_catalog.clock_timestamp()
  from jsonb_to_recordset(normalized_minors)
    as supplied(full_name text, age integer, sex text, relationship text);

  return query
  select minor.* from public.visit_minors as minor
  where minor.visit_id = p_visit_id
    and minor.responsible_member_id = current_user_id
  order by minor.created_at, minor.id;
end;
$$;

-- All creation RPCs, including administrative creation, share the schedule guard.
-- Existing short schedules remain readable and route-only changes remain possible.
create function public.enforce_visit_schedule()
returns trigger language plpgsql set search_path='' as $$
begin
  if tg_op='INSERT' or new.expected_return_at is distinct from old.expected_return_at
    or new.planned_start_at is distinct from old.planned_start_at then
    if new.expected_return_at is null or new.expected_return_at < coalesce(new.started_at,new.planned_start_at,now()) + interval '4 hours' then
      raise exception using errcode='23514',message='minimum_return_four_hours';
    end if;
  end if;
  return new;
end;
$$;
create trigger enforce_visit_schedule before insert or update on public.visits
for each row execute function public.enforce_visit_schedule();

create function public.enforce_normal_return()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.member_status='completed' and old.member_status is distinct from new.member_status
    and coalesce(new.checkout_method,'self') <> 'staff'
    and exists(select 1 from public.visits v where v.id=new.visit_id
      and clock_timestamp() < greatest(v.started_at + interval '4 hours',v.expected_return_at)) then
    raise exception using errcode='23514',message='early_return_required';
  end if;
  if new.exit_reason='other' and (old.exit_reason is distinct from new.exit_reason or old.exit_notes is distinct from new.exit_notes)
    and nullif(btrim(new.exit_notes),'') is null then
    raise exception using errcode='23514',message='early_return_description_required';
  end if;
  return new;
end;
$$;
create trigger enforce_normal_return before update on public.visit_members
for each row execute function public.enforce_normal_return();

alter table public.visit_members drop constraint visit_members_exit_reason_allowed;
alter table public.visit_members add constraint visit_members_exit_reason_allowed check (
  exit_reason is null or exit_reason in ('physical_discomfort','injury','emergency','weather','personal_decision','other','administrative_return')
);


create or replace function public.start_early_return(
  p_visit_id uuid,
  p_reason text,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  current_visit_status public.visit_status;
  normalized_reason text := nullif(pg_catalog.btrim(p_reason), '');
  normalized_notes text := nullif(pg_catalog.btrim(p_notes), '');
  affected_rows integer;
begin
  if current_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'Authentication is required.';
  end if;

  if normalized_reason is null
    or normalized_reason not in (
      'physical_discomfort',
      'injury',
      'emergency',
      'weather',
      'personal_decision',
      'other'
    ) then
    raise exception using
      errcode = '22023',
      message = 'A valid early return reason is required.';
  end if;

  if normalized_notes is not null
    and pg_catalog.char_length(normalized_notes) > 1000 then
    raise exception using
      errcode = '22023',
      message = 'Early return notes are too long.';
  end if;

  if not exists (
    select 1
    from public.visit_members as member
    where member.visit_id = p_visit_id
      and member.user_id = current_user_id
      and member.member_status = 'active'::public.visit_member_status
  ) then
    raise exception using
      errcode = '42501',
      message = 'Only an active participant can start their early return.';
  end if;

  select visit.status
  into current_visit_status
  from public.visits as visit
  where visit.id = p_visit_id
  for update;

  if current_visit_status <> 'in_progress'::public.visit_status then
    raise exception using
      errcode = 'P0001',
      message = 'Early return can start only during an in-progress visit.';
  end if;

  update public.visit_members as member
  set
    member_status = 'returning_early'::public.visit_member_status,
    return_started_at = pg_catalog.clock_timestamp(),
    exit_reason = normalized_reason,
    exit_notes = normalized_notes
  where member.visit_id = p_visit_id
    and member.user_id = current_user_id
    and member.member_status = 'active'::public.visit_member_status;

  get diagnostics affected_rows = row_count;
  if affected_rows <> 1 then
    raise exception using
      errcode = '42501',
      message = 'Only an active participant can start their early return.';
  end if;

  return current_user_id;
end;
$$;

create or replace function public.mark_member_returning_early(
  p_visit_id uuid,
  p_user_id uuid,
  p_reason text,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  current_visit_status public.visit_status;
  normalized_reason text := nullif(pg_catalog.btrim(p_reason), '');
  normalized_notes text := nullif(pg_catalog.btrim(p_notes), '');
  affected_rows integer;
begin
  if current_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'Authentication is required.';
  end if;

  if p_user_id is null or p_user_id = current_user_id then
    raise exception using
      errcode = '42501',
      message = 'Use the personal early return action for the organizer.';
  end if;

  if normalized_reason is null
    or normalized_reason not in (
      'physical_discomfort',
      'injury',
      'emergency',
      'weather',
      'personal_decision',
      'other'
    ) then
    raise exception using
      errcode = '22023',
      message = 'A valid early return reason is required.';
  end if;

  if normalized_notes is not null
    and pg_catalog.char_length(normalized_notes) > 1000 then
    raise exception using
      errcode = '22023',
      message = 'Early return notes are too long.';
  end if;

  select visit.status
  into current_visit_status
  from public.visits as visit
  where visit.id = p_visit_id
  for update;

  if not exists (
    select 1
    from public.visit_members as leader
    where leader.visit_id = p_visit_id
      and leader.user_id = current_user_id
      and leader.member_role = 'leader'::public.visit_member_role
      and leader.member_status = 'active'::public.visit_member_status
  ) then
    raise exception using
      errcode = '42501',
      message = 'Only the active group organizer can mark another member.';
  end if;

  if current_visit_status <> 'in_progress'::public.visit_status then
    raise exception using
      errcode = 'P0001',
      message = 'A member can return early only during an in-progress visit.';
  end if;

  update public.visit_members as member
  set
    member_status = 'returning_early'::public.visit_member_status,
    return_started_at = pg_catalog.clock_timestamp(),
    exit_reason = normalized_reason,
    exit_notes = normalized_notes
  where member.visit_id = p_visit_id
    and member.user_id = p_user_id
    and member.member_status = 'active'::public.visit_member_status;

  get diagnostics affected_rows = row_count;
  if affected_rows <> 1 then
    raise exception using
      errcode = 'P0001',
      message = 'The requested active member was not found.';
  end if;

  return p_user_id;
end;
$$;

-- One transaction records a physical early arrival using the existing return workflow.
create function public.record_my_early_return(p_visit_id uuid,p_reason text,p_notes text default null)
returns uuid language plpgsql volatile security definer set search_path='' as $$
begin
  perform public.start_early_return(p_visit_id,p_reason,p_notes);
  perform public.confirm_my_early_checkout(p_visit_id);
  insert into public.audit_logs(actor_user_id,action,target_type,target_id,metadata)
  values(auth.uid(),'early_return_recorded','visit',p_visit_id::text,jsonb_build_object('reason',p_reason));
  return p_visit_id;
end;
$$;
revoke all on function public.record_my_early_return(uuid,text,text) from public,anon,authenticated;
grant execute on function public.record_my_early_return(uuid,text,text) to authenticated;

alter table public.routes add column gpx_path text, add column asset_prefix text,
  add column total_distance_km numeric, add column journey_type text,
  add column gpx_metadata jsonb;


insert into public.routes(slug,name_es,name_en,gpx_path,asset_prefix,distance_km,total_distance_km,estimated_duration_minutes,journey_type,gpx_metadata)
values('ascenso-a-la-cima','Cima del Volcán Santa María','Santa María Volcano Summit','/data/volcan-santa-maria.gpx','santa-maria-route',10.481064,10.481064,502,'round_trip','{"source": "volcan-santa-maria.gpx", "sha256": "fcedb1e6be9590686d99be30794c51d8dbf87272e8ddc42b4ae8379d9607d454", "slug": "ascenso-a-la-cima", "pointCount": 1935, "segmentCount": 1, "distanceKm": 10.481064, "totalDistanceKm": 10.481064, "durationMinutes": 502, "direction": "round_trip", "startedAt": "2026-02-03T08:27:27Z", "endedAt": "2026-02-03T16:49:44Z", "start": [-91.548599, 14.787427], "summit": [-91.551731, 14.75719], "end": [-91.548605, 14.787453], "maxElevationM": 3700.947}'::jsonb)
on conflict(slug) do update set name_es=excluded.name_es,name_en=excluded.name_en,gpx_path=excluded.gpx_path,
asset_prefix=excluded.asset_prefix,distance_km=excluded.distance_km,total_distance_km=excluded.total_distance_km,
estimated_duration_minutes=excluded.estimated_duration_minutes,journey_type=excluded.journey_type,gpx_metadata=excluded.gpx_metadata;


insert into public.routes(slug,name_es,name_en,gpx_path,asset_prefix,distance_km,total_distance_km,estimated_duration_minutes,journey_type,gpx_metadata)
values('mirador-picacho','Mirador Picacho','Picacho Viewpoint','/data/mirador-picacho.gpx','mirador-picacho-route',4.753648,9.507296,124,'one_way_return_same_path','{"source": "mirador-picacho.gpx", "sha256": "4fa5f9f4d5f0b7bb98dfedc03385841baf88ae8d939c2939b237f85249ed0202", "slug": "mirador-picacho", "pointCount": 858, "segmentCount": 1, "distanceKm": 4.753648, "totalDistanceKm": 9.507296, "durationMinutes": 124, "direction": "one_way_return_same_path", "startedAt": "2026-04-11T21:40:30Z", "endedAt": "2026-04-11T23:44:48Z", "start": [-91.548608, 14.787156], "summit": [-91.560011, 14.75507], "end": [-91.560011, 14.75507], "maxElevationM": 3132.527}'::jsonb)
on conflict(slug) do update set name_es=excluded.name_es,name_en=excluded.name_en,gpx_path=excluded.gpx_path,
asset_prefix=excluded.asset_prefix,distance_km=excluded.distance_km,total_distance_km=excluded.total_distance_km,
estimated_duration_minutes=excluded.estimated_duration_minutes,journey_type=excluded.journey_type,gpx_metadata=excluded.gpx_metadata;


create function public.change_visit_route(p_visit_id uuid,p_route_id uuid)
returns uuid language plpgsql volatile security definer set search_path='' as $$
declare selected public.visits; old_name text; new_name text;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='Authentication is required.'; end if;
  select * into selected from public.visits where id=p_visit_id for update;
  if selected.id is null or not (
    public.has_staff_permission('can_manage_visits') or exists(
      select 1 from public.visit_members where visit_id=p_visit_id and user_id=auth.uid()
      and member_role='leader' and member_status in ('active','returning_early')
    )
  ) then raise exception using errcode='42501',message='Only the organizer or authorized staff can change this route.'; end if;
  if selected.status not in ('forming','in_progress') then
    raise exception using errcode='23514',message='Only an open visit can change route.';
  end if;
  select name_es into new_name from public.routes where id=p_route_id and is_active;
  if new_name is null then raise exception using errcode='22023',message='Choose an active route.'; end if;
  if selected.route_id=p_route_id then return p_visit_id; end if;
  select name_es into old_name from public.routes where id=selected.route_id;
  update public.visits set route_id=p_route_id where id=p_visit_id;
  insert into public.audit_logs(actor_user_id,action,target_type,target_id,metadata)
  values(auth.uid(),'visit_route_changed','visit',p_visit_id::text,jsonb_build_object(
    'previous_route_id',selected.route_id,'new_route_id',p_route_id,
    'previous_route_name',old_name,'new_route_name',new_name,'visit_status',selected.status,
    'description',format('Ruta modificada de %s a %s.',old_name,new_name)));
  return p_visit_id;
end;
$$;
revoke all on function public.change_visit_route(uuid,uuid) from public,anon,authenticated;
grant execute on function public.change_visit_route(uuid,uuid) to authenticated;


create or replace function public.create_group_visit_with_minors(
  p_route_id uuid,
  p_visit_type public.visit_type,
  p_planned_start_at timestamptz,
  p_expected_return_at timestamptz,
  p_has_local_guide boolean,
  p_guide_name text,
  p_terms_accepted boolean,
  p_recommendations_accepted boolean,
  p_start_mode text,
  p_minors jsonb,
  p_responsibility_consent_accepted boolean
) returns table(visit_id uuid, join_code text)
language plpgsql volatile security definer set search_path = '' as $$
declare
  created_visit_id uuid;
  created_join_code text;
begin
  select created.visit_id, created.join_code
  into created_visit_id, created_join_code
  from public.create_group_visit(
    p_visit_type, p_planned_start_at, p_expected_return_at,
    p_has_local_guide, p_guide_name, p_terms_accepted,
    p_recommendations_accepted, p_start_mode
  ) as created;
  if jsonb_array_length(coalesce(p_minors, '[]'::jsonb)) > 0 then
    perform public.add_my_visit_minors(
      created_visit_id, p_minors, p_responsibility_consent_accepted
    );
  end if;
  if not exists(select 1 from public.routes where id=p_route_id and is_active) then
    raise exception using errcode='22023',message='Choose an active route.';
  end if;
  update public.visits set route_id=p_route_id where id=created_visit_id;
  return query select created_visit_id, created_join_code;
end;
$$;

revoke all on function public.create_group_visit_with_minors(uuid,public.visit_type,timestamptz,timestamptz,boolean,text,boolean,boolean,text,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.create_group_visit_with_minors(uuid,public.visit_type,timestamptz,timestamptz,boolean,text,boolean,boolean,text,jsonb,boolean) to authenticated;


-- Derived operational views for the consolidated Spanish administration UI.

drop function if exists public.staff_list_ascents(text, integer, text);
create function public.staff_list_ascents(
  p_status text default 'all', p_limit integer default 100, p_search text default null
) returns table(
  visit_id uuid, join_code text, organizer_name text, visit_type text,
  participant_count bigint, adult_count bigint, minor_count bigint,
  minor_matches jsonb, planned_start_at timestamptz, started_at timestamptz,
  expected_return_at timestamptz, completed_at timestamptz, visit_status text,
  creation_origin text, finalized_by_administration boolean, route_id uuid, route_name text
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
    exists(select 1 from public.visit_members member where member.visit_id=visit.id and member.checkout_method='staff'),
    visit.route_id, route.name_es
  from public.visits visit
  join public.routes route on route.id=visit.route_id
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



create or replace function public.activate_my_staff_invitation()
returns boolean language plpgsql volatile security definer set search_path = '' as $$
declare current_user_id uuid := auth.uid();
begin
  if current_user_id is null then return false; end if;
  update public.staff_permissions as permission
  set is_active = true, invitation_status = 'active'
  where permission.user_id = current_user_id
    and permission.invitation_status = 'pending'
    and exists(select 1 from auth.users u where u.id=current_user_id and u.email_confirmed_at is not null and nullif(u.encrypted_password,'') is not null)
    and exists (
      select 1 from public.user_roles as role
      where role.user_id = current_user_id and role.role = 'visitor_manager'
    );
  if found then
    insert into public.audit_logs(actor_user_id, action, target_type, target_id, metadata)
    values(current_user_id, 'staff_invitation_accepted', 'staff_user', current_user_id::text, '{}'::jsonb);
    return true;
  end if;
  return false;
end;
$$;

create or replace function public.admin_set_staff_access(p_user_id uuid, p_is_active boolean)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  previous_active boolean;
begin
  if exists(select 1 from public.staff_permissions where user_id=p_user_id and invitation_status='pending') then
    raise exception using errcode='23514',message='Pending invitations must be accepted first.';
  end if;
  if not public.is_admin(current_user_id) then
    raise exception using errcode = '42501', message = 'Administrator access is required.';
  end if;
  if not exists (
    select 1 from public.user_roles
    where user_id = p_user_id and role = 'visitor_manager'::public.app_role
  ) then
    raise exception using errcode = 'P0002', message = 'Visitor manager was not found.';
  end if;

  insert into public.staff_permissions (user_id, is_active)
  values (p_user_id, coalesce(p_is_active, false))
  on conflict (user_id) do update set is_active = excluded.is_active
  returning is_active into previous_active;

  insert into public.audit_logs (actor_user_id, action, target_type, target_id, metadata)
  values (
    current_user_id,
    case when p_is_active then 'staff_activated' else 'staff_deactivated' end,
    'staff_user',
    p_user_id::text,
    jsonb_build_object('is_active', coalesce(p_is_active, false))
  );
  return previous_active;
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
  return payload||jsonb_build_object('department_breakdown',departments,'route_breakdown',(
    select coalesce(jsonb_agg(jsonb_build_object('route_id',r.id,'route_name',r.name_es,
      'ascents',(select count(*) from public.visits v where v.route_id=r.id
        and coalesce(v.started_at,v.planned_start_at,v.created_at)>=p_from
        and coalesce(v.started_at,v.planned_start_at,v.created_at)<p_to))), '[]'::jsonb)
    from public.routes r
  ));
end;
$$;

create or replace function public.staff_list_visitor_directory(p_search text default null, p_limit integer default 200)
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
  where not exists(select 1 from public.user_roles r where r.user_id=profile.id and r.role in ('admin','visitor_manager'))
    and nullif(profile.first_name,'') is not null and nullif(profile.last_name,'') is not null
    and (normalized_search is null or pg_catalog.concat_ws(' ',profile.first_name,profile.last_name) ilike '%'||normalized_search||'%')
  order by coalesce(latest.visit_date,profile.registered_at,profile.created_at) desc
  limit least(coalesce(p_limit,200),250);
end;
$$;

-- Trigger helpers are not callable from the public API.
revoke all on function public.enforce_tourist_birth_date() from public,anon,authenticated;
revoke all on function public.enforce_visit_schedule() from public,anon,authenticated;
revoke all on function public.enforce_normal_return() from public,anon,authenticated;
