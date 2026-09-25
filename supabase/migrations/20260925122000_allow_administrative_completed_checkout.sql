alter table public.visit_members
  drop constraint visit_members_return_state_consistent;

alter table public.visit_members
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
      member_status = 'completed'::public.visit_member_status
      and return_started_at is null
      and exit_reason is null
      and exit_notes is null
      and checked_out_at is not null
      and checkout_method = 'staff'
      and checked_out_by is not null
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
