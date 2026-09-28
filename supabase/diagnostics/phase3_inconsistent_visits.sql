-- Read-only diagnosis. Review every result before planning a separate repair.
select v.id as visit_id, v.status as visit_status, v.started_at, v.completed_at,
  count(*) filter (where m.member_status in ('active','returning_early')) as active_members,
  count(*) filter (where m.member_status in ('completed','returned_early')) as terminal_members
from public.visits v join public.visit_members m on m.visit_id=v.id
group by v.id,v.status,v.started_at,v.completed_at
having (v.status='completed' and count(*) filter (where m.member_status in ('active','returning_early'))>0)
   or (v.status='in_progress' and count(*) filter (where m.member_status in ('active','returning_early'))=0)
order by coalesce(v.completed_at,v.started_at) desc;

select m.visit_id,m.user_id,m.member_status,m.checked_out_at,m.checkout_method,m.checked_out_by,
  m.administrative_return_recorded_at
from public.visit_members m
where (m.member_status in ('completed','returned_early') and m.checked_out_at is null)
   or (m.member_status in ('active','returning_early') and m.checked_out_at is not null)
order by m.visit_id,m.user_id;
