-- Master PWA/Admin improvements. This migration is intentionally incremental:
-- existing visits, profiles, minors and media remain valid.

-- Guatemala department -------------------------------------------------------

alter table public.profiles
  add column if not exists department_code text;

alter table public.profiles
  drop constraint if exists profiles_department_code_valid;

alter table public.profiles
  add constraint profiles_department_code_valid check (
    department_code is null or department_code in (
      'alta_verapaz', 'baja_verapaz', 'chimaltenango', 'chiquimula',
      'el_progreso', 'escuintla', 'guatemala', 'huehuetenango', 'izabal',
      'jalapa', 'jutiapa', 'peten', 'quetzaltenango', 'quiche',
      'retalhuleu', 'sacatepequez', 'san_marcos', 'santa_rosa', 'solola',
      'suchitepequez', 'totonicapan', 'zacapa'
    )
  );

-- Existing Guatemalan profiles are deliberately not backfilled. The PWA
-- profile-completion gate asks their owners for the real value.

-- Versioned legal consent ----------------------------------------------------

create table public.user_consents (
  user_id uuid not null references auth.users(id) on delete cascade,
  terms_version text not null,
  privacy_version text not null,
  accepted_at timestamptz not null default now(),
  primary key (user_id, terms_version, privacy_version),
  constraint user_consents_terms_version_not_blank
    check (nullif(pg_catalog.btrim(terms_version), '') is not null),
  constraint user_consents_privacy_version_not_blank
    check (nullif(pg_catalog.btrim(privacy_version), '') is not null)
);

alter table public.user_consents enable row level security;
revoke all on table public.user_consents from public, anon, authenticated;

create policy user_consents_select_own
on public.user_consents for select to authenticated
using (user_id = (select auth.uid()));

create function public.get_my_consent_status(
  p_terms_version text default '1.0',
  p_privacy_version text default '1.0'
) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.user_consents as consent
    where consent.user_id = auth.uid()
      and consent.terms_version = p_terms_version
      and consent.privacy_version = p_privacy_version
  );
$$;

create function public.accept_current_legal_documents(
  p_terms_version text,
  p_privacy_version text
) returns timestamptz
language plpgsql volatile security definer set search_path = '' as $$
declare
  current_user_id uuid := auth.uid();
  acceptance_time timestamptz := pg_catalog.clock_timestamp();
begin
  if current_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;
  if p_terms_version <> '1.0' or p_privacy_version <> '1.0' then
    raise exception using errcode = '22023', message = 'Unsupported legal document version.';
  end if;
  insert into public.user_consents(user_id, terms_version, privacy_version, accepted_at)
  values(current_user_id, p_terms_version, p_privacy_version, acceptance_time)
  on conflict(user_id, terms_version, privacy_version) do nothing;
  return coalesce(
    (select accepted_at from public.user_consents
      where user_id = current_user_id
        and terms_version = p_terms_version
        and privacy_version = p_privacy_version),
    acceptance_time
  );
end;
$$;

