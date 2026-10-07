begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
('fa000000-0000-4000-8000-000000000001','adult-a@example.invalid',now(),'{}'),
('fa000000-0000-4000-8000-000000000002','adult-b@example.invalid',now(),'{}');

update public.profiles set first_name='Adulto',last_name='A',date_of_birth='1980-01-01',sex='male',nationality_country_code='GT',department_code='quetzaltenango',phone='+50255551001',document_type='passport',document_number='RETURN-A' where id='fa000000-0000-4000-8000-000000000001';
update public.profiles set first_name='Adulto',last_name='B',date_of_birth='1985-01-01',sex='female',nationality_country_code='MX',phone='+525555551002',document_type='passport',document_number='RETURN-B' where id='fa000000-0000-4000-8000-000000000002';
insert into public.emergency_contacts(user_id,first_name,last_name,relationship,phone) values
('fa000000-0000-4000-8000-000000000001','Contacto','A','sibling','+50255551011'),
('fa000000-0000-4000-8000-000000000002','Contacto','B','sibling','+525555551012');

create function pg_temp.authenticate_as(requested_user_id uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',jsonb_build_object('sub',requested_user_id,'role','authenticated')::text,true);
  perform set_config('request.jwt.claim.sub',requested_user_id::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
end;
$$;

set local role authenticated;
select pg_temp.authenticate_as('fa000000-0000-4000-8000-000000000001');
create temporary table return_group as
select created.visit_id,created.join_code from public.create_group_visit_with_minors(
  'day_hike',null,now()+interval '8 hours',false,null,true,true,'now',
  '[{"full_name":"Menor A","age":9,"sex":"female","relationship":"child"}]'::jsonb,true
) created;
grant select on return_group to authenticated;

select pg_temp.authenticate_as('fa000000-0000-4000-8000-000000000002');
select public.join_group_visit((select join_code from return_group),true);
select * from public.add_my_visit_minors((select visit_id from return_group),
  '[{"full_name":"Menor B","age":12,"sex":"male","relationship":"child"}]'::jsonb,true);

select is((select count(*) from public.visit_members where visit_id=(select visit_id from return_group)),2::bigint,'group stores two adults once');
select is((select count(*) from public.visit_minors where visit_id=(select visit_id from return_group)),2::bigint,'group stores two minors once');
select is((select count(distinct responsible_member_id) from public.visit_minors where visit_id=(select visit_id from return_group)),2::bigint,'minors remain assigned to their registering adults');

select pg_temp.authenticate_as('fa000000-0000-4000-8000-000000000001');
select public.start_group_visit((select visit_id from return_group));
select public.complete_my_visit_participation((select visit_id from return_group));
reset role;

select is((select member_status::text from public.visit_members where visit_id=(select visit_id from return_group) and user_id='fa000000-0000-4000-8000-000000000001'),'completed','adult A completes independently');
select is((select member_status::text from public.visit_members where visit_id=(select visit_id from return_group) and user_id='fa000000-0000-4000-8000-000000000002'),'active','adult B remains active');
select is((select status::text from public.visits where id=(select visit_id from return_group)),'in_progress','physical group remains in progress while an adult is active');
select is(public.visit_operational_status((select visit_id from return_group)),'pending_returns','derived group status is pending returns');
select is((select public.visit_minor_operational_status(visit.status,responsible.member_status) from public.visit_minors minor join public.visits visit on visit.id=minor.visit_id join public.visit_members responsible on responsible.visit_id=minor.visit_id and responsible.user_id=minor.responsible_member_id where minor.full_name='Menor A'),'completed','adult A minor returns automatically through derived status');

set local role authenticated;
select pg_temp.authenticate_as('fa000000-0000-4000-8000-000000000002');
select public.complete_my_visit_participation((select visit_id from return_group));
reset role;
select is((select status::text from public.visits where id=(select visit_id from return_group)),'completed','group completes only after adult B returns');
select is((select count(*) from public.visit_minors minor join public.visits visit on visit.id=minor.visit_id join public.visit_members responsible on responsible.visit_id=minor.visit_id and responsible.user_id=minor.responsible_member_id where minor.visit_id=(select visit_id from return_group) and public.visit_minor_operational_status(visit.status,responsible.member_status)='completed'),2::bigint,'both minors are completed with their respective adults');

select * from finish();
rollback;
