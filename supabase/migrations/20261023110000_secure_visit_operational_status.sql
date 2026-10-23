-- SEC-007: the derived status is visit-scoped data. Keep the existing RPC
-- contract for members and operational staff, but reject unrelated callers.

create or replace function public.visit_operational_status(p_visit_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null
    or not (
      public.is_current_user_visit_member(p_visit_id)
      or public.has_staff_permission('can_view_visitors')
      or public.has_staff_permission('can_manage_visits')
      or public.has_staff_permission('can_confirm_returns')
      or public.has_staff_permission('can_register_walk_in_visitors')
      or public.has_staff_permission('can_view_emergency_contacts')
    ) then
    raise exception using
      errcode = '42501',
      message = 'Access to this visit is denied.';
  end if;

  return (
    select case
      when visit.status = 'cancelled' then 'cancelled'
      when visit.status = 'completed' then 'completed'
      when visit.status = 'forming' and visit.planned_start_at is not null then 'scheduled'
      when visit.status = 'forming' then 'forming'
      when exists (
        select 1
        from public.visit_members as returned
        where returned.visit_id = visit.id
          and returned.member_status in ('completed', 'returned_early')
      ) and exists (
        select 1
        from public.visit_members as pending
        where pending.visit_id = visit.id
          and pending.member_status in ('active', 'returning_early')
      ) then 'pending_returns'
      when visit.status = 'in_progress' then 'in_progress'
      else visit.status::text
    end
    from public.visits as visit
    where visit.id = p_visit_id
  );
end;
$$;

revoke all on function public.visit_operational_status(uuid)
from public, anon, authenticated;
grant execute on function public.visit_operational_status(uuid) to authenticated;
