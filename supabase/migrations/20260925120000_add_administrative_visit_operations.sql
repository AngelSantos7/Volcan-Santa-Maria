-- Administrative walk-in visitors keep a profile without requiring an Auth
-- account. Existing authenticated profiles retain the same UUID and behavior.
alter table public.emergency_contacts
  drop constraint if exists emergency_contacts_user_id_fkey;
alter table public.visit_members
  drop constraint if exists visit_members_user_id_fkey;
alter table public.profiles
  drop constraint if exists profiles_id_fkey;

alter table public.emergency_contacts
  add constraint emergency_contacts_user_id_fkey
  foreign key (user_id) references public.profiles (id) on delete cascade;
alter table public.visit_members
  add constraint visit_members_user_id_fkey
  foreign key (user_id) references public.profiles (id) on delete restrict;

alter table public.profiles
  add column registration_origin text not null default 'self',
  add column registered_by uuid references auth.users (id) on delete set null,
  add column registered_at timestamptz,
  add column alternate_phone text,
  add constraint profiles_registration_origin_valid
    check (registration_origin in ('self', 'administrative')),
  add constraint profiles_administrative_registration_consistent check (
    (registration_origin = 'self' and registered_by is null)
    or (registration_origin = 'administrative' and registered_by is not null and registered_at is not null)
  ),
  add constraint profiles_alternate_phone_e164_format
    check (alternate_phone is null or alternate_phone ~ '^\+[1-9][0-9]{1,14}$');

alter table public.visits
  add column creation_origin text not null default 'tourist',
  add column created_by_staff uuid references auth.users (id) on delete set null,
  add column administrative_created_at timestamptz,
  add constraint visits_creation_origin_valid
    check (creation_origin in ('tourist', 'administrative')),
  add constraint visits_administrative_creation_consistent check (
    (creation_origin = 'tourist' and created_by_staff is null)
    or (creation_origin = 'administrative' and created_by_staff is not null and administrative_created_at is not null)
  );

alter table public.visit_members
  add column added_by_staff uuid references auth.users (id) on delete set null,
  add column administrative_added_at timestamptz,
  add column administrative_return_reason text,
  add column administrative_return_notes text,
  add column administrative_return_recorded_at timestamptz,
  add column administrative_return_retrospective boolean not null default false,
  add constraint visit_members_administrative_return_reason_valid check (
    administrative_return_reason is null or administrative_return_reason in (
      'phone_battery', 'no_connection', 'forgot_to_finish',
      'confirmed_in_person', 'other'
    )
  ),
  add constraint visit_members_administrative_return_notes_length
    check (administrative_return_notes is null or char_length(administrative_return_notes) <= 1000);

create index profiles_registration_origin_idx
  on public.profiles (registration_origin, created_at desc);
create index visits_creation_origin_idx
  on public.visits (creation_origin, created_at desc);
create index visit_members_admin_checkout_idx
  on public.visit_members (checkout_method, checked_out_at desc)
  where checkout_method = 'staff';

