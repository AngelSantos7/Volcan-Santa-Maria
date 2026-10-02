create function public.get_visit_minors(p_visit_id uuid)
returns table(id uuid,full_name text,age smallint,sex text,relationship text,responsible_member_id uuid,responsible_name text)
language sql stable security definer set search_path='' as $$
  select minor.id,minor.full_name,minor.age,minor.sex,minor.relationship,minor.responsible_member_id,concat_ws(' ',profile.first_name,profile.last_name)
  from public.visit_minors minor join public.visit_members requester on requester.visit_id=minor.visit_id and requester.user_id=auth.uid() join public.profiles profile on profile.id=minor.responsible_member_id
  where minor.visit_id=p_visit_id order by minor.created_at;
$$;
create function public.reassign_my_visit_minor(p_minor_id uuid,p_responsible_user_id uuid)
returns void language plpgsql volatile security definer set search_path='' as $$
declare minor_record public.visit_minors;
begin
  select minor.* into minor_record from public.visit_minors minor join public.visits v on v.id=minor.visit_id join public.visit_members leader on leader.visit_id=v.id and leader.user_id=auth.uid() and leader.member_role='leader' where minor.id=p_minor_id and v.status='forming' for update of minor;
  if minor_record.id is null then raise exception using errcode='42501',message='Only the organizer can reassign a minor before the ascent starts.'; end if;
  if not exists(select 1 from public.visit_members m join public.profiles p on p.id=m.user_id where m.visit_id=minor_record.visit_id and m.user_id=p_responsible_user_id and m.member_status='active' and p.date_of_birth<=current_date-interval '18 years') then raise exception using errcode='23514',message='The responsible participant must be an adult in this ascent.'; end if;
  update public.visit_minors set responsible_member_id=p_responsible_user_id,updated_at=now() where id=p_minor_id;
end; $$;
revoke all on function public.get_visit_minors(uuid),public.reassign_my_visit_minor(uuid,uuid) from public,anon,authenticated;
grant execute on function public.get_visit_minors(uuid),public.reassign_my_visit_minor(uuid,uuid) to authenticated;
