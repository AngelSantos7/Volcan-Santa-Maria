create or replace function public.complete_my_visit_participation(visit_id uuid)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare
  current_user_id uuid := auth.uid();
  current_status public.visit_member_status;
  visit_status public.visit_status;
  completion_time timestamptz := clock_timestamp();
begin
  if current_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;
  select member.member_status, visit.status into current_status, visit_status
  from public.visit_members member
  join public.visits visit on visit.id = member.visit_id
  where member.visit_id = $1 and member.user_id = current_user_id
  for update of member, visit;
  if current_status is null then
    raise exception using errcode = 'P0002', message = 'Visit membership was not found.';
  end if;
  if current_status in ('completed', 'returned_early') then return $1; end if;
  if visit_status <> 'in_progress' or current_status <> 'active' then
    raise exception using errcode = 'P0001', message = 'This participation cannot be completed normally.';
  end if;
  update public.visit_members as target
  set member_status = 'completed', checked_out_at = completion_time,
    checkout_method = 'self', checked_out_by = null
  where target.visit_id = $1 and target.user_id = current_user_id
    and target.member_status = 'active';
  if not exists (
    select 1 from public.visit_members as pending
    where pending.visit_id = $1
      and pending.member_status in ('active', 'returning_early')
  ) then
    update public.visits set status = 'completed', completed_at = completion_time
    where id = $1 and status = 'in_progress';
  end if;
  return $1;
end;
$$;
