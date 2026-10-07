begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
('fb000000-0000-4000-8000-000000000001','manager-security@example.invalid',now(),'{}'),
('fb000000-0000-4000-8000-000000000002','visitor-security@example.invalid',now(),'{}'),
('fb000000-0000-4000-8000-000000000003','consented-new@example.invalid',now(),'{"legal_consent_accepted":true,"terms_version":"1.0","privacy_version":"1.0"}');
update public.user_roles set role='visitor_manager' where user_id='fb000000-0000-4000-8000-000000000001';
insert into public.staff_permissions(user_id,is_active,can_view_emergency_contacts,can_register_walk_in_visitors)
values('fb000000-0000-4000-8000-000000000001',true,true,true);
update public.profiles set first_name='Gestora',last_name='Segura' where id='fb000000-0000-4000-8000-000000000001';
update public.profiles set first_name='Visitante',last_name='Operativo',date_of_birth='1990-01-01',sex='male',nationality_country_code='GT',department_code='quetzaltenango',phone='+50255552001',document_type='dpi',document_number='1234567890101' where id='fb000000-0000-4000-8000-000000000002';
insert into public.emergency_contacts(user_id,first_name,last_name,relationship,phone)
values('fb000000-0000-4000-8000-000000000002','Contacto','Seguro','sibling','+50255552002');
insert into public.visits(id,route_id,created_by,join_code,visit_type,status,started_at,expected_return_at,has_local_guide)
select 'fb000000-0000-4000-8000-000000000010',id,'fb000000-0000-4000-8000-000000000002','SECU01','day_hike','in_progress',now(),now()+interval '6 hours',false from public.routes where slug='ascenso-a-la-cima';
insert into public.visit_members(visit_id,user_id,member_role,terms_accepted_at,joined_at,member_status)
values('fb000000-0000-4000-8000-000000000010','fb000000-0000-4000-8000-000000000002','leader',now(),now(),'active');

