create or replace function public.is_current_user_email_verified()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from auth.users as account
    where account.id = (select auth.uid())
      and account.email_confirmed_at is not null
  );
$$;

-- This helper is intentionally internal. The visit RPCs execute it as their
-- owner and expose only the controlled error below, never auth.users data.
revoke all on function public.is_current_user_email_verified()
from public, anon, authenticated, service_role;

create or replace function public.create_group_visit(
  p_visit_type public.visit_type,
  p_expected_return_at timestamptz,
  p_has_local_guide boolean,
  p_guide_name text,
  p_terms_accepted boolean
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

  if p_visit_type is null then
    raise exception using
      errcode = '22023',
      message = 'A group visit type is required.';
  end if;

  if p_expected_return_at is null
    or p_expected_return_at <= pg_catalog.clock_timestamp() then
    raise exception using
      errcode = '22023',
      message = 'Expected return time must be in the future.';
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
        visit_type,
        expected_return_at,
        has_local_guide,
        guide_name,
        status
      )
      values (
        default_route_id,
        current_user_id,
        new_join_code,
        p_visit_type,
        p_expected_return_at,
        coalesce(p_has_local_guide, false),
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
    pg_catalog.clock_timestamp()
  );

  return query
  select new_visit_id, new_join_code;
end;
$$;

revoke all on function public.create_group_visit(
  public.visit_type,
  timestamptz,
  boolean,
  text,
  boolean
)
from public, anon, authenticated;
grant execute on function public.create_group_visit(
  public.visit_type,
  timestamptz,
  boolean,
  text,
  boolean
)
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

  if not public.is_current_user_email_verified() then
    raise exception using
      errcode = 'P0001',
      message = 'email_not_verified';
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
