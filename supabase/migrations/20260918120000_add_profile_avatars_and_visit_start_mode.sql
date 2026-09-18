alter table public.profiles
  add column avatar_kind text,
  add column avatar_path text,
  add column avatar_preset text,
  add constraint profiles_avatar_kind_valid check (
    avatar_kind is null
    or avatar_kind in ('uploaded', 'preset', 'initials')
  ),
  add constraint profiles_avatar_consistent check (
    avatar_kind is null
    or (avatar_kind = 'uploaded' and nullif(btrim(avatar_path), '') is not null and avatar_preset is null)
    or (avatar_kind = 'preset' and avatar_path is null and nullif(btrim(avatar_preset), '') is not null)
    or (avatar_kind = 'initials' and avatar_path is null and avatar_preset is null)
  );

grant update (
  first_name,
  last_name,
  avatar_kind,
  avatar_path,
  avatar_preset
) on table public.profiles to authenticated;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'avatars',
  'avatars',
  false,
  2097152,
  array['image/webp']::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy avatars_insert_own_file
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'avatars'
  and name = (select auth.uid())::text || '/avatar.webp'
);

create policy avatars_update_own_file
on storage.objects
for update
to authenticated
using (
  bucket_id = 'avatars'
  and name = (select auth.uid())::text || '/avatar.webp'
)
with check (
  bucket_id = 'avatars'
  and name = (select auth.uid())::text || '/avatar.webp'
);

create policy avatars_delete_own_file
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'avatars'
  and name = (select auth.uid())::text || '/avatar.webp'
);

create policy avatars_select_group_members
on storage.objects
for select
to authenticated
using (
  bucket_id = 'avatars'
  and (
    name = (select auth.uid())::text || '/avatar.webp'
    or exists (
      select 1
      from public.visit_members as own_membership
      join public.visit_members as represented_membership
        on represented_membership.visit_id = own_membership.visit_id
      where own_membership.user_id = (select auth.uid())
        and split_part(storage.objects.name, '/', 1) =
          represented_membership.user_id::text
    )
  )
);

alter table public.visits
  add column start_mode text not null default 'scheduled',
  add constraint visits_start_mode_valid check (
    start_mode in ('now', 'scheduled')
  );

drop function public.create_group_visit(
  public.visit_type,
  timestamptz,
  timestamptz,
  boolean,
  text,
  boolean,
  boolean
);

create function public.create_group_visit(
  p_visit_type public.visit_type,
  p_planned_start_at timestamptz,
  p_expected_return_at timestamptz,
  p_has_local_guide boolean,
  p_guide_name text,
  p_terms_accepted boolean,
  p_recommendations_accepted boolean,
  p_start_mode text default 'now'
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
  normalized_start_mode text := pg_catalog.lower(pg_catalog.btrim(p_start_mode));
  request_time timestamptz := pg_catalog.clock_timestamp();
  resolved_planned_start_at timestamptz;
begin
  if current_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'Authentication is required.';
  end if;

  if not public.is_current_user_email_verified() then
    raise exception using
      errcode = 'P0001',
      message = 'email_not_verified';
  end if;

  if coalesce(p_terms_accepted, false) is not true then
    raise exception using
      errcode = '23514',
      message = 'You must accept the group visit terms.';
  end if;

  if coalesce(p_recommendations_accepted, false) is not true then
    raise exception using
      errcode = '23514',
      message = 'You must accept the ascent recommendations.';
  end if;

  if p_visit_type is null then
    raise exception using
      errcode = '22023',
      message = 'A group visit type is required.';
  end if;

  if normalized_start_mode not in ('now', 'scheduled') then
    raise exception using
      errcode = '22023',
      message = 'Start mode must be now or scheduled.';
  end if;

  if normalized_start_mode = 'now' then
    resolved_planned_start_at := request_time;
  else
    if p_planned_start_at is null then
      raise exception using
        errcode = '22023',
        message = 'A planned start time is required.';
    end if;

    if p_planned_start_at <= request_time then
      raise exception using
        errcode = '22023',
        message = 'A scheduled start time must be in the future.';
    end if;

    resolved_planned_start_at := p_planned_start_at;
  end if;

  if p_expected_return_at is null or p_expected_return_at <= request_time then
    raise exception using
      errcode = '22023',
      message = 'Expected return time must be in the future.';
  end if;

  if resolved_planned_start_at >= p_expected_return_at then
    raise exception using
      errcode = '22023',
      message = 'Planned start time must be before expected return time.';
  end if;

  if coalesce(p_has_local_guide, false) then
    normalized_guide_name := nullif(pg_catalog.btrim(p_guide_name), '');
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
  where route.slug = 'ascenso-a-la-cima'
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
        visit_type,
        start_mode,
        planned_start_at,
        expected_return_at,
        has_local_guide,
        guide_name,
        recommendations_accepted_at,
        recommendations_version,
        status
      )
      values (
        default_route_id,
        current_user_id,
        new_join_code,
        p_visit_type,
        normalized_start_mode,
        resolved_planned_start_at,
        p_expected_return_at,
        coalesce(p_has_local_guide, false),
        normalized_guide_name,
        pg_catalog.clock_timestamp(),
        'v1',
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
    pg_catalog.clock_timestamp()
  );

  return query select new_visit_id, new_join_code;
