-- Follow-up kept incremental because the preceding migration may already be
-- present in a local development database.
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
  if not (public.has_staff_permission('can_register_walk_in_visitors') or public.has_staff_permission('can_manage_visits')) then
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
  order by profile.created_at limit 1;
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
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(normalized_type || ':' || normalized_number, 0));
  select profile.id into existing_id from public.profiles as profile
  where profile.document_type::text = normalized_type
    and pg_catalog.upper(pg_catalog.regexp_replace(profile.document_number, '\s+', '', 'g')) = normalized_number
  limit 1;
  if existing_id is not null then
    raise exception using errcode = '23505', message = 'A visitor with this identity document already exists.';
  end if;
  insert into public.profiles (
    id, first_name, last_name, nationality_country_code, date_of_birth,
    phone, alternate_phone, document_type, document_number,
    registration_origin, registered_by, registered_at
  ) values (
    new_visitor_id, normalized_first_name, normalized_last_name, normalized_country,
    p_date_of_birth, nullif(pg_catalog.btrim(p_phone), ''), nullif(pg_catalog.btrim(p_alternate_phone), ''),
    normalized_type::public.document_type, pg_catalog.btrim(p_document_number),
    'administrative', current_user_id, request_time
  );
  insert into public.emergency_contacts (user_id, first_name, last_name, relationship, phone)
  values (new_visitor_id, pg_catalog.btrim(p_emergency_first_name), pg_catalog.btrim(p_emergency_last_name),
    pg_catalog.btrim(p_emergency_relationship), pg_catalog.btrim(p_emergency_phone));
  insert into public.audit_logs (actor_user_id, action, target_type, target_id, metadata)
  values (current_user_id, 'administrative_visitor_created', 'visitor', new_visitor_id::text,
    pg_catalog.jsonb_build_object('origin', 'administrative'));
  return pg_catalog.jsonb_build_object(
    'visitor_id', new_visitor_id, 'first_name', normalized_first_name,
    'last_name', normalized_last_name, 'registration_origin', 'administrative',
    'registered_at', request_time
  );
end;
$$;

revoke all on function public.staff_find_visitor(text, text) from public, anon, authenticated;
revoke all on function public.staff_register_walk_in_visitor(text, text, text, date, text, text, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.staff_find_visitor(text, text) to authenticated;
grant execute on function public.staff_register_walk_in_visitor(text, text, text, date, text, text, text, text, text, text, text, text) to authenticated;
