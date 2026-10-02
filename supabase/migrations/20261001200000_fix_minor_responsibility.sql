-- A minor remains linked to the authenticated adult who registered them.
drop function if exists public.staff_reassign_minor(uuid, uuid);
drop function if exists public.reassign_my_visit_minor(uuid, uuid);

create or replace function public.prevent_minor_responsible_change()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.responsible_member_id is distinct from old.responsible_member_id then
    raise exception using errcode = '42501', message = 'The adult who registered the minor remains responsible for this ascent.';
  end if;
  return new;
end;
$$;
drop trigger if exists prevent_minor_responsible_change_before_update on public.visit_minors;
create trigger prevent_minor_responsible_change_before_update
before update of responsible_member_id on public.visit_minors for each row
execute function public.prevent_minor_responsible_change();

-- Withdrawal is allowed because the minor derives the responsible adult's state.
drop trigger if exists protect_minor_responsible_member_before_withdrawal on public.visit_members;

create or replace function public.visit_minor_operational_status(
  p_visit_status public.visit_status,
  p_member_status public.visit_member_status
) returns text language sql immutable set search_path = '' as $$
  select case when p_visit_status = 'cancelled'::public.visit_status
    then 'withdrawn_before_start' else p_member_status::text end;
$$;

drop function public.get_visit_minors(uuid);
create function public.get_visit_minors(p_visit_id uuid)
returns table(id uuid,full_name text,age smallint,sex text,relationship text,responsible_member_id uuid,responsible_name text,operational_status text)
language sql stable security definer set search_path = '' as $$
  select minor.id,minor.full_name,minor.age,minor.sex,minor.relationship,
    minor.responsible_member_id,concat_ws(' ',profile.first_name,profile.last_name),
    public.visit_minor_operational_status(visit.status,responsible.member_status)
  from public.visit_minors minor
  join public.visits visit on visit.id=minor.visit_id
  join public.visit_members responsible on responsible.visit_id=minor.visit_id and responsible.user_id=minor.responsible_member_id
  join public.visit_members requester on requester.visit_id=minor.visit_id and requester.user_id=auth.uid()
  join public.profiles profile on profile.id=minor.responsible_member_id
  where minor.visit_id=p_visit_id order by minor.created_at;
$$;
revoke all on function public.get_visit_minors(uuid) from public,anon,authenticated;
grant execute on function public.get_visit_minors(uuid) to authenticated;

drop function public.staff_get_ascent_members(uuid);
create function public.staff_get_ascent_members(p_visit_id uuid)
returns table(visit_id uuid,user_id uuid,visitor_name text,member_role text,member_status text,checked_out_at timestamptz,finalized_by_administration boolean,is_minor boolean,responsible_name text)
language plpgsql stable security definer set search_path='' as $$
begin
  if not(public.has_staff_permission('can_view_visitors') or public.has_staff_permission('can_manage_visits') or public.has_staff_permission('can_confirm_returns')) then raise exception using errcode='42501',message='Visit access is required.'; end if;
  return query
  select m.visit_id,m.user_id,concat_ws(' ',p.first_name,p.last_name),m.member_role::text,m.member_status::text,m.checked_out_at,m.checkout_method='staff',false,null::text
  from public.visit_members m join public.profiles p on p.id=m.user_id where m.visit_id=p_visit_id
  union all
  select minor.visit_id,minor.id,minor.full_name,'member',public.visit_minor_operational_status(v.status,responsible.member_status),responsible.checked_out_at,responsible.checkout_method='staff',true,concat_ws(' ',profile.first_name,profile.last_name)
  from public.visit_minors minor join public.visits v on v.id=minor.visit_id
  join public.visit_members responsible on responsible.visit_id=minor.visit_id and responsible.user_id=minor.responsible_member_id
  join public.profiles profile on profile.id=responsible.user_id where minor.visit_id=p_visit_id
  order by is_minor,visitor_name;
end;
$$;
revoke all on function public.staff_get_ascent_members(uuid) from public,anon,authenticated;
grant execute on function public.staff_get_ascent_members(uuid) to authenticated;
