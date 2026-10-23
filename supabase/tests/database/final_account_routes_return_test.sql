begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select is(public.is_adult('2009-10-22','2026-10-22'),false,'17 is rejected');
select is(public.is_adult('2008-10-22','2026-10-22'),true,'exactly 18 is adult');
select is(public.is_adult('2008-10-23','2026-10-22'),false,'birthday tomorrow is not adult');
select is(public.is_adult(null),false,'missing birth date is not adult');
select throws_ok($$insert into auth.users(id,email,raw_user_meta_data) values(
  'fc000000-0000-4000-8000-000000000099','minor-final@example.invalid',
  jsonb_build_object('date_of_birth',((now() at time zone 'America/Guatemala')::date-interval '17 years')::date))$$,
  '23514','adult_required','signup rejects a minor in the backend');
select throws_ok($$insert into auth.users(id,email,raw_user_meta_data) values(
  'fc000000-0000-4000-8000-000000000099','missing-final@example.invalid','{}')$$,
  '23514','adult_required','signup cannot omit birth date');
select throws_ok($$insert into auth.users(id,email,raw_user_meta_data) values(
  'fc000000-0000-4000-8000-000000000099','forged-staff@example.invalid','{"staff_invitation":true}')$$,
  '23514','adult_required','editable staff metadata cannot bypass signup rules');

insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
('fc000000-0000-4000-8000-000000000001','adult-final@example.invalid',now(),jsonb_build_object('first_name','Adulto','last_name','Exacto','date_of_birth',((now() at time zone 'America/Guatemala')::date-interval '18 years')::date)),
('fc000000-0000-4000-8000-000000000002','member-final@example.invalid',now(),'{"first_name":"Adulta","last_name":"Miembro","date_of_birth":"1980-01-01"}'),
('fc000000-0000-4000-8000-000000000003','admin-final@example.invalid',now(),'{"first_name":"Admin","last_name":"Real","date_of_birth":"1980-01-01"}');
update public.user_roles set role='admin' where user_id='fc000000-0000-4000-8000-000000000003';
update public.profiles set nationality_country_code='MX',phone='+525555551111',document_type='passport',document_number='FINAL-'||id::text
where id in ('fc000000-0000-4000-8000-000000000001','fc000000-0000-4000-8000-000000000002');
insert into public.emergency_contacts(user_id,first_name,last_name,relationship,phone) values
('fc000000-0000-4000-8000-000000000001','Contacto','Uno','sibling','+525555552222'),
('fc000000-0000-4000-8000-000000000002','Contacto','Dos','sibling','+525555553333');

-- Trusted Auth invitation creates a staff identity without tourist attributes.
insert into auth.users(id,email,invited_at,raw_user_meta_data) values
('fc000000-0000-4000-8000-000000000004','invited-final@example.invalid',now(),'{"first_name":"Gestora","last_name":"Real"}'),
('fc000000-0000-4000-8000-000000000005','cancel-final@example.invalid',now(),'{"first_name":"Invitada","last_name":"Pendiente"}'),
('fc000000-0000-4000-8000-000000000006','legacy-final@example.invalid',now(),'{"first_name":"Cuenta","last_name":"Antigua"}');
insert into public.staff_permissions(user_id,is_active,invitation_status,can_manage_visits) values
('fc000000-0000-4000-8000-000000000004',false,'pending',true),
('fc000000-0000-4000-8000-000000000005',false,'pending',false);
select is((select date_of_birth from public.profiles where id='fc000000-0000-4000-8000-000000000004'),null::date,'staff has no tourist DOB');
select is((select role::text from public.user_roles where user_id='fc000000-0000-4000-8000-000000000004'),'visitor_manager','invitation does not create tourist role');
-- Simulate a pre-migration minor, without disabling any production validation.
update public.profiles set date_of_birth=(now() at time zone 'America/Guatemala')::date-interval '17 years'
where id='fc000000-0000-4000-8000-000000000006';
update public.user_roles set role='tourist' where user_id='fc000000-0000-4000-8000-000000000006';
update auth.users set email_confirmed_at=now() where id='fc000000-0000-4000-8000-000000000006';

