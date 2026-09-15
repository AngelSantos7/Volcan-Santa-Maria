create type public.visit_member_status as enum (
  'active',
  'withdrawn_before_start',
  'returning_early',
  'returned_early',
  'completed'
);

alter table public.visit_members
add column member_status public.visit_member_status not null
  default 'active'::public.visit_member_status,
add column return_started_at timestamptz,
add column exit_reason text,
add column exit_notes text,
add column checked_out_at timestamptz,
add column checkout_method text,
add column checked_out_by uuid references auth.users (id),
add constraint visit_members_exit_reason_allowed check (
  exit_reason is null
  or exit_reason in (
    'physical_discomfort',
    'injury',
    'emergency',
    'personal_decision',
    'other'
  )
),
add constraint visit_members_exit_notes_length check (
  exit_notes is null
  or pg_catalog.char_length(exit_notes) <= 1000
),
add constraint visit_members_checkout_method_allowed check (
  checkout_method is null
  or checkout_method in ('self', 'staff')
),
add constraint visit_members_return_state_consistent check (
  (
    member_status in (
      'active'::public.visit_member_status,
      'withdrawn_before_start'::public.visit_member_status,
      'completed'::public.visit_member_status
    )
    and return_started_at is null
    and exit_reason is null
    and exit_notes is null
    and checked_out_at is null
    and checkout_method is null
    and checked_out_by is null
  )
  or (
    member_status = 'returning_early'::public.visit_member_status
    and return_started_at is not null
    and nullif(pg_catalog.btrim(exit_reason), '') is not null
    and checked_out_at is null
    and checkout_method is null
    and checked_out_by is null
  )
  or (
    member_status = 'returned_early'::public.visit_member_status
    and return_started_at is not null
    and nullif(pg_catalog.btrim(exit_reason), '') is not null
    and checked_out_at is not null
    and checked_out_at >= return_started_at
    and (
      (checkout_method = 'self' and checked_out_by is null)
      or (checkout_method = 'staff' and checked_out_by is not null)
    )
  )
);

create index visit_members_visit_status_idx
on public.visit_members (visit_id, member_status);

-- The previous table-level SELECT grant would automatically expose the newly
-- added reason and notes columns. Keep the existing RLS policy, but restrict
-- authenticated reads to the non-sensitive membership fields.
revoke select on table public.visit_members from authenticated;
grant select (
  visit_id,
  user_id,
  member_role,
  terms_accepted_at,
  joined_at,
  member_status,
  return_started_at,
  checked_out_at
)
on table public.visit_members
to authenticated;

