create type public.visit_status as enum (
  'forming',
  'in_progress',
  'completed',
  'cancelled'
);

create type public.visit_member_role as enum ('leader', 'member');

create table public.routes (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name_es text not null,
  name_en text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.routes (slug, name_es, name_en)
values ('ascenso-cima', 'Ascenso a la Cima', 'Summit Ascent');

create table public.visits (
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null references public.routes (id),
  created_by uuid not null references auth.users (id),
  join_code text not null unique,
  expected_duration_minutes integer not null,
  has_local_guide boolean not null default false,
  guide_name text,
  status public.visit_status not null default 'forming'::public.visit_status,
  started_at timestamptz,
  expected_return_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint visits_join_code_format check (join_code ~ '^[A-Z0-9]{6}$'),
  constraint visits_expected_duration_range check (
    expected_duration_minutes between 60 and 1440
  ),
  constraint visits_guide_name_required check (
    not has_local_guide
    or nullif(btrim(guide_name), '') is not null
  )
);

create table public.visit_members (
  visit_id uuid not null references public.visits (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  member_role public.visit_member_role not null,
  terms_accepted_at timestamptz not null,
  joined_at timestamptz not null default now(),
  primary key (visit_id, user_id)
);

-- The unique join_code constraint and primary keys already provide indexes for
-- those columns, so only the remaining lookup paths need explicit indexes.
create index visits_created_by_idx on public.visits (created_by);
create index visits_route_id_idx on public.visits (route_id);
create index visits_status_idx on public.visits (status);
create index visit_members_user_id_idx on public.visit_members (user_id);

create or replace function public.set_group_visit_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = pg_catalog.now();
  return new;
end;
$$;

revoke execute on function public.set_group_visit_updated_at()
from public, anon, authenticated;

create trigger routes_before_update_set_updated_at
before update on public.routes
for each row
execute function public.set_group_visit_updated_at();

create trigger visits_before_update_set_updated_at
before update on public.visits
for each row
execute function public.set_group_visit_updated_at();

alter table public.routes enable row level security;
alter table public.visits enable row level security;
alter table public.visit_members enable row level security;

revoke all on table public.routes from anon, authenticated;
revoke all on table public.visits from anon, authenticated;
revoke all on table public.visit_members from anon, authenticated;

grant select on table public.routes to authenticated;
grant select on table public.visits to authenticated;
grant select on table public.visit_members to authenticated;

create or replace function public.is_current_user_visit_member(
  requested_visit_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.visit_members as member
    where member.visit_id = requested_visit_id
      and member.user_id = (select auth.uid())
  );
$$;

revoke all on function public.is_current_user_visit_member(uuid)
from public, anon, authenticated;
grant execute on function public.is_current_user_visit_member(uuid)
to authenticated;

create policy routes_select_active
on public.routes
for select
to authenticated
using (is_active);

create policy visits_select_for_members
on public.visits
for select
to authenticated
using (public.is_current_user_visit_member(id));

create policy visit_members_select_for_members
on public.visit_members
for select
to authenticated
using (public.is_current_user_visit_member(visit_id));

create or replace function public.assert_group_visit_eligibility(
  requested_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
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

revoke all on function public.assert_group_visit_eligibility(uuid)
from public, anon, authenticated;

create or replace function public.assert_no_active_group_visit(
  requested_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Serialize create/join attempts for the same user to prevent concurrent
  -- requests from bypassing the active-visit check.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(requested_user_id::text, 0)
  );

  if exists (
    select 1
    from public.visit_members as member
    join public.visits as visit on visit.id = member.visit_id
    where member.user_id = requested_user_id
      and visit.status in (
        'forming'::public.visit_status,
        'in_progress'::public.visit_status
      )
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'You already belong to an active group visit.';
  end if;
end;
$$;

revoke all on function public.assert_no_active_group_visit(uuid)
from public, anon, authenticated;

create or replace function public.generate_group_join_code()
returns text
language sql
volatile
security invoker
set search_path = ''
as $$
  select pg_catalog.upper(
    pg_catalog.substr(
      pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', ''),
      1,
      6
    )
  );
$$;

revoke all on function public.generate_group_join_code()
from public, anon, authenticated;

create or replace function public.create_group_visit(
  expected_duration_minutes integer,
  has_local_guide boolean,
  guide_name text,
  terms_accepted boolean
)
returns table (visit_id uuid, join_code text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  default_route_id uuid;
  new_visit_id uuid;
  new_join_code text;
  normalized_guide_name text;
  attempt integer;
begin
  if current_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'Authentication is required.';
  end if;

  if coalesce(terms_accepted, false) is not true then
    raise exception using
      errcode = '23514',
      message = 'You must accept the group visit terms.';
  end if;

  if expected_duration_minutes is null
    or expected_duration_minutes < 60
    or expected_duration_minutes > 1440 then
    raise exception using
      errcode = '22023',
      message = 'Expected duration must be between 60 and 1440 minutes.';
  end if;

  if coalesce(has_local_guide, false) then
    normalized_guide_name := nullif(pg_catalog.btrim(guide_name), '');
    if normalized_guide_name is null then
      raise exception using
        errcode = '23514',
        message = 'Guide name is required when the group has a local guide.';
    end if;
  else
    normalized_guide_name := null;
  end if;

  perform public.assert_group_visit_eligibility(current_user_id);
  perform public.assert_no_active_group_visit(current_user_id);

  select route.id
  into default_route_id
  from public.routes as route
  where route.slug = 'ascenso-cima'
    and route.is_active;

  if default_route_id is null then
    raise exception using
      errcode = 'P0002',
      message = 'The default summit route is not available.';
  end if;

  for attempt in 1..10 loop
    new_join_code := public.generate_group_join_code();

    begin
      insert into public.visits (
        route_id,
        created_by,
        join_code,
        expected_duration_minutes,
        has_local_guide,
        guide_name,
        status
      )
      values (
        default_route_id,
        current_user_id,
        new_join_code,
        expected_duration_minutes,
        coalesce(has_local_guide, false),
        normalized_guide_name,
        'forming'::public.visit_status
      )
      returning id into new_visit_id;

      exit;
    exception
      when unique_violation then
        if attempt = 10 then
          raise exception using
            errcode = 'P0001',
            message = 'Could not generate a unique group join code.';
        end if;
    end;
  end loop;

  insert into public.visit_members (
    visit_id,
    user_id,
    member_role,
    terms_accepted_at
  )
  values (
    new_visit_id,
    current_user_id,
    'leader'::public.visit_member_role,
    pg_catalog.now()
  );

  return query select new_visit_id, new_join_code;
end;
$$;

revoke all on function public.create_group_visit(integer, boolean, text, boolean)
from public, anon, authenticated;
grant execute on function public.create_group_visit(integer, boolean, text, boolean)
to authenticated;

create or replace function public.join_group_visit(
  join_code text,
  terms_accepted boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  requested_visit_id uuid;
  requested_visit_status public.visit_status;
begin
  if current_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'Authentication is required.';
  end if;

  if coalesce($2, false) is not true then
    raise exception using
      errcode = '23514',
      message = 'You must accept the group visit terms.';
  end if;

  if nullif(pg_catalog.btrim($1), '') is null then
    raise exception using
      errcode = '22023',
      message = 'A join code is required.';
  end if;

  perform public.assert_group_visit_eligibility(current_user_id);
  perform public.assert_no_active_group_visit(current_user_id);

  select visit.id, visit.status
  into requested_visit_id, requested_visit_status
  from public.visits as visit
  where visit.join_code = pg_catalog.upper(pg_catalog.btrim($1))
  for update;

  if requested_visit_id is null then
    raise exception using
      errcode = 'P0002',
      message = 'Group visit code not found.';
  end if;

  if requested_visit_status <> 'forming'::public.visit_status then
    raise exception using
      errcode = 'P0001',
      message = 'This group visit is no longer accepting members.';
  end if;

  insert into public.visit_members (
    visit_id,
    user_id,
    member_role,
    terms_accepted_at
  )
  values (
    requested_visit_id,
    current_user_id,
    'member'::public.visit_member_role,
    pg_catalog.now()
  );

  return requested_visit_id;
end;
$$;

revoke all on function public.join_group_visit(text, boolean)
from public, anon, authenticated;
grant execute on function public.join_group_visit(text, boolean)
to authenticated;

create or replace function public.start_group_visit(visit_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  current_visit_status public.visit_status;
  duration_minutes integer;
  start_time timestamptz;
begin
  if current_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'Authentication is required.';
  end if;

  if not exists (
    select 1
    from public.visit_members as member
    where member.visit_id = $1
      and member.user_id = current_user_id
      and member.member_role = 'leader'::public.visit_member_role
  ) then
    raise exception using
      errcode = '42501',
      message = 'Only the group leader can start this visit.';
  end if;

  select visit.status, visit.expected_duration_minutes
  into current_visit_status, duration_minutes
  from public.visits as visit
  where visit.id = $1
  for update;

  if current_visit_status <> 'forming'::public.visit_status then
    raise exception using
      errcode = 'P0001',
      message = 'Only a forming group visit can be started.';
  end if;

  start_time := pg_catalog.clock_timestamp();

  update public.visits
  set
    status = 'in_progress'::public.visit_status,
    started_at = start_time,
    expected_return_at = start_time + duration_minutes * interval '1 minute'
  where id = $1;

  return $1;
end;
$$;

revoke all on function public.start_group_visit(uuid)
from public, anon, authenticated;
grant execute on function public.start_group_visit(uuid)
to authenticated;

create or replace function public.complete_group_visit(visit_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  current_visit_status public.visit_status;
begin
  if current_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'Authentication is required.';
  end if;

  if not exists (
    select 1
    from public.visit_members as member
    where member.visit_id = $1
      and member.user_id = current_user_id
      and member.member_role = 'leader'::public.visit_member_role
  ) then
    raise exception using
      errcode = '42501',
      message = 'Only the group leader can complete this visit.';
  end if;

  select visit.status
  into current_visit_status
  from public.visits as visit
  where visit.id = $1
  for update;

  if current_visit_status <> 'in_progress'::public.visit_status then
    raise exception using
      errcode = 'P0001',
      message = 'Only an in-progress group visit can be completed.';
  end if;

  update public.visits
  set
    status = 'completed'::public.visit_status,
    completed_at = pg_catalog.clock_timestamp()
  where id = $1;

  return $1;
end;
$$;

revoke all on function public.complete_group_visit(uuid)
from public, anon, authenticated;
grant execute on function public.complete_group_visit(uuid)
to authenticated;

create or replace function public.cancel_group_visit(visit_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  current_visit_status public.visit_status;
begin
  if current_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'Authentication is required.';
  end if;

  if not exists (
    select 1
    from public.visit_members as member
    where member.visit_id = $1
      and member.user_id = current_user_id
      and member.member_role = 'leader'::public.visit_member_role
  ) then
    raise exception using
      errcode = '42501',
      message = 'Only the group leader can cancel this visit.';
  end if;

  select visit.status
  into current_visit_status
  from public.visits as visit
  where visit.id = $1
  for update;

  if current_visit_status <> 'forming'::public.visit_status then
    raise exception using
      errcode = 'P0001',
      message = 'Only a forming group visit can be cancelled.';
  end if;

  update public.visits
  set status = 'cancelled'::public.visit_status
  where id = $1;

  return $1;
end;
$$;

revoke all on function public.cancel_group_visit(uuid)
from public, anon, authenticated;
grant execute on function public.cancel_group_visit(uuid)
to authenticated;