revoke all on function public.get_my_consent_status(text, text)
from public, anon, authenticated;
revoke all on function public.accept_current_legal_documents(text, text)
from public, anon, authenticated;
grant execute on function public.get_my_consent_status(text, text) to authenticated;
grant execute on function public.accept_current_legal_documents(text, text) to authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id, first_name, last_name)
  values(
    new.id,
    new.raw_user_meta_data ->> 'first_name',
    new.raw_user_meta_data ->> 'last_name'
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

-- Minor consent and a bulk-safe atomic creation path ------------------------

alter table public.visit_minors
  add column if not exists responsibility_consent_version text,
  add column if not exists responsibility_consent_accepted_at timestamptz;

update public.visit_minors
set
  responsibility_consent_version = coalesce(responsibility_consent_version, 'legacy'),
  responsibility_consent_accepted_at = coalesce(responsibility_consent_accepted_at, created_at)
where responsibility_consent_accepted_at is null;

create function public.add_my_visit_minors(
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
      and profile.date_of_birth <= current_date - interval '18 years'
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

create function public.create_group_visit_with_minors(
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
  return query select created_visit_id, created_join_code;
end;
$$;

revoke all on function public.add_my_visit_minors(uuid, jsonb, boolean)
from public, anon, authenticated;
revoke all on function public.create_group_visit_with_minors(
  public.visit_type, timestamptz, timestamptz, boolean, text, boolean,
  boolean, text, jsonb, boolean
) from public, anon, authenticated;
grant execute on function public.add_my_visit_minors(uuid, jsonb, boolean)
to authenticated;
grant execute on function public.create_group_visit_with_minors(
  public.visit_type, timestamptz, timestamptz, boolean, text, boolean,
  boolean, text, jsonb, boolean
) to authenticated;

-- Gallery metadata and permissions ------------------------------------------

alter table public.route_media
  add column if not exists title_es text,
  add column if not exists title_en text,
  add column if not exists description_es text,
  add column if not exists description_en text,
  add column if not exists is_active boolean not null default true,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_at timestamptz not null default now();

update public.route_media
set title_es = coalesce(title_es, caption_es),
    title_en = coalesce(title_en, caption_en)
where title_es is null or title_en is null;

create trigger route_media_before_update_set_updated_at
before update on public.route_media for each row
execute function public.set_group_visit_updated_at();

alter table public.staff_permissions
  add column if not exists can_manage_gallery boolean not null default false,
  add column if not exists can_view_emergency_contacts boolean not null default false,
  add column if not exists invitation_status text not null default 'active';

alter table public.staff_permissions
  drop constraint if exists staff_permissions_invitation_status_valid;
alter table public.staff_permissions
  add constraint staff_permissions_invitation_status_valid
  check (invitation_status in ('pending', 'active', 'inactive'));

drop policy if exists route_media_select_for_active_routes on public.route_media;
create policy route_media_select_active_for_active_routes
on public.route_media for select to authenticated
using (
  is_active and exists (
    select 1 from public.routes as route
    where route.id = route_media.route_id and route.is_active
  )
);

grant insert, update, delete on table public.route_media to authenticated;

create policy route_media_insert_staff
on public.route_media for insert to authenticated
with check (public.has_staff_permission('can_manage_gallery'));
create policy route_media_update_staff
on public.route_media for update to authenticated
using (public.has_staff_permission('can_manage_gallery'))
with check (public.has_staff_permission('can_manage_gallery'));
create policy route_media_delete_staff
on public.route_media for delete to authenticated
using (public.has_staff_permission('can_manage_gallery'));

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values(
  'route-media', 'route-media', false, 5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict(id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy route_media_objects_read_authenticated
on storage.objects for select to authenticated
using (bucket_id = 'route-media');

create policy route_media_objects_insert_staff
on storage.objects for insert to authenticated
with check (
  bucket_id = 'route-media'
  and public.has_staff_permission('can_manage_gallery')
);
create policy route_media_objects_update_staff
on storage.objects for update to authenticated
using (
  bucket_id = 'route-media'
  and public.has_staff_permission('can_manage_gallery')
)
with check (
  bucket_id = 'route-media'
  and public.has_staff_permission('can_manage_gallery')
);
create policy route_media_objects_delete_staff
on storage.objects for delete to authenticated
using (
  bucket_id = 'route-media'
  and public.has_staff_permission('can_manage_gallery')
);

-- Invitation lifecycle -------------------------------------------------------

create function public.activate_my_staff_invitation()
returns boolean language plpgsql volatile security definer set search_path = '' as $$
declare current_user_id uuid := auth.uid();
begin
  if current_user_id is null then return false; end if;
  update public.staff_permissions as permission
  set is_active = true, invitation_status = 'active'
  where permission.user_id = current_user_id
    and permission.invitation_status = 'pending'
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
revoke all on function public.activate_my_staff_invitation()
from public, anon, authenticated;
grant execute on function public.activate_my_staff_invitation() to authenticated;

-- Operational status is derived from adult participants; minors inherit the
-- state of their responsible adult and never receive an independent action.

create function public.visit_operational_status(p_visit_id uuid)
returns text language sql stable security definer set search_path = '' as $$
  select case
    when visit.status = 'cancelled' then 'cancelled'
    when visit.status = 'completed' then 'completed'
    when visit.status = 'forming' and visit.planned_start_at is not null then 'scheduled'
    when visit.status = 'forming' then 'forming'
    when exists (
      select 1 from public.visit_members as returned
      where returned.visit_id = visit.id
        and returned.member_status in ('completed', 'returned_early')
    ) and exists (
      select 1 from public.visit_members as pending
      where pending.visit_id = visit.id
        and pending.member_status in ('active', 'returning_early')
    ) then 'pending_returns'
    when visit.status = 'in_progress' then 'in_progress'
    else visit.status::text
  end
  from public.visits as visit where visit.id = p_visit_id;
$$;
revoke all on function public.visit_operational_status(uuid)
from public, anon, authenticated;
grant execute on function public.visit_operational_status(uuid) to authenticated;

-- Extend the existing permission helpers without changing stored roles.

create or replace function public.has_staff_permission(permission_name text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  current_user_id uuid := auth.uid();
  current_role public.app_role;
  permission_allowed boolean := false;
begin
  if current_user_id is null then return false; end if;
  select role into current_role from public.user_roles where user_id = current_user_id;
  if current_role = 'admin' then return true; end if;
  if current_role <> 'visitor_manager' then return false; end if;
  select case permission_name
    when 'can_view_visitors' then permission.can_view_visitors
    when 'can_view_sensitive_data' then permission.can_view_sensitive_data
    when 'can_view_identity_documents' then permission.can_view_identity_documents
    when 'can_manage_visits' then permission.can_manage_visits
    when 'can_confirm_returns' then permission.can_confirm_returns
    when 'can_register_walk_in_visitors' then permission.can_register_walk_in_visitors
    when 'can_export_reports' then permission.can_export_reports
    when 'can_manage_announcements' then permission.can_manage_announcements
    when 'can_manage_notifications' then permission.can_manage_notifications
    when 'can_manage_route' then permission.can_manage_route
    when 'can_manage_gallery' then permission.can_manage_gallery
    when 'can_view_emergency_contacts' then permission.can_view_emergency_contacts
    when 'can_manage_users' then permission.can_manage_users
    when 'can_manage_staff' then permission.can_manage_staff
    else false end
  into permission_allowed
  from public.staff_permissions as permission
  where permission.user_id = current_user_id and permission.is_active;
  return coalesce(permission_allowed, false);
end;
$$;

create or replace function public.get_admin_session()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare current_user_id uuid := auth.uid(); result jsonb;
begin
  if current_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;
  select jsonb_build_object(
    'user_id', current_user_id,
    'email', auth_user.email,
    'first_name', profile.first_name,
    'last_name', profile.last_name,
    'role', role.role::text,
    'is_active', case when role.role = 'admin' then true else coalesce(permission.is_active, false) end,
    'invitation_status', case when role.role = 'admin' then 'active' else coalesce(permission.invitation_status, 'inactive') end,
    'permissions', jsonb_build_object(
      'can_view_visitors', role.role = 'admin' or coalesce(permission.can_view_visitors, false),
      'can_view_sensitive_data', role.role = 'admin' or coalesce(permission.can_view_sensitive_data, false),
      'can_view_identity_documents', role.role = 'admin' or coalesce(permission.can_view_identity_documents, false),
      'can_manage_visits', role.role = 'admin' or coalesce(permission.can_manage_visits, false),
      'can_confirm_returns', role.role = 'admin' or coalesce(permission.can_confirm_returns, false),
      'can_register_walk_in_visitors', role.role = 'admin' or coalesce(permission.can_register_walk_in_visitors, false),
      'can_export_reports', role.role = 'admin' or coalesce(permission.can_export_reports, false),
      'can_manage_announcements', role.role = 'admin' or coalesce(permission.can_manage_announcements, false),
      'can_manage_notifications', role.role = 'admin' or coalesce(permission.can_manage_notifications, false),
      'can_manage_route', role.role = 'admin' or coalesce(permission.can_manage_route, false),
      'can_manage_gallery', role.role = 'admin' or coalesce(permission.can_manage_gallery, false),
      'can_view_emergency_contacts', role.role = 'admin' or coalesce(permission.can_view_emergency_contacts, false),
      'can_manage_users', role.role = 'admin' or coalesce(permission.can_manage_users, false),
      'can_manage_staff', role.role = 'admin' or coalesce(permission.can_manage_staff, false)
    )
  ) into result
  from public.user_roles as role
  join auth.users as auth_user on auth_user.id = role.user_id
  left join public.profiles as profile on profile.id = role.user_id
  left join public.staff_permissions as permission on permission.user_id = role.user_id
  where role.user_id = current_user_id;
  if result is null then
    raise exception using errcode = '42501', message = 'Administrative role is required.';
  end if;
  return result;
end;
$$;

-- Administrative visitor registration with conditional department validation.
create function public.staff_register_walk_in_visitor(
  p_first_name text,
  p_last_name text,
  p_nationality_country_code text,
  p_date_of_birth date,
  p_phone text,
  p_alternate_phone text,
  p_document_type text,
  p_document_type_detail text,
  p_document_number text,
  p_emergency_first_name text,
  p_emergency_last_name text,
  p_emergency_relationship text,
  p_emergency_phone text,
  p_department_code text
) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare result jsonb; visitor_id uuid; normalized_country text := upper(pg_catalog.btrim(p_nationality_country_code));
begin
  if (normalized_country = 'GT' and p_department_code is null)
    or (normalized_country <> 'GT' and p_department_code is not null)
    or (p_department_code is not null and p_department_code not in (
      'alta_verapaz', 'baja_verapaz', 'chimaltenango', 'chiquimula',
      'el_progreso', 'escuintla', 'guatemala', 'huehuetenango', 'izabal',
      'jalapa', 'jutiapa', 'peten', 'quetzaltenango', 'quiche',
      'retalhuleu', 'sacatepequez', 'san_marcos', 'santa_rosa', 'solola',
      'suchitepequez', 'totonicapan', 'zacapa'
    )) then
    raise exception using errcode = '22023', message = 'A valid department is required only for Guatemala.';
  end if;
  result := public.staff_register_walk_in_visitor(
    p_first_name, p_last_name, p_nationality_country_code, p_date_of_birth,
    p_phone, p_alternate_phone, p_document_type, p_document_type_detail,
    p_document_number, p_emergency_first_name, p_emergency_last_name,
    p_emergency_relationship, p_emergency_phone
  );
  visitor_id := (result ->> 'visitor_id')::uuid;
  update public.profiles set department_code = p_department_code where id = visitor_id;
  return result || jsonb_build_object('department_code', p_department_code);
end;
$$;
revoke all on function public.staff_register_walk_in_visitor(
  text, text, text, date, text, text, text, text, text, text, text, text,
  text, text
) from public, anon, authenticated;
grant execute on function public.staff_register_walk_in_visitor(
  text, text, text, date, text, text, text, text, text, text, text, text,
  text, text
) to authenticated;

-- Emergency contacts are available to explicitly authorized staff only while
-- the visitor has a live operational context. Identity documents are not
-- returned by this RPC.
create function public.staff_get_operational_contacts(
  p_user_id uuid,
  p_context text default 'active_ascent'
) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare current_user_id uuid := auth.uid(); result jsonb; active_visit_id uuid;
begin
  if not public.has_staff_permission('can_view_emergency_contacts') then
    raise exception using errcode = '42501', message = 'Emergency contact access is required.';
  end if;
  select visit.id into active_visit_id
  from public.visit_members as member
  join public.visits as visit on visit.id = member.visit_id
  where member.user_id = p_user_id
    and visit.status = 'in_progress'
    and member.member_status in ('active', 'returning_early')
  order by visit.expected_return_at nulls last limit 1;
  if active_visit_id is null and not public.is_admin(current_user_id) then
    raise exception using errcode = '42501', message = 'Emergency contacts are available only during an active or pending return.';
  end if;
  select jsonb_build_object(
    'phone', profile.phone,
    'alternate_phone', profile.alternate_phone,
    'emergency_contact', case when contact.id is null then null else jsonb_build_object(
      'first_name', contact.first_name,
      'last_name', contact.last_name,
      'relationship', contact.relationship,
      'phone', contact.phone
    ) end,
    'visit_id', active_visit_id
  ) into result
  from public.profiles as profile
  left join public.emergency_contacts as contact on contact.user_id = profile.id
  where profile.id = p_user_id;
  if result is null then
    raise exception using errcode = 'P0002', message = 'Visitor was not found.';
  end if;
  insert into public.audit_logs(actor_user_id, action, target_type, target_id, metadata)
  values(current_user_id, 'emergency_contact_viewed', 'visitor', p_user_id::text,
    jsonb_build_object('visit_id', active_visit_id, 'context', coalesce(nullif(pg_catalog.btrim(p_context), ''), 'active_ascent')));
  return result;
end;
$$;
revoke all on function public.staff_get_operational_contacts(uuid, text)
from public, anon, authenticated;
grant execute on function public.staff_get_operational_contacts(uuid, text)
to authenticated;