create function pg_temp.authenticate_as(p_id uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claims',jsonb_build_object('sub',p_id,'role','authenticated')::text,true); end; $$;
select pg_temp.authenticate_as('fc000000-0000-4000-8000-000000000001');
set local role authenticated;
select throws_ok($$update public.profiles set date_of_birth='2012-01-01' where id=auth.uid()$$,'23514','adult_required','adult cannot edit DOB to underage');
select throws_ok($$select * from public.create_group_visit_with_minors(
  (select id from public.routes where slug='mirador-picacho'),'day_hike',null,now()+interval '3 hours',false,null,true,true,'now','[]',false)$$,
  '23514','minimum_return_four_hours','immediate return before four hours is rejected');
select throws_ok($$select * from public.create_group_visit_with_minors(
  null::uuid,'day_hike',null,now()+interval '8 hours',false,null,true,true,'now','[]',false)$$,
  '22023','Choose an active route.','missing route is rejected atomically');
select is((select count(*) from public.get_my_active_group_visit()),0::bigint,'invalid creation leaves no group');
create temporary table exact_schedule as select * from public.create_group_visit_with_minors(
  (select id from public.routes where slug='ascenso-a-la-cima'),'day_hike',now()+interval '2 days',now()+interval '2 days 4 hours',false,null,true,true,'scheduled','[]',false);
select is((select expected_return_at-planned_start_at from public.visits where id=(select visit_id from exact_schedule)),interval '4 hours','scheduled start plus exactly four hours accepted');
select public.cancel_group_visit((select visit_id from exact_schedule));
create temporary table final_group as select * from public.create_group_visit_with_minors(
  (select id from public.routes where slug='ascenso-a-la-cima'),'day_hike',null,now()+interval '8 hours',false,null,true,true,'now',
  '[{"full_name":"Menor acompañado","age":8,"sex":"male","relationship":"child"}]',true);
grant select on final_group to authenticated;
select is((select count(*) from public.get_visit_minors((select visit_id from final_group))),1::bigint,'exactly 18 can register a minor');
select pg_temp.authenticate_as('fc000000-0000-4000-8000-000000000002');
select public.join_group_visit((select join_code from final_group),true);
select throws_ok($$select public.change_visit_route((select visit_id from final_group),(select id from public.routes where slug='mirador-picacho'))$$,
  '42501','Only the organizer or authorized staff can change this route.','member cannot replace organizer route');
select pg_temp.authenticate_as('fc000000-0000-4000-8000-000000000001');
create temporary table before_route as select to_jsonb(v)-'route_id'-'updated_at' snapshot from public.visits v where id=(select visit_id from final_group);
select public.change_visit_route((select visit_id from final_group),(select id from public.routes where slug='mirador-picacho'));
select is((select to_jsonb(v)-'route_id'-'updated_at' from public.visits v where id=(select visit_id from final_group)),(select snapshot from before_route),'changing route preserves every other visit value');
select is((select jsonb_array_length(participants) from public.get_group_visit_details((select visit_id from final_group))),2,'route change preserves participants');
select is((select count(*) from public.get_visit_minors((select visit_id from final_group))),1::bigint,'route change preserves minors');
select public.start_group_visit((select visit_id from final_group));
select public.change_visit_route((select visit_id from final_group),(select id from public.routes where slug='ascenso-a-la-cima'),true);
select is((select status::text from public.visits where id=(select visit_id from final_group)),'in_progress','active route change preserves visit status');
select throws_ok($$select public.complete_my_visit_participation((select visit_id from final_group))$$,'23514','early_return_required','normal early completion is rejected');
select throws_ok($$select public.record_my_early_return((select visit_id from final_group),'other',null)$$,'23514','early_return_description_required','Other requires a description in backend');
select lives_ok($$select public.record_my_early_return((select visit_id from final_group),'weather',null)$$,'physical arrival can be recorded early');
reset role;
select is((select member_status::text from public.visit_members where visit_id=(select visit_id from final_group) and user_id=auth.uid()),'returned_early','early arrival becomes returned_early');
select ok((select checked_out_at is not null and exit_reason='weather' from public.visit_members where visit_id=(select visit_id from final_group) and user_id=auth.uid()),'arrival timestamp and reason are stored');
set local role authenticated;
select is((select operational_status::text from public.get_visit_minors((select visit_id from final_group))),'returned_early','minor inherits responsible adult return');
select pg_temp.authenticate_as('fc000000-0000-4000-8000-000000000003');
reset role;
select is((select count(*) from public.audit_logs where action='visit_route_changed' and target_id=(select visit_id::text from final_group)),2::bigint,'both route changes are audited');
select ok((select bool_and(actor_user_id='fc000000-0000-4000-8000-000000000001' and created_at is not null and metadata ? 'previous_route_id' and metadata ? 'new_route_id') from public.audit_logs where action='visit_route_changed' and target_id=(select visit_id::text from final_group)),'audit stores actor time and both routes');
set local role authenticated;
select lives_ok($$select public.change_visit_route((select visit_id from final_group),(select id from public.routes where slug='mirador-picacho'),true)$$,'admin uses the same route RPC');
select is((select route_name from public.staff_list_ascents('all',250,null) where visit_id=(select visit_id from final_group)),'Mirador Picacho','admin list reflects changed route');
select ok(public.staff_get_visitor_summary('fc000000-0000-4000-8000-000000000001',(select visit_id from final_group))->'history' @> '[{"route_name":"Mirador Picacho"}]'::jsonb,'visitor history contains route');
select ok(public.staff_generate_visitor_report(now()-interval '1 day',now()+interval '1 day','detailed') ? 'route_breakdown','reports include route breakdown');
select pg_temp.authenticate_as('fc000000-0000-4000-8000-000000000002');
select public.record_my_early_return((select visit_id from final_group),'other','Decisión de regresar antes');
select is((select status::text from public.visits where id=(select visit_id from final_group)),'completed','last early arrival closes group');
select pg_temp.authenticate_as('fc000000-0000-4000-8000-000000000006');
select throws_ok($$select * from public.create_group_visit_with_minors((select id from public.routes where slug='mirador-picacho'),'day_hike',null,now()+interval '8 hours',false,null,true,true,'now','[]',false)$$,'23514','adult_required','legacy minor cannot create ascent');
select lives_ok($$update public.profiles set date_of_birth='1990-01-01' where id=auth.uid()$$,'legacy incorrect DOB can be corrected to an adult date');
select pg_temp.authenticate_as('fc000000-0000-4000-8000-000000000004');
select is(public.activate_my_staff_invitation(),false,'pending staff cannot activate without setting a password');
reset role;
-- Synthetic Auth hash marker, never an actual password. Auth API itself is tested separately.
update auth.users set encrypted_password='test-only-auth-hash',email_confirmed_at=now() where id='fc000000-0000-4000-8000-000000000004';
set local role authenticated;
select is(public.activate_my_staff_invitation(),true,'invitation activates after Auth password setup');
select pg_temp.authenticate_as('fc000000-0000-4000-8000-000000000003');
select throws_ok($$select public.cancel_pending_staff_invitation('fc000000-0000-4000-8000-000000000004')$$,'23514','Only an unactivated invitation can be removed.','active staff cannot be deleted');
select lives_ok($$select public.admin_set_staff_access('fc000000-0000-4000-8000-000000000004',false)$$,'active staff can be deactivated');
select lives_ok($$select public.admin_set_staff_access('fc000000-0000-4000-8000-000000000004',true)$$,'staff can be reactivated');
select lives_ok($$select public.cancel_pending_staff_invitation('fc000000-0000-4000-8000-000000000005')$$,'pending invitation can be revoked without deleting identity');
select throws_ok($$select public.admin_set_staff_access('fc000000-0000-4000-8000-000000000005',true)$$,'23514','Pending invitations must be accepted first.','revoked invitation cannot be reactivated');
select pg_temp.authenticate_as('fc000000-0000-4000-8000-000000000005');
select is(public.activate_my_staff_invitation(),false,'revoked link cannot activate staff');
reset role;
select is((select count(*) from auth.users where id='fc000000-0000-4000-8000-000000000005'),1::bigint,'revocation preserves the Auth identity');
select * from finish();
rollback;