create function pg_temp.authenticate_as(requested_user_id uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',jsonb_build_object('sub',requested_user_id,'role','authenticated')::text,true);
  perform set_config('request.jwt.claim.sub',requested_user_id::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
end;
$$;
create function pg_temp.sqlstate_from(command text) returns text language plpgsql as $$
begin execute command; return null; exception when others then return sqlstate; end;
$$;

select ok((select count(*)=1 from public.user_consents where user_id='fb000000-0000-4000-8000-000000000003' and terms_version='1.0' and privacy_version='1.0'),'new-user metadata stores consent 1.0');
set local role authenticated;
select pg_temp.authenticate_as('fb000000-0000-4000-8000-000000000002');
select is(public.get_my_consent_status('1.0','1.0'),false,'existing user starts without retroactive consent');
select lives_ok($$select public.accept_current_legal_documents('1.0','1.0')$$,'existing user can explicitly accept current documents');
select is(public.get_my_consent_status('1.0','1.0'),true,'accepted current consent is not requested again');
reset role;
select ok((select accepted_at is not null from public.user_consents where user_id='fb000000-0000-4000-8000-000000000002' and terms_version='1.0' and privacy_version='1.0'),'consent stores versions and timestamp');
set local role authenticated;
select pg_temp.authenticate_as('fb000000-0000-4000-8000-000000000002');
select is(pg_temp.sqlstate_from($$select public.accept_current_legal_documents('2.0','1.0')$$),'22023','unsupported consent versions are rejected');

select pg_temp.authenticate_as('fb000000-0000-4000-8000-000000000001');
select is(pg_temp.sqlstate_from($$select public.staff_get_identity_details('fb000000-0000-4000-8000-000000000002')$$),'42501','manager without identity permission cannot view DPI or passport');
select lives_ok($$create temporary table exposed_contacts as select public.staff_get_operational_contacts('fb000000-0000-4000-8000-000000000002','active_ascent') payload$$,'authorized manager can consult contacts during an active ascent');
grant select on exposed_contacts to authenticated;
select is((select payload ? 'document_number' from exposed_contacts),false,'operational contact response never includes identity documents');
reset role;
select is((select count(*) from public.audit_logs where actor_user_id='fb000000-0000-4000-8000-000000000001' and action='emergency_contact_viewed' and target_id='fb000000-0000-4000-8000-000000000002'),1::bigint,'operational contact consultation is audited');
update public.visit_members set member_status='completed' where visit_id='fb000000-0000-4000-8000-000000000010';
update public.visits set status='completed',completed_at=now() where id='fb000000-0000-4000-8000-000000000010';
set local role authenticated;
select pg_temp.authenticate_as('fb000000-0000-4000-8000-000000000001');
select is(pg_temp.sqlstate_from($$select public.staff_get_operational_contacts('fb000000-0000-4000-8000-000000000002','visitor_record')$$),'42501','manager cannot consult contacts after the ascent closes');
select is(pg_temp.sqlstate_from($$insert into public.route_media(id,route_id,storage_path,sort_order,is_cover,is_active) select 'fb000000-0000-4000-8000-000000000020',id,'security/active.webp',10,false,true from public.routes where slug='ascenso-a-la-cima'$$),'42501','manager without gallery permission cannot insert media');
reset role;
update public.staff_permissions set can_manage_gallery=true where user_id='fb000000-0000-4000-8000-000000000001';
set local role authenticated;
select pg_temp.authenticate_as('fb000000-0000-4000-8000-000000000001');
select lives_ok($$insert into public.route_media(id,route_id,storage_path,sort_order,is_cover,is_active) select item.id,route.id,item.path,item.position,false,item.active from public.routes route cross join (values('fb000000-0000-4000-8000-000000000020'::uuid,'security/active.webp'::text,10,true),('fb000000-0000-4000-8000-000000000021'::uuid,'security/inactive.webp'::text,20,false)) item(id,path,position,active) where route.slug='ascenso-a-la-cima'$$,'manager with gallery permission can add active and inactive media');
select pg_temp.authenticate_as('fb000000-0000-4000-8000-000000000002');
select is((select count(*) from public.route_media where id in('fb000000-0000-4000-8000-000000000020','fb000000-0000-4000-8000-000000000021')),1::bigint,'tourist can read only active gallery media');

select pg_temp.authenticate_as('fb000000-0000-4000-8000-000000000001');
select is(pg_temp.sqlstate_from($$select public.staff_register_walk_in_visitor('Sin','Departamento','GT','1990-01-01','+50255553001',null,'dpi','1234567890201','Contacto','Uno','sibling','+50255553002')$$),'22023','legacy administrative registration cannot bypass Guatemala department');
select is(pg_temp.sqlstate_from($$select public.staff_register_walk_in_visitor('Sin','Departamento','GT','1990-01-01','+50255553003',null,'dpi',null,'1234567890202','Contacto','Dos','sibling','+50255553004',null)$$),'22023','Guatemala requires a department in the current RPC');
select lives_ok($$select public.staff_register_walk_in_visitor('Con','Departamento','GT','1990-01-01','+50255553005',null,'dpi',null,'1234567890203','Contacto','Tres','sibling','+50255553006','quetzaltenango')$$,'Guatemala registration accepts one of the 22 stable department codes');
reset role;
select is((select department_code from public.profiles where document_number='1234567890203'),'quetzaltenango','administrative profile stores the department code');
set local role authenticated;
select pg_temp.authenticate_as('fb000000-0000-4000-8000-000000000001');
select is(pg_temp.sqlstate_from($$select public.staff_register_walk_in_visitor('México','Incorrecto','MX','1990-01-01','+525555553007',null,'passport',null,'MX-DEPT-1','Contacto','Cuatro','sibling','+525555553008','quetzaltenango')$$),'22023','non-Guatemalan registration rejects a department');
select lives_ok($$select public.staff_register_walk_in_visitor('México','Correcto','MX','1990-01-01','+525555553009',null,'passport',null,'MX-DEPT-2','Contacto','Cinco','sibling','+525555553010',null)$$,'non-Guatemalan registration succeeds without a department');

select * from finish();
rollback;
