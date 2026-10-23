-- Normal self-checkout unlocks four hours after actual start, independently of the estimate.
create or replace function public.enforce_normal_return()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.member_status='completed' and old.member_status is distinct from new.member_status
    and coalesce(new.checkout_method,'self') <> 'staff'
    and exists(select 1 from public.visits v where v.id=new.visit_id
      and (v.started_at is null or clock_timestamp() < v.started_at + interval '4 hours')) then
    raise exception using errcode='23514',message='early_return_required';
  end if;
  if new.exit_reason='other' and (old.exit_reason is distinct from new.exit_reason or old.exit_notes is distinct from new.exit_notes)
    and nullif(btrim(new.exit_notes),'') is null then
    raise exception using errcode='23514',message='early_return_description_required';
  end if;
  return new;
end;
$$;
