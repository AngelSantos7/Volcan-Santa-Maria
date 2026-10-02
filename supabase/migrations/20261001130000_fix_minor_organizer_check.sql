-- Administrative visits can be created by staff on behalf of their organizer,
-- so authorization must follow visit membership rather than visits.created_by.
create or replace function public.add_my_visit_minors(p_visit_id uuid, p_minors jsonb)
returns setof public.visit_minors
language plpgsql volatile security definer set search_path = '' as $$
declare current_user_id uuid:=auth.uid(); visit_status public.visit_status; minor jsonb;
begin
  if current_user_id is null then raise exception using errcode='42501',message='Authentication is required.'; end if;
  select visit.status into visit_status from public.visits visit where visit.id=p_visit_id for update;
  if visit_status is null or not exists(select 1 from public.visit_members member where member.visit_id=p_visit_id and member.user_id=current_user_id and member.member_role='leader') then raise exception using errcode='42501',message='Only the visit organizer can add accompanying minors.'; end if;
  if visit_status<>'forming' then raise exception using errcode='P0001',message='Minors can be changed only before the ascent starts.'; end if;
  if not exists(select 1 from public.profiles profile where profile.id=current_user_id and profile.date_of_birth<=current_date-interval '18 years') then raise exception using errcode='23514',message='The responsible participant must be an adult.'; end if;
  if jsonb_typeof(coalesce(p_minors,'[]'::jsonb))<>'array' or jsonb_array_length(coalesce(p_minors,'[]'::jsonb))>12 then raise exception using errcode='22023',message='Invalid accompanying minors payload.'; end if;
  for minor in select value from jsonb_array_elements(coalesce(p_minors,'[]'::jsonb)) loop
    if nullif(btrim(minor->>'full_name'),'') is null or (minor->>'age')::integer not between 0 and 17 or minor->>'sex' not in ('male','female') or nullif(btrim(minor->>'relationship'),'') is null then raise exception using errcode='22023',message='Each minor requires name, age, sex and relationship.'; end if;
    insert into public.visit_minors(visit_id,responsible_member_id,full_name,age,sex,relationship,created_by) values(p_visit_id,current_user_id,btrim(minor->>'full_name'),(minor->>'age')::smallint,minor->>'sex',btrim(minor->>'relationship'),current_user_id);
  end loop;
  return query select * from public.visit_minors where visit_id=p_visit_id order by created_at;
end; $$;
