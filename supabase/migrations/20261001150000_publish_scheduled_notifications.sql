create function public.publish_due_notifications()
returns integer language plpgsql volatile security definer set search_path='' as $$
declare notification_record record; published_count integer:=0;
begin
  if auth.role()<>'service_role' then raise exception using errcode='42501',message='Server execution is required.'; end if;
  for notification_record in select * from public.notifications where status='scheduled' and scheduled_at<=now() and (expires_at is null or expires_at>now()) for update skip locked loop
    update public.notifications set status='published',published_at=now(),updated_at=now() where id=notification_record.id;
    insert into public.notification_recipients(notification_id,user_id)
    select notification_record.id,u.id from auth.users u where
      notification_record.audience='all_users' or
      (notification_record.audience='specific_user' and u.id=notification_record.audience_user_id) or
      (notification_record.audience='specific_visit' and exists(select 1 from public.visit_members m where m.visit_id=notification_record.audience_visit_id and m.user_id=u.id)) or
      (notification_record.audience='in_progress' and exists(select 1 from public.visit_members m join public.visits v on v.id=m.visit_id where m.user_id=u.id and v.status='in_progress' and v.started_at is not null and m.member_status in('active','returning_early'))) or
      (notification_record.audience='planned' and exists(select 1 from public.visit_members m join public.visits v on v.id=m.visit_id where m.user_id=u.id and v.status='forming' and v.start_mode='scheduled' and v.planned_start_at>now() and m.member_status='active'))
    on conflict do nothing;
    insert into public.audit_logs(action,target_type,target_id,metadata) values('notification_published','notification',notification_record.id::text,jsonb_build_object('audience',notification_record.audience,'priority',notification_record.priority,'scheduled',true));
    published_count:=published_count+1;
  end loop;
  update public.notifications set status='expired',updated_at=now() where status in('scheduled','published') and expires_at<=now();
  return published_count;
end; $$;
revoke all on function public.publish_due_notifications() from public,anon,authenticated;
grant execute on function public.publish_due_notifications() to service_role;
