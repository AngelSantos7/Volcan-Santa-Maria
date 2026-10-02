create or replace function public.protect_minor_responsible_member()
returns trigger language plpgsql set search_path='' as $$
begin
  if (tg_op='DELETE' or (tg_op='UPDATE' and new.member_status='withdrawn_before_start' and old.member_status<>new.member_status))
    and exists(select 1 from public.visit_minors minor where minor.visit_id=old.visit_id and minor.responsible_member_id=old.user_id) then
    raise exception using errcode='23503',message='Reassign or remove the accompanying minors before removing their responsible adult.';
  end if;
  return case when tg_op='DELETE' then old else new end;
end; $$;
create trigger protect_minor_responsible_member_before_withdrawal before update of member_status on public.visit_members for each row execute function public.protect_minor_responsible_member();

create function public.staff_reassign_minor(p_minor_id uuid,p_responsible_user_id uuid)
returns void language plpgsql volatile security definer set search_path='' as $$
declare minor_record public.visit_minors; previous_responsible uuid;
begin
  if auth.uid() is null or not public.has_staff_permission('can_manage_visits') then raise exception using errcode='42501',message='Visit management permission is required.'; end if;
  select * into minor_record from public.visit_minors where id=p_minor_id for update;
  if minor_record.id is null then raise exception using errcode='P0002',message='Minor was not found.'; end if;
  if not exists(select 1 from public.visit_members m join public.profiles p on p.id=m.user_id where m.visit_id=minor_record.visit_id and m.user_id=p_responsible_user_id and m.member_status in('active','returning_early') and p.date_of_birth<=current_date-interval '18 years') then raise exception using errcode='23514',message='The new responsible participant must be an active adult in the same ascent.'; end if;
  previous_responsible:=minor_record.responsible_member_id;
  update public.visit_minors set responsible_member_id=p_responsible_user_id,updated_at=now() where id=p_minor_id;
  insert into public.audit_logs(actor_user_id,action,target_type,target_id,metadata) values(auth.uid(),'minor_responsible_reassigned','visit_minor',p_minor_id::text,jsonb_build_object('visit_id',minor_record.visit_id,'previous_responsible_user_id',previous_responsible,'responsible_user_id',p_responsible_user_id));
end; $$;
revoke all on function public.staff_reassign_minor(uuid,uuid) from public,anon,authenticated;
grant execute on function public.staff_reassign_minor(uuid,uuid) to authenticated;