end;
$$;

revoke all on function public.create_group_visit(
  public.visit_type,
  timestamptz,
  timestamptz,
  boolean,
  text,
  boolean,
  boolean,
  text
)
from public, anon, authenticated;
grant execute on function public.create_group_visit(
  public.visit_type,
  timestamptz,
  timestamptz,
  boolean,
  text,
  boolean,
  boolean,
  text
)
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
  selected_expected_return_at timestamptz;
  selected_start_mode text;
  selected_planned_start_at timestamptz;
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

  select
    visit.status,
    visit.expected_return_at,
    visit.start_mode,
    visit.planned_start_at
  into
    current_visit_status,
    selected_expected_return_at,
    selected_start_mode,
    selected_planned_start_at
  from public.visits as visit
  where visit.id = $1
  for update;

  if current_visit_status <> 'forming'::public.visit_status then
    raise exception using
      errcode = 'P0001',
      message = 'Only a forming group visit can be started.';
  end if;

  start_time := pg_catalog.clock_timestamp();

  if selected_start_mode = 'scheduled'
    and selected_planned_start_at > start_time then
    raise exception using
      errcode = 'P0001',
      message = 'scheduled_start_not_reached';
  end if;

  if selected_expected_return_at is null
    or selected_expected_return_at <= start_time then
    raise exception using
      errcode = '22023',
      message = 'Expected return time must be after the visit starts.';
  end if;

  update public.visits
  set
    status = 'in_progress'::public.visit_status,
    started_at = start_time
  where id = $1;

  return $1;
end;
$$;

revoke all on function public.start_group_visit(uuid)
from public, anon, authenticated;
grant execute on function public.start_group_visit(uuid)
to authenticated;

drop function public.get_group_visit_details(uuid);

create function public.get_group_visit_details(p_visit_id uuid)
returns table (
  visit_id uuid,
  route_id uuid,
  route_name_es text,
  route_name_en text,
  status public.visit_status,
  join_code text,
  visit_type public.visit_type,
  start_mode text,
  has_local_guide boolean,
  guide_name text,
  planned_start_at timestamptz,
  started_at timestamptz,
  expected_return_at timestamptz,
  completed_at timestamptz,
  created_by uuid,
  participants jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'Authentication is required.';
  end if;

  if p_visit_id is null
    or not public.is_current_user_visit_member(p_visit_id) then
    raise exception using
      errcode = '42501',
      message = 'Access to this group visit is denied.';
  end if;

  return query
  select
    visit.id,
    visit.route_id,
    route.name_es,
    route.name_en,
    visit.status,
    case when visit.status = 'forming'::public.visit_status
      then visit.join_code else null end,
    visit.visit_type,
    visit.start_mode,
    visit.has_local_guide,
    visit.guide_name,
    visit.planned_start_at,
    visit.started_at,
    visit.expected_return_at,
    visit.completed_at,
    visit.created_by,
    (
      select coalesce(
        pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'user_id', member.user_id,
            'first_name', profile.first_name,
            'last_name', profile.last_name,
            'avatar_kind', profile.avatar_kind,
            'avatar_path', profile.avatar_path,
            'avatar_preset', profile.avatar_preset,
            'member_role', member.member_role,
            'member_status', member.member_status,
            'joined_at', member.joined_at,
            'return_started_at', member.return_started_at,
            'checked_out_at', member.checked_out_at
          )
          order by
            (member.member_role = 'leader'::public.visit_member_role) desc,
            member.joined_at,
            member.user_id
        ),
        '[]'::jsonb
      )
      from public.visit_members as member
      join public.profiles as profile on profile.id = member.user_id
      where member.visit_id = visit.id
    )
  from public.visits as visit
  join public.routes as route on route.id = visit.route_id
  where visit.id = p_visit_id;
end;
$$;

revoke all on function public.get_group_visit_details(uuid)
from public, anon, authenticated;
grant execute on function public.get_group_visit_details(uuid)
to authenticated;
