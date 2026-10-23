-- Preserve existing groups, minors, times and history. No data backfill.
create or replace function public.add_my_visit_minors(
  p_visit_id uuid,
  p_minors jsonb,
  p_responsibility_consent_accepted boolean
) returns setof public.visit_minors
language plpgsql volatile security definer set search_path = '' as $$
declare
  current_user_id uuid := auth.uid();
  current_visit_status public.visit_status;
  current_started_at timestamptz;
  normalized_minors jsonb := coalesce(p_minors, '[]'::jsonb);
begin
  if current_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;
  select visit.status, visit.started_at into current_visit_status, current_started_at
  from public.visits as visit where visit.id = p_visit_id for update;
  if current_visit_status is null or not exists (
    select 1 from public.visit_members as member
    where member.visit_id = p_visit_id
      and member.user_id = current_user_id
      and member.member_status = 'active'
  ) then
    raise exception using errcode = '42501', message = 'Only a participant can register their accompanying minors.';
  end if;
  if current_visit_status <> 'forming' or current_started_at is not null then
    raise exception using errcode = 'P0001', message = 'Minors can be registered only before the ascent starts.';
  end if;
  if not exists (
    select 1 from public.profiles as profile
    where profile.id = current_user_id
      and public.is_adult(profile.date_of_birth)
  ) then
    raise exception using errcode = '23514', message = 'The responsible participant must be an adult.';
  end if;
  if jsonb_typeof(normalized_minors) <> 'array'
    or jsonb_array_length(normalized_minors) > 12 then
    raise exception using errcode = '22023', message = 'Invalid accompanying minors payload.';
  end if;
  if jsonb_array_length(normalized_minors) > 0
    and coalesce(p_responsibility_consent_accepted, false) is not true then
    raise exception using errcode = '23514', message = 'Minor responsibility consent is required.';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(normalized_minors)
      as supplied(full_name text, age integer, sex text, relationship text)
    where nullif(pg_catalog.btrim(supplied.full_name), '') is null
      or supplied.age is null or supplied.sex is null
      or supplied.age not between 0 and 17
      or supplied.sex not in ('male', 'female')
      or nullif(pg_catalog.btrim(supplied.relationship), '') is null
      or pg_catalog.char_length(pg_catalog.btrim(supplied.full_name)) > 160
      or pg_catalog.char_length(pg_catalog.btrim(supplied.relationship)) > 80
  ) then
    raise exception using errcode = '22023', message = 'Each minor requires valid name, age, sex and relationship.';
  end if;

  insert into public.visit_minors(
    visit_id, responsible_member_id, full_name, age, sex, relationship,
    created_by, responsibility_consent_version,
    responsibility_consent_accepted_at
  )
  select
    p_visit_id, current_user_id, pg_catalog.btrim(supplied.full_name),
    supplied.age::smallint, supplied.sex, pg_catalog.btrim(supplied.relationship),
    current_user_id, '1.0', pg_catalog.clock_timestamp()
  from jsonb_to_recordset(normalized_minors)
    as supplied(full_name text, age integer, sex text, relationship text);

  return query
  select minor.* from public.visit_minors as minor
  where minor.visit_id = p_visit_id
    and minor.responsible_member_id = current_user_id
  order by minor.created_at, minor.id;
end;
$$;


-- Deliberate removal is allowed only by the responsible adult before start.
-- Migration itself does not remove any existing row.
create function public.remove_my_visit_minor(p_visit_id uuid, p_minor_id uuid)
returns void language plpgsql volatile security definer set search_path='' as $$
declare selected public.visits;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='Authentication is required.'; end if;
  select * into selected from public.visits where id=p_visit_id for update;
  if selected.id is null or not exists(select 1 from public.visit_members where visit_id=p_visit_id and user_id=auth.uid() and member_status='active') then
    raise exception using errcode='42501',message='Only a participant can manage their accompanying minors.';
  end if;
  if selected.status<>'forming' or selected.started_at is not null then
    raise exception using errcode='P0001',message='minors_before_start_only';
  end if;
  delete from public.visit_minors where id=p_minor_id and visit_id=p_visit_id and responsible_member_id=auth.uid();
  if not found then raise exception using errcode='42501',message='Only the responsible adult can remove this minor.'; end if;
end;
$$;
revoke all on function public.remove_my_visit_minor(uuid,uuid) from public,anon,authenticated;
grant execute on function public.remove_my_visit_minor(uuid,uuid) to authenticated;

-- Remove the old overload so active hikes cannot bypass confirmation.
drop function public.change_visit_route(uuid,uuid);
create function public.change_visit_route(p_visit_id uuid,p_route_id uuid,p_returned_to_start boolean default false)
returns uuid language plpgsql volatile security definer set search_path='' as $$
declare selected public.visits; old_name text; new_name text;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='Authentication is required.'; end if;
  select * into selected from public.visits where id=p_visit_id for update;
  if selected.id is null or not (
    public.has_staff_permission('can_manage_visits') or exists(
      select 1 from public.visit_members where visit_id=p_visit_id and user_id=auth.uid()
      and member_role='leader' and member_status in ('active','returning_early')
    )
  ) then raise exception using errcode='42501',message='Only the organizer or authorized staff can change this route.'; end if;
  if selected.status not in ('forming','in_progress') then
    raise exception using errcode='23514',message='Only an open visit can change route.';
  end if;
  select name_es into new_name from public.routes where id=p_route_id and is_active;
  if new_name is null then raise exception using errcode='22023',message='Choose an active route.'; end if;
  if selected.route_id=p_route_id then return p_visit_id; end if;
  if (selected.started_at is not null or selected.status='in_progress') and p_returned_to_start is distinct from true then
    raise exception using errcode='23514',message='route_return_confirmation_required';
  end if;
  select name_es into old_name from public.routes where id=selected.route_id;
  update public.visits set route_id=p_route_id where id=p_visit_id;
  insert into public.audit_logs(actor_user_id,action,target_type,target_id,metadata)
  values(auth.uid(),'visit_route_changed','visit',p_visit_id::text,jsonb_build_object(
    'previous_route_id',selected.route_id,'new_route_id',p_route_id,
    'previous_route_name',old_name,'new_route_name',new_name,'visit_status',selected.status,
    'returned_to_start_confirmed', (selected.started_at is not null or selected.status='in_progress') and coalesce(p_returned_to_start,false),
    'return_confirmation_at',case when selected.started_at is not null or selected.status='in_progress' then clock_timestamp() else null end,
    'description',format('Ruta modificada de %s a %s.',old_name,new_name)));
  return p_visit_id;
end;
$$;
revoke all on function public.change_visit_route(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.change_visit_route(uuid,uuid,boolean) to authenticated;