create or replace function public.staff_find_visitor(
  p_document_type text,
  p_document_number text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  normalized_type text := pg_catalog.lower(pg_catalog.btrim(p_document_type));
  normalized_number text := pg_catalog.upper(pg_catalog.regexp_replace(p_document_number, '\s+', '', 'g'));
  result jsonb;
begin
  if not (
    public.has_staff_permission('can_register_walk_in_visitors')
    or public.has_staff_permission('can_manage_visits')
  ) then
    raise exception using errcode = '42501', message = 'Walk-in visitor permission is required.';
  end if;
  if normalized_type not in ('dpi', 'passport') or nullif(normalized_number, '') is null then
    raise exception using errcode = '22023', message = 'A valid identity document is required.';
  end if;

  select pg_catalog.jsonb_build_object(
    'visitor_id', profile.id,
    'full_name', pg_catalog.concat_ws(' ', profile.first_name, profile.last_name),
    'first_name', profile.first_name,
    'last_name', profile.last_name,
    'nationality_country_code', profile.nationality_country_code,
    'registration_origin', profile.registration_origin
  ) into result
  from public.profiles as profile
  where profile.document_type::text = normalized_type
    and pg_catalog.upper(pg_catalog.regexp_replace(profile.document_number, '\s+', '', 'g')) = normalized_number
  order by profile.created_at
  limit 1;

  return result;
end;
$$;

create or replace function public.staff_register_walk_in_visitor(
  p_first_name text,
  p_last_name text,
  p_nationality_country_code text,
  p_date_of_birth date,
  p_phone text,
  p_alternate_phone text,
  p_document_type text,
  p_document_number text,
  p_emergency_first_name text,
  p_emergency_last_name text,
  p_emergency_relationship text,
  p_emergency_phone text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  new_visitor_id uuid := extensions.gen_random_uuid();
  request_time timestamptz := pg_catalog.clock_timestamp();
  normalized_first_name text := nullif(pg_catalog.btrim(p_first_name), '');
  normalized_last_name text := nullif(pg_catalog.btrim(p_last_name), '');
  normalized_country text := pg_catalog.upper(pg_catalog.btrim(p_nationality_country_code));
  normalized_type text := pg_catalog.lower(pg_catalog.btrim(p_document_type));
  normalized_number text := pg_catalog.upper(pg_catalog.regexp_replace(p_document_number, '\s+', '', 'g'));
  existing_id uuid;
begin
  if current_user_id is null or not public.has_staff_permission('can_register_walk_in_visitors') then
    raise exception using errcode = '42501', message = 'Walk-in visitor permission is required.';
  end if;
  if normalized_first_name is null or normalized_last_name is null
    or normalized_country is null or normalized_country !~ '^[A-Z]{2}$'
    or p_date_of_birth is null or p_date_of_birth >= current_date
    or normalized_type not in ('dpi', 'passport') or nullif(normalized_number, '') is null
    or nullif(pg_catalog.btrim(p_emergency_first_name), '') is null
    or nullif(pg_catalog.btrim(p_emergency_last_name), '') is null
    or nullif(pg_catalog.btrim(p_emergency_relationship), '') is null
    or p_emergency_phone is null then
    raise exception using errcode = '22023', message = 'Required visitor information is incomplete.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(normalized_type || ':' || normalized_number, 0)
  );
  select profile.id into existing_id
  from public.profiles as profile
  where profile.document_type::text = normalized_type
    and pg_catalog.upper(pg_catalog.regexp_replace(profile.document_number, '\s+', '', 'g')) = normalized_number
  limit 1;
  if existing_id is not null then
    raise exception using errcode = '23505', message = 'A visitor with this identity document already exists.';
  end if;

  insert into public.profiles (
    id, first_name, last_name, nationality_country_code,
    date_of_birth, phone, alternate_phone, document_type, document_number,
    registration_origin, registered_by, registered_at
  ) values (
    new_visitor_id, normalized_first_name, normalized_last_name, normalized_country,
    p_date_of_birth, nullif(pg_catalog.btrim(p_phone), ''),
    nullif(pg_catalog.btrim(p_alternate_phone), ''), normalized_type::public.document_type,
    pg_catalog.btrim(p_document_number), 'administrative', current_user_id, request_time
  );

  insert into public.emergency_contacts (
    user_id, first_name, last_name, relationship, phone
  ) values (
    new_visitor_id, pg_catalog.btrim(p_emergency_first_name),
    pg_catalog.btrim(p_emergency_last_name), pg_catalog.btrim(p_emergency_relationship),
    pg_catalog.btrim(p_emergency_phone)
  );

  insert into public.audit_logs (actor_user_id, action, target_type, target_id, metadata)
  values (
    current_user_id, 'administrative_visitor_created', 'visitor', new_visitor_id::text,
    pg_catalog.jsonb_build_object('origin', 'administrative')
  );
  return pg_catalog.jsonb_build_object(
    'visitor_id', new_visitor_id,
    'first_name', normalized_first_name,
    'last_name', normalized_last_name,
    'registration_origin', 'administrative',
    'registered_at', request_time
  );
end;
$$;

create or replace function public.staff_list_visitor_directory(
  p_search text default null,
  p_limit integer default 200
)
returns table (
  visitor_id uuid,
  full_name text,
  nationality_country_code text,
  registration_origin text,
  registered_at timestamptz,
  latest_visit_id uuid,
  latest_visit_status text,
  latest_member_status text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  normalized_search text := nullif(pg_catalog.btrim(p_search), '');
begin
  if not (
    public.has_staff_permission('can_view_visitors')
    or public.has_staff_permission('can_register_walk_in_visitors')
    or public.has_staff_permission('can_manage_visits')
  ) then
    raise exception using errcode = '42501', message = 'Visitor access is required.';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 250 then
    raise exception using errcode = '22023', message = 'Invalid page size.';
  end if;

  return query
  select
    profile.id,
    pg_catalog.concat_ws(' ', profile.first_name, profile.last_name),
    profile.nationality_country_code,
    profile.registration_origin,
    coalesce(profile.registered_at, profile.created_at),
    latest.visit_id,
    latest.visit_status,
    latest.member_status
  from public.profiles as profile
  left join lateral (
    select member.visit_id, visit.status::text as visit_status,
      member.member_status::text as member_status
    from public.visit_members as member
    join public.visits as visit on visit.id = member.visit_id
    where member.user_id = profile.id
    order by coalesce(visit.started_at, visit.planned_start_at, visit.created_at) desc
    limit 1
  ) as latest on true
  where nullif(profile.first_name, '') is not null
    and nullif(profile.last_name, '') is not null
    and (
      normalized_search is null
      or pg_catalog.concat_ws(' ', profile.first_name, profile.last_name)
        ilike '%' || normalized_search || '%'
    )
  order by coalesce(profile.registered_at, profile.created_at) desc, full_name
  limit p_limit;
end;
$$;

create or replace function public.staff_create_administrative_visit(
  p_visitor_ids uuid[],
  p_organizer_id uuid,
  p_visit_type public.visit_type,
  p_start_mode text,
  p_planned_start_at timestamptz,
  p_expected_return_at timestamptz,
  p_has_local_guide boolean,
  p_guide_name text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  request_time timestamptz := pg_catalog.clock_timestamp();
  normalized_start_mode text := pg_catalog.lower(pg_catalog.btrim(p_start_mode));
  normalized_guide_name text := nullif(pg_catalog.btrim(p_guide_name), '');
  distinct_visitor_ids uuid[];
  default_route_id uuid;
  new_visit_id uuid;
  new_join_code text;
  member_id uuid;
  attempt integer;
begin
  if current_user_id is null or not public.has_staff_permission('can_manage_visits') then
    raise exception using errcode = '42501', message = 'Visit management permission is required.';
  end if;
  select pg_catalog.array_agg(distinct supplied_id)
  into distinct_visitor_ids from pg_catalog.unnest(p_visitor_ids) as supplied(supplied_id);
  if distinct_visitor_ids is null or pg_catalog.array_length(distinct_visitor_ids, 1) < 1
    or not (p_organizer_id = any(distinct_visitor_ids))
    or p_visit_type is null or normalized_start_mode not in ('now', 'scheduled')
    or p_expected_return_at is null or p_expected_return_at <= request_time
    or (normalized_start_mode = 'scheduled' and (p_planned_start_at is null or p_planned_start_at <= request_time))
    or (normalized_start_mode = 'scheduled' and p_planned_start_at >= p_expected_return_at)
    or (coalesce(p_has_local_guide, false) and normalized_guide_name is null) then
    raise exception using errcode = '22023', message = 'Invalid administrative ascent information.';
  end if;
  if (select count(*) from public.profiles where id = any(distinct_visitor_ids))
    <> pg_catalog.array_length(distinct_visitor_ids, 1) then
    raise exception using errcode = 'P0002', message = 'One or more visitors were not found.';
  end if;
  if exists (
    select 1 from public.visit_members as member
    join public.visits as visit on visit.id = member.visit_id
    where member.user_id = any(distinct_visitor_ids)
      and member.member_status in ('active', 'returning_early')
      and visit.status in ('forming', 'in_progress')
  ) then
    raise exception using errcode = 'P0001', message = 'A selected visitor already has an active ascent.';
  end if;

  select route.id into default_route_id from public.routes as route
  where route.slug in ('ascenso-a-la-cima', 'ascenso-cima') and route.is_active
  order by (route.slug = 'ascenso-a-la-cima') desc limit 1;
  if default_route_id is null then
    raise exception using errcode = 'P0002', message = 'The default summit route is not available.';
  end if;
  for attempt in 1..10 loop
    new_join_code := public.generate_group_join_code();
    begin
      insert into public.visits (
        route_id, created_by, join_code, visit_type, start_mode,
        planned_start_at, started_at, expected_return_at, has_local_guide,
        guide_name, recommendations_accepted_at, recommendations_version,
        status, creation_origin, created_by_staff, administrative_created_at
      ) values (
        default_route_id, current_user_id, new_join_code, p_visit_type,
        normalized_start_mode,
        case when normalized_start_mode = 'now' then request_time else p_planned_start_at end,
        case when normalized_start_mode = 'now' then request_time else null end,
        p_expected_return_at, coalesce(p_has_local_guide, false),
        case when p_has_local_guide then normalized_guide_name else null end,
        request_time, 'v1',
        case when normalized_start_mode = 'now' then 'in_progress'::public.visit_status else 'forming'::public.visit_status end,
        'administrative', current_user_id, request_time
      ) returning id into new_visit_id;
      exit;
    exception when unique_violation then
      if attempt = 10 then raise; end if;
    end;
  end loop;

  foreach member_id in array distinct_visitor_ids loop
    insert into public.visit_members (
      visit_id, user_id, member_role, terms_accepted_at,
      added_by_staff, administrative_added_at
    ) values (
      new_visit_id, member_id,
      case when member_id = p_organizer_id then 'leader'::public.visit_member_role else 'member'::public.visit_member_role end,
      request_time, current_user_id, request_time
    );
    insert into public.audit_logs (actor_user_id, action, target_type, target_id, metadata)
    values (
      current_user_id, 'administrative_visit_member_added', 'visitor', member_id::text,
      pg_catalog.jsonb_build_object('visit_id', new_visit_id, 'role',
        case when member_id = p_organizer_id then 'leader' else 'member' end)
    );
  end loop;
  insert into public.audit_logs (actor_user_id, action, target_type, target_id, metadata)
  values (
    current_user_id, 'administrative_visit_created', 'visit', new_visit_id::text,
    pg_catalog.jsonb_build_object('participant_count', pg_catalog.array_length(distinct_visitor_ids, 1), 'start_mode', normalized_start_mode)
  );
  return pg_catalog.jsonb_build_object(
    'visit_id', new_visit_id, 'join_code', new_join_code,
    'participant_count', pg_catalog.array_length(distinct_visitor_ids, 1),
    'creation_origin', 'administrative'
  );
end;
$$;

create or replace function public.staff_start_administrative_visit(p_visit_id uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  request_time timestamptz := pg_catalog.clock_timestamp();
begin
  if auth.uid() is null or not public.has_staff_permission('can_manage_visits') then
    raise exception using errcode = '42501', message = 'Visit management permission is required.';
  end if;
  update public.visits set status = 'in_progress', started_at = request_time
  where id = p_visit_id and creation_origin = 'administrative' and status = 'forming'
    and planned_start_at <= request_time and expected_return_at > request_time;
  if not found then
    raise exception using errcode = 'P0001', message = 'The administrative ascent cannot be started yet.';
  end if;
  insert into public.audit_logs (actor_user_id, action, target_type, target_id)
  values (auth.uid(), 'administrative_visit_started', 'visit', p_visit_id::text);
  return p_visit_id;
end;
$$;

create or replace function public.staff_register_administrative_return(
  p_visit_id uuid,
  p_user_id uuid,
  p_reason text,
  p_notes text default null,
  p_effective_return_at timestamptz default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  request_time timestamptz := pg_catalog.clock_timestamp();
  effective_time timestamptz := coalesce(p_effective_return_at, pg_catalog.clock_timestamp());
  normalized_reason text := pg_catalog.lower(pg_catalog.btrim(p_reason));
  normalized_notes text := nullif(pg_catalog.btrim(p_notes), '');
  previous_status public.visit_member_status;
  group_completed boolean := false;
begin
  if current_user_id is null or not public.has_staff_permission('can_confirm_returns') then
    raise exception using errcode = '42501', message = 'Return confirmation permission is required.';
  end if;
  if normalized_reason not in ('phone_battery', 'no_connection', 'forgot_to_finish', 'confirmed_in_person', 'other')
    or (normalized_reason = 'other' and normalized_notes is null)
    or pg_catalog.char_length(coalesce(normalized_notes, '')) > 1000
    or effective_time > request_time + interval '5 minutes' then
    raise exception using errcode = '22023', message = 'Invalid administrative return information.';
  end if;

  select member.member_status into previous_status
  from public.visit_members as member
  join public.visits as visit on visit.id = member.visit_id
  where member.visit_id = p_visit_id and member.user_id = p_user_id
    and visit.status = 'in_progress'
  for update of member;
  if previous_status not in ('active', 'returning_early') then
    raise exception using errcode = 'P0001', message = 'This participant is not awaiting a return confirmation.';
  end if;

  update public.visit_members set
    member_status = case when previous_status = 'returning_early'
      then 'returned_early'::public.visit_member_status else 'completed'::public.visit_member_status end,
    checked_out_at = effective_time,
    checkout_method = 'staff',
    checked_out_by = current_user_id,
    administrative_return_reason = normalized_reason,
    administrative_return_notes = normalized_notes,
    administrative_return_recorded_at = request_time,
    administrative_return_retrospective = effective_time < request_time - interval '1 minute'
  where visit_id = p_visit_id and user_id = p_user_id;

  if not exists (
    select 1 from public.visit_members
    where visit_id = p_visit_id
      and member_status in ('active', 'returning_early')
  ) then
    update public.visits set status = 'completed', completed_at = request_time
    where id = p_visit_id and status = 'in_progress';
    group_completed := found;
  end if;

  insert into public.audit_logs (actor_user_id, action, target_type, target_id, metadata)
  values (
    current_user_id, 'administrative_individual_return_recorded', 'visitor', p_user_id::text,
    pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
      'visit_id', p_visit_id, 'reason', normalized_reason,
      'notes', normalized_notes, 'effective_return_at', effective_time,
      'retrospective', effective_time < request_time - interval '1 minute'
    ))
  );
  if group_completed then
    insert into public.audit_logs (actor_user_id, action, target_type, target_id, metadata)
    values (current_user_id, 'administrative_group_completed', 'visit', p_visit_id::text,
      pg_catalog.jsonb_build_object('completed_by_last_individual_return', true));
  end if;
  return pg_catalog.jsonb_build_object(
    'visit_id', p_visit_id, 'visitor_id', p_user_id,
    'effective_return_at', effective_time, 'group_completed', group_completed
  );
end;
$$;

create or replace function public.staff_register_administrative_group_return(
  p_visit_id uuid,
  p_reason text,
  p_notes text default null,
  p_effective_return_at timestamptz default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  member_record record;
  returned_count integer := 0;
begin
  if auth.uid() is null or not public.has_staff_permission('can_confirm_returns') then
    raise exception using errcode = '42501', message = 'Return confirmation permission is required.';
  end if;
  for member_record in
    select member.user_id from public.visit_members as member
    join public.visits as visit on visit.id = member.visit_id
    where member.visit_id = p_visit_id and visit.status = 'in_progress'
      and member.member_status in ('active', 'returning_early')
    order by member.joined_at
  loop
    perform public.staff_register_administrative_return(
      p_visit_id, member_record.user_id, p_reason, p_notes, p_effective_return_at
    );
    returned_count := returned_count + 1;
  end loop;
  if returned_count = 0 then
    raise exception using errcode = 'P0001', message = 'No participants are awaiting return confirmation.';
  end if;
  insert into public.audit_logs (actor_user_id, action, target_type, target_id, metadata)
  values (auth.uid(), 'administrative_group_return_recorded', 'visit', p_visit_id::text,
    pg_catalog.jsonb_build_object('participant_count', returned_count, 'reason', p_reason));
  return pg_catalog.jsonb_build_object('visit_id', p_visit_id, 'participant_count', returned_count);
end;
$$;

-- Enrich existing staff reads with administrative provenance while preserving
-- the operational status fields.
create or replace function public.staff_get_visitor_summary(p_user_id uuid, p_visit_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare result jsonb;
begin
  if not public.has_staff_permission('can_view_visitors') then
    raise exception using errcode = '42501', message = 'Visitor access is required.';
  end if;
  select pg_catalog.jsonb_build_object(
    'user_id', profile.id, 'visit_id', visit.id,
    'first_name', profile.first_name, 'last_name', profile.last_name,
    'nationality_country_code', profile.nationality_country_code,
    'avatar_kind', profile.avatar_kind, 'avatar_path', profile.avatar_path,
    'avatar_preset', profile.avatar_preset,
    'registration_origin', profile.registration_origin,
    'registered_by', profile.registered_by, 'registered_at', profile.registered_at,
    'member_role', membership.member_role::text,
    'member_status', membership.member_status::text, 'visit_status', visit.status::text,
    'join_code', visit.join_code, 'visit_type', visit.visit_type::text,
    'route_name', route.name_es, 'planned_start_at', visit.planned_start_at,
    'started_at', visit.started_at, 'expected_return_at', visit.expected_return_at,
    'completed_at', visit.completed_at, 'return_started_at', membership.return_started_at,
    'checked_out_at', membership.checked_out_at,
    'creation_origin', visit.creation_origin, 'created_by_staff', visit.created_by_staff,
    'administrative_created_at', visit.administrative_created_at,
    'finalized_by_administration', membership.checkout_method = 'staff',
    'administrative_return_recorded_at', membership.administrative_return_recorded_at,
    'participant_count', (select count(*) from public.visit_members as counted
      where counted.visit_id = visit.id and counted.member_status <> 'withdrawn_before_start'),
    'history', (select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'visit_id', historical_visit.id, 'join_code', historical_visit.join_code,
      'visit_type', historical_visit.visit_type::text,
      'visit_status', historical_visit.status::text,
      'member_status', historical_member.member_status::text,
      'planned_start_at', historical_visit.planned_start_at,
      'started_at', historical_visit.started_at,
      'expected_return_at', historical_visit.expected_return_at,
      'completed_at', historical_visit.completed_at,
      'checked_out_at', historical_member.checked_out_at,
      'creation_origin', historical_visit.creation_origin,
      'finalized_by_administration', historical_member.checkout_method = 'staff'
    ) order by coalesce(historical_visit.started_at, historical_visit.planned_start_at, historical_visit.created_at) desc), '[]'::jsonb)
    from public.visit_members as historical_member
    join public.visits as historical_visit on historical_visit.id = historical_member.visit_id
    where historical_member.user_id = profile.id)
  ) into result
  from public.visit_members as membership
  join public.profiles as profile on profile.id = membership.user_id
  join public.visits as visit on visit.id = membership.visit_id
  join public.routes as route on route.id = visit.route_id
  where membership.user_id = p_user_id and membership.visit_id = p_visit_id;
  if result is null then raise exception using errcode = 'P0002', message = 'Visitor record was not found.'; end if;
  return result;
end;
$$;

create or replace function public.staff_get_visitor_sensitive_details(
  p_user_id uuid, p_include_documents boolean default false
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare current_user_id uuid := auth.uid(); result jsonb;
begin
  if not public.has_staff_permission('can_view_sensitive_data') then
    raise exception using errcode = '42501', message = 'Sensitive data access is required.';
  end if;
  if coalesce(p_include_documents, false) and not public.has_staff_permission('can_view_identity_documents') then
    raise exception using errcode = '42501', message = 'Identity document access is required.';
  end if;
  select pg_catalog.jsonb_build_object(
    'date_of_birth', profile.date_of_birth, 'phone', profile.phone,
    'alternate_phone', profile.alternate_phone,
    'document_type', case when p_include_documents then profile.document_type::text else null end,
    'document_number', case when p_include_documents then profile.document_number else null end,
    'emergency_contact', case when contact.id is null then null else pg_catalog.jsonb_build_object(
      'first_name', contact.first_name, 'last_name', contact.last_name,
      'relationship', contact.relationship, 'phone', contact.phone) end
  ) into result from public.profiles as profile
  left join public.emergency_contacts as contact on contact.user_id = profile.id
  where profile.id = p_user_id;
  if result is null then raise exception using errcode = 'P0002', message = 'Visitor record was not found.'; end if;
  insert into public.audit_logs (actor_user_id, action, target_type, target_id, metadata)
  values (current_user_id, 'sensitive_data_viewed', 'visitor', p_user_id::text,
    pg_catalog.jsonb_build_object('included_identity_document', coalesce(p_include_documents, false)));
  if coalesce(p_include_documents, false) then
    insert into public.audit_logs (actor_user_id, action, target_type, target_id)
    values (current_user_id, 'identity_document_viewed', 'visitor', p_user_id::text);
  end if;
  return result;
end;
$$;

drop function public.staff_list_ascents(text, integer);
create function public.staff_list_ascents(p_status text default 'all', p_limit integer default 100)
returns table (
  visit_id uuid, join_code text, organizer_name text, visit_type text,
  participant_count bigint, planned_start_at timestamptz, started_at timestamptz,
  expected_return_at timestamptz, completed_at timestamptz, visit_status text,
  creation_origin text, finalized_by_administration boolean
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (public.has_staff_permission('can_view_visitors') or public.has_staff_permission('can_manage_visits')) then
    raise exception using errcode = '42501', message = 'Visit access is required.';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 250 then raise exception using errcode = '22023', message = 'Invalid page size.'; end if;
  return query select visit.id, visit.join_code,
    pg_catalog.concat_ws(' ', organizer_profile.first_name, organizer_profile.last_name),
    visit.visit_type::text,
    count(member.user_id) filter (where member.member_status <> 'withdrawn_before_start'),
    visit.planned_start_at, visit.started_at, visit.expected_return_at, visit.completed_at,
    visit.status::text, visit.creation_origin,
    coalesce(bool_or(member.checkout_method = 'staff'), false)
  from public.visits as visit
  join public.visit_members as organizer on organizer.visit_id = visit.id and organizer.member_role = 'leader'
  join public.profiles as organizer_profile on organizer_profile.id = organizer.user_id
  left join public.visit_members as member on member.visit_id = visit.id
  where p_status = 'all'
    or (p_status = 'scheduled' and visit.status = 'forming')
    or (p_status = 'in_progress' and visit.status = 'in_progress')
    or (p_status = 'completed' and visit.status = 'completed')
  group by visit.id, organizer_profile.first_name, organizer_profile.last_name
  order by coalesce(visit.started_at, visit.planned_start_at, visit.created_at) desc limit p_limit;
end;
$$;

drop function public.staff_list_return_controls(integer);
create function public.staff_list_return_controls(p_limit integer default 100)
returns table (
  visit_id uuid, user_id uuid, visitor_name text, join_code text,
  member_status text, started_at timestamptz, expected_return_at timestamptz,
  return_started_at timestamptz, checked_out_at timestamptz, attention_state text,
  participant_count bigint, creation_origin text, finalized_by_administration boolean
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (public.has_staff_permission('can_view_visitors') or public.has_staff_permission('can_confirm_returns')) then
    raise exception using errcode = '42501', message = 'Return access is required.';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 250 then raise exception using errcode = '22023', message = 'Invalid page size.'; end if;
  return query select visit.id, member.user_id,
    pg_catalog.concat_ws(' ', profile.first_name, profile.last_name), visit.join_code,
    member.member_status::text, visit.started_at, visit.expected_return_at,
    member.return_started_at, member.checked_out_at,
    case when member.checkout_method = 'staff' then 'administratively_completed'
      when member.member_status = 'returned_early' then 'early_return_completed'
      when member.member_status = 'returning_early' then 'early_return'
      when visit.expected_return_at < pg_catalog.clock_timestamp() then 'overdue'
      when visit.expected_return_at < pg_catalog.clock_timestamp() + interval '2 hours' then 'due_soon'
      else 'on_route' end,
    (select count(*) from public.visit_members as counted where counted.visit_id = visit.id
      and counted.member_status <> 'withdrawn_before_start'),
    visit.creation_origin, member.checkout_method = 'staff'
  from public.visit_members as member
  join public.visits as visit on visit.id = member.visit_id
  join public.profiles as profile on profile.id = member.user_id
  where (visit.status = 'in_progress' and member.member_status in ('active', 'returning_early', 'returned_early'))
    or (member.checkout_method = 'staff' and member.checked_out_at > pg_catalog.clock_timestamp() - interval '7 days')
  order by case when visit.status = 'in_progress' and visit.expected_return_at < pg_catalog.clock_timestamp()
    and member.member_status <> 'returned_early' then 0 when member.member_status = 'returning_early' then 1 else 2 end,
    coalesce(member.checked_out_at, visit.expected_return_at) desc, profile.first_name limit p_limit;
end;
$$;

create or replace function public.get_visitor_dashboard_stats(p_from timestamptz, p_to timestamptz)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if not public.has_staff_permission('can_view_visitors') then raise exception using errcode = '42501', message = 'Visitor access is required.'; end if;
  perform public.assert_admin_range(p_from, p_to);
  with visit_sizes as (
    select member.visit_id, count(*)::integer as participant_count from public.visit_members as member
    where member.member_status <> 'withdrawn_before_start' group by member.visit_id
  ), period_visits as (
    select visit.*, coalesce(size.participant_count, 0) as participant_count
    from public.visits as visit left join visit_sizes as size on size.visit_id = visit.id
    where coalesce(visit.started_at, visit.planned_start_at, visit.created_at) >= p_from
      and coalesce(visit.started_at, visit.planned_start_at, visit.created_at) < p_to
      and visit.status <> 'cancelled'
  ) select pg_catalog.jsonb_build_object(
    'visitors_registered', (select count(*) from public.profiles as profile
      where coalesce(profile.registered_at, profile.created_at) >= p_from
        and coalesce(profile.registered_at, profile.created_at) < p_to),
    'entries_registered', (select count(*) from public.visit_members as member join public.visits as visit on visit.id = member.visit_id
      where visit.started_at >= p_from and visit.started_at < p_to and member.member_status <> 'withdrawn_before_start'),
    'exits_registered', (select count(*) from public.visit_members as member join public.visits as visit on visit.id = member.visit_id
      where coalesce(member.checked_out_at, visit.completed_at) >= p_from and coalesce(member.checked_out_at, visit.completed_at) < p_to
        and member.member_status in ('returned_early', 'completed')),
    'currently_on_route', (select count(*) from public.visit_members as member join public.visits as visit on visit.id = member.visit_id
      where visit.status = 'in_progress' and member.member_status in ('active', 'returning_early')),
    'ascents_total', (select count(*) from period_visits),
    'ascents_group', (select count(*) from period_visits where participant_count > 1),
    'ascents_individual', (select count(*) from period_visits where participant_count = 1),
    'ascents_started', (select count(*) from public.visits where started_at >= p_from and started_at < p_to),
    'ascents_scheduled', (select count(*) from public.visits where status = 'forming' and planned_start_at >= p_from and planned_start_at < p_to),
    'ascents_completed', (select count(*) from public.visits where completed_at >= p_from and completed_at < p_to),
    'early_returns', (select count(*) from public.visit_members where member_status = 'returned_early' and checked_out_at >= p_from and checked_out_at < p_to),
    'pending_returns', (select count(*) from public.visit_members as member join public.visits as visit on visit.id = member.visit_id
      where visit.status = 'in_progress' and visit.expected_return_at < pg_catalog.clock_timestamp()
        and member.member_status in ('active', 'returning_early'))
  ) into result;
  return result;
end;
$$;

revoke all on function public.staff_find_visitor(text, text) from public, anon, authenticated;
revoke all on function public.staff_register_walk_in_visitor(text, text, text, date, text, text, text, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.staff_list_visitor_directory(text, integer) from public, anon, authenticated;
revoke all on function public.staff_create_administrative_visit(uuid[], uuid, public.visit_type, text, timestamptz, timestamptz, boolean, text) from public, anon, authenticated;
revoke all on function public.staff_start_administrative_visit(uuid) from public, anon, authenticated;
revoke all on function public.staff_register_administrative_return(uuid, uuid, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.staff_register_administrative_group_return(uuid, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.staff_find_visitor(text, text) to authenticated;
grant execute on function public.staff_register_walk_in_visitor(text, text, text, date, text, text, text, text, text, text, text, text) to authenticated;
grant execute on function public.staff_list_visitor_directory(text, integer) to authenticated;
grant execute on function public.staff_create_administrative_visit(uuid[], uuid, public.visit_type, text, timestamptz, timestamptz, boolean, text) to authenticated;
grant execute on function public.staff_start_administrative_visit(uuid) to authenticated;
grant execute on function public.staff_register_administrative_return(uuid, uuid, text, text, timestamptz) to authenticated;
grant execute on function public.staff_register_administrative_group_return(uuid, text, text, timestamptz) to authenticated;
grant execute on function public.staff_list_ascents(text, integer) to authenticated;
grant execute on function public.staff_list_return_controls(integer) to authenticated;