create or replace function public.assert_no_active_group_visit(
  requested_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(requested_user_id::text, 0)
  );

  if exists (
    select 1
    from public.visit_members as member
    join public.visits as visit on visit.id = member.visit_id
    where member.user_id = requested_user_id
      and (
        member.member_status in (
          'active'::public.visit_member_status,
          'returning_early'::public.visit_member_status
        )
        or (
          member.member_role = 'leader'::public.visit_member_role
          and member.member_status =
            'returned_early'::public.visit_member_status
        )
      )
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

create or replace function public.get_my_active_group_visit()
returns table (
  visit_id uuid,
  status public.visit_status
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

  return query
  select
    visit.id as visit_id,
    visit.status
  from public.visit_members as member
  join public.visits as visit on visit.id = member.visit_id
  where member.user_id = current_user_id
    and (
      member.member_status in (
        'active'::public.visit_member_status,
        'returning_early'::public.visit_member_status
      )
      or (
        member.member_role = 'leader'::public.visit_member_role
        and member.member_status =
          'returned_early'::public.visit_member_status
      )
    )
    and visit.status in (
      'forming'::public.visit_status,
      'in_progress'::public.visit_status
    )
  order by
    (visit.status = 'in_progress'::public.visit_status) desc,
    visit.created_at desc,
    visit.id
  limit 1;
end;
$$;

revoke all on function public.get_my_active_group_visit()
from public, anon, authenticated;
grant execute on function public.get_my_active_group_visit()
to authenticated;

create or replace function public.withdraw_from_group(
  p_visit_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  current_visit_status public.visit_status;
  affected_rows integer;
begin
  if current_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'Authentication is required.';
  end if;

  if not exists (
    select 1
    from public.visit_members as member
    where member.visit_id = p_visit_id
      and member.user_id = current_user_id
      and member.member_role = 'member'::public.visit_member_role
      and member.member_status = 'active'::public.visit_member_status
  ) then
    raise exception using
      errcode = '42501',
      message = 'Only an active non-organizer member can withdraw.';
  end if;

  select visit.status
  into current_visit_status
  from public.visits as visit
  where visit.id = p_visit_id
  for update;

  if current_visit_status <> 'forming'::public.visit_status then
    raise exception using
      errcode = 'P0001',
      message = 'A member can withdraw only while the visit is forming.';
  end if;

  update public.visit_members as member
  set member_status = 'withdrawn_before_start'::public.visit_member_status
  where member.visit_id = p_visit_id
    and member.user_id = current_user_id
    and member.member_role = 'member'::public.visit_member_role
    and member.member_status = 'active'::public.visit_member_status;

  get diagnostics affected_rows = row_count;
  if affected_rows <> 1 then
    raise exception using
      errcode = '42501',
      message = 'Only an active non-organizer member can withdraw.';
  end if;

  return current_user_id;
end;
$$;

revoke all on function public.withdraw_from_group(uuid)
from public, anon, authenticated;
grant execute on function public.withdraw_from_group(uuid)
to authenticated;

create or replace function public.remove_member_before_start(
  p_visit_id uuid,
  p_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  current_visit_status public.visit_status;
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
      message = 'The organizer cannot remove themselves with this action.';
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
      message = 'Only the active group organizer can remove a member.';
  end if;

  if current_visit_status <> 'forming'::public.visit_status then
    raise exception using
      errcode = 'P0001',
      message = 'Members can be removed only while the visit is forming.';
  end if;

  update public.visit_members as member
  set member_status = 'withdrawn_before_start'::public.visit_member_status
  where member.visit_id = p_visit_id
    and member.user_id = p_user_id
    and member.member_role = 'member'::public.visit_member_role
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

revoke all on function public.remove_member_before_start(uuid, uuid)
from public, anon, authenticated;
grant execute on function public.remove_member_before_start(uuid, uuid)
to authenticated;

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

revoke all on function public.start_early_return(uuid, text, text)
from public, anon, authenticated;
grant execute on function public.start_early_return(uuid, text, text)
to authenticated;

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

revoke all on function public.mark_member_returning_early(uuid, uuid, text, text)
from public, anon, authenticated;
grant execute on function public.mark_member_returning_early(uuid, uuid, text, text)
to authenticated;

create or replace function public.confirm_my_early_checkout(
  p_visit_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  affected_rows integer;
begin
  if current_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'Authentication is required.';
  end if;

  update public.visit_members as member
  set
    member_status = 'returned_early'::public.visit_member_status,
    checked_out_at = pg_catalog.clock_timestamp(),
    checkout_method = 'self',
    checked_out_by = null
  where member.visit_id = p_visit_id
    and member.user_id = current_user_id
    and member.member_status = 'returning_early'::public.visit_member_status;

  get diagnostics affected_rows = row_count;
  if affected_rows <> 1 then
    raise exception using
      errcode = '42501',
      message = 'Only the returning participant can confirm their checkout.';
  end if;

  return current_user_id;
end;
$$;

revoke all on function public.confirm_my_early_checkout(uuid)
from public, anon, authenticated;
grant execute on function public.confirm_my_early_checkout(uuid)
to authenticated;

create or replace function public.confirm_member_checkout_by_admin(
  p_visit_id uuid,
  p_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  affected_rows integer;
begin
  if current_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'Authentication is required.';
  end if;

  if not exists (
    select 1
    from public.user_roles as user_role
    where user_role.user_id = current_user_id
      and user_role.role = 'admin'::public.app_role
  ) then
    raise exception using
      errcode = '42501',
      message = 'Administrator access is required.';
  end if;

  update public.visit_members as member
  set
    member_status = 'returned_early'::public.visit_member_status,
    checked_out_at = pg_catalog.clock_timestamp(),
    checkout_method = 'staff',
    checked_out_by = current_user_id
  where member.visit_id = p_visit_id
    and member.user_id = p_user_id
    and member.member_status = 'returning_early'::public.visit_member_status;

  get diagnostics affected_rows = row_count;
  if affected_rows <> 1 then
    raise exception using
      errcode = 'P0001',
      message = 'The requested returning member was not found.';
  end if;

  return p_user_id;
end;
$$;

revoke all on function public.confirm_member_checkout_by_admin(uuid, uuid)
from public, anon, authenticated;
grant execute on function public.confirm_member_checkout_by_admin(uuid, uuid)
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
  completion_time timestamptz;
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

  completion_time := pg_catalog.clock_timestamp();

  update public.visit_members as member
  set member_status = 'completed'::public.visit_member_status
  where member.visit_id = $1
    and member.member_status = 'active'::public.visit_member_status;

  update public.visits
  set
    status = 'completed'::public.visit_status,
    completed_at = completion_time
  where id = $1;

  return $1;
end;
$$;

revoke all on function public.complete_group_visit(uuid)
from public, anon, authenticated;
grant execute on function public.complete_group_visit(uuid)
to authenticated;

create or replace function public.get_group_visit_details(
  p_visit_id uuid
)
returns table (
  visit_id uuid,
  route_id uuid,
  route_name_es text,
  route_name_en text,
  status public.visit_status,
  join_code text,
  visit_type public.visit_type,
  has_local_guide boolean,
  guide_name text,
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
    visit.id as visit_id,
    visit.route_id,
    route.name_es as route_name_es,
    route.name_en as route_name_en,
    visit.status,
    case
      when visit.status = 'forming'::public.visit_status
        then visit.join_code
      else null
    end as join_code,
    visit.visit_type,
    visit.has_local_guide,
    visit.guide_name,
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
    ) as participants
  from public.visits as visit
  join public.routes as route on route.id = visit.route_id
  where visit.id = p_visit_id;
end;
$$;

revoke all on function public.get_group_visit_details(uuid)
from public, anon, authenticated;
grant execute on function public.get_group_visit_details(uuid)
to authenticated;

create or replace function public.get_my_visit_history(
  p_limit integer default 20,
  p_offset integer default 0
)
returns table (
  visit_id uuid,
  visit_date timestamptz,
  visit_type public.visit_type,
  visit_status public.visit_status,
  route_name_es text,
  route_name_en text,
  member_role public.visit_member_role,
  member_status public.visit_member_status,
  started_at timestamptz,
  expected_return_at timestamptz,
  completed_at timestamptz,
  return_started_at timestamptz,
  checked_out_at timestamptz,
  participant_count bigint
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

  if p_limit is null or p_limit < 1 or p_limit > 50 then
    raise exception using
      errcode = '22023',
      message = 'History page size must be between 1 and 50.';
  end if;

  if p_offset is null or p_offset < 0 then
    raise exception using
      errcode = '22023',
      message = 'History offset cannot be negative.';
  end if;

  return query
  select
    visit.id as visit_id,
    coalesce(visit.started_at, visit.created_at) as visit_date,
    visit.visit_type,
    visit.status as visit_status,
    route.name_es as route_name_es,
    route.name_en as route_name_en,
    own_membership.member_role,
    own_membership.member_status,
    visit.started_at,
    visit.expected_return_at,
    visit.completed_at,
    own_membership.return_started_at,
    own_membership.checked_out_at,
    (
      select pg_catalog.count(*)
      from public.visit_members as counted_member
      where counted_member.visit_id = visit.id
        and counted_member.member_status <>
          'withdrawn_before_start'::public.visit_member_status
    ) as participant_count
  from public.visit_members as own_membership
  join public.visits as visit on visit.id = own_membership.visit_id
  join public.routes as route on route.id = visit.route_id
  where own_membership.user_id = current_user_id
    and not (
      visit.status in (
        'forming'::public.visit_status,
        'in_progress'::public.visit_status
      )
      and (
        own_membership.member_status in (
          'active'::public.visit_member_status,
          'returning_early'::public.visit_member_status
        )
        or (
          own_membership.member_role = 'leader'::public.visit_member_role
          and own_membership.member_status =
            'returned_early'::public.visit_member_status
        )
      )
    )
  order by
    coalesce(visit.started_at, visit.created_at) desc,
    visit.id
  limit p_limit
  offset p_offset;
end;
$$;

revoke all on function public.get_my_visit_history(integer, integer)
from public, anon, authenticated;
grant execute on function public.get_my_visit_history(integer, integer)
to authenticated;
