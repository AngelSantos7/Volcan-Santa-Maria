begin;
create extension if not exists pgtap with schema extensions;
select plan(34);

insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
('e1000000-0000-4000-8000-000000000001','phase4-admin@example.invalid',now(),'{"first_name":"Ana","last_name":"Admin"}'),
('e2000000-0000-4000-8000-000000000002','phase4-manager@example.invalid',now(),'{"first_name":"Marta","last_name":"Gestora"}'),
('e3000000-0000-4000-8000-000000000003','phase4-adult@example.invalid',now(),'{"first_name":"Adulta","last_name":"Responsable"}'),
('e4000000-0000-4000-8000-000000000004','phase4-tourist@example.invalid',now(),'{"first_name":"Otra","last_name":"Turista"}');
update public.user_roles set role='admin' where user_id='e1000000-0000-4000-8000-000000000001';
update public.user_roles set role='visitor_manager' where user_id='e2000000-0000-4000-8000-000000000002';
update public.profiles set date_of_birth='1990-01-01',sex='female',nationality_country_code='GT',phone='+50255550000',document_type='passport',document_number='PHASE4-'||id::text where id in ('e3000000-0000-4000-8000-000000000003','e4000000-0000-4000-8000-000000000004');
insert into public.staff_permissions(user_id,is_active,can_manage_visits,can_confirm_returns,can_view_visitors,can_manage_notifications) values('e2000000-0000-4000-8000-000000000002',true,true,true,true,false);

create function pg_temp.authenticate_as(requested_user_id uuid) returns void language plpgsql as $$ begin
  perform set_config('request.jwt.claims',jsonb_build_object('sub',requested_user_id,'role','authenticated')::text,true);
  perform set_config('request.jwt.claim.sub',requested_user_id::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
end $$;
create function pg_temp.sqlstate_from(command text) returns text language plpgsql as $$ begin execute command; return null; exception when others then return sqlstate; end $$;

set local role authenticated;
select pg_temp.authenticate_as('e1000000-0000-4000-8000-000000000001');
create temporary table phase4_active as select (public.staff_create_administrative_visit(array['e3000000-0000-4000-8000-000000000003'::uuid],'e3000000-0000-4000-8000-000000000003','day_hike','now',null,now()+interval '6 hours',false,null)->>'visit_id')::uuid visit_id;
create temporary table phase4_planned as select (public.staff_create_administrative_visit(array['e4000000-0000-4000-8000-000000000004'::uuid],'e4000000-0000-4000-8000-000000000004','day_hike','scheduled',now()+interval '2 days',now()+interval '2 days 6 hours',false,null)->>'visit_id')::uuid visit_id;
grant select on phase4_active,phase4_planned to authenticated;

reset role;
select is((select status::text from public.visits where id=(select visit_id from phase4_planned)),'forming','future planned ascent remains forming');
select is((select started_at from public.visits where id=(select visit_id from phase4_planned)),null::timestamptz,'future planned ascent has no real start');
select is((select status::text from public.visits where id=(select visit_id from phase4_active)),'in_progress','immediate administrative ascent is in progress');
set local role authenticated;
select pg_temp.authenticate_as('e1000000-0000-4000-8000-000000000001');
select is((select visit_status from public.staff_list_ascents('all',100) where visit_id=(select visit_id from phase4_active)),'in_progress','operational ascent query preserves active state');

select pg_temp.authenticate_as('e3000000-0000-4000-8000-000000000003');
select is(pg_temp.sqlstate_from(format($$select public.add_my_visit_minors(%L,'[{"full_name":"Niña Prueba","age":12,"sex":"female","relationship":"Hija"}]',true)$$,(select visit_id from phase4_active))),'P0001','minors cannot be added after an ascent starts');
select pg_temp.authenticate_as('e4000000-0000-4000-8000-000000000004');
select lives_ok(format($$select public.add_my_visit_minors(%L,'[{"full_name":"Menor Prueba","age":10,"sex":"male","relationship":"Hijo"}]',true)$$,(select visit_id from phase4_planned)),'adult organizer can add a minor with versioned responsibility consent');
reset role;
select is((select count(*) from public.visit_minors where visit_id=(select visit_id from phase4_planned)),1::bigint,'minor is stored without an Auth account');
select is((select count(*) from public.visit_members where visit_id=(select visit_id from phase4_planned)),1::bigint,'minor is not stored as an adult visit member');
select is((select responsible_member_id from public.visit_minors where visit_id=(select visit_id from phase4_planned)),'e4000000-0000-4000-8000-000000000004'::uuid,'adult who adds the minor is assigned automatically');
select is(to_regprocedure('public.reassign_my_visit_minor(uuid,uuid)'),null::regprocedure,'PWA minor reassignment RPC does not exist');
select is(to_regprocedure('public.staff_reassign_minor(uuid,uuid)'),null::regprocedure,'administrative minor reassignment RPC does not exist');
select is(pg_temp.sqlstate_from(format($$update public.visit_minors set responsible_member_id='e3000000-0000-4000-8000-000000000003' where visit_id=%L$$,(select visit_id from phase4_planned))),'42501','minor responsibility cannot be changed directly');
select is(public.visit_minor_operational_status('in_progress','completed'),'completed','normal adult completion is reflected by the minor');
select is(public.visit_minor_operational_status('in_progress','returned_early'),'returned_early','early adult return is reflected by the minor');
select is(public.visit_minor_operational_status('in_progress','completed'),'completed','administrative adult completion is reflected by the minor');
select is(public.visit_minor_operational_status('cancelled','active'),'withdrawn_before_start','visit cancellation is reflected by the minor');
select is(pg_temp.sqlstate_from(format($$delete from public.visit_members where visit_id=%L and user_id='e4000000-0000-4000-8000-000000000004'$$,(select visit_id from phase4_planned))),'23503','responsible adult cannot be removed while assigned minors exist');

set local role authenticated;
select pg_temp.authenticate_as('e1000000-0000-4000-8000-000000000001');
select is((select age from public.staff_get_ascent_members((select visit_id from phase4_planned)) where is_minor),10::smallint,'staff ascent detail exposes the existing minor age');
select is((select minor_count from public.staff_list_ascents('all',100,'Menor Prueba') where visit_id=(select visit_id from phase4_planned)),1::bigint,'minor name search finds the corresponding ascent');
select is((select participant_count from public.staff_list_ascents('all',100) where visit_id=(select visit_id from phase4_planned)),2::bigint,'ascent participant count includes adults and minors once');
select is((public.staff_get_visitor_summary('e4000000-0000-4000-8000-000000000004',(select visit_id from phase4_planned)) #>> '{history,0,minors,0,full_name}'),'Menor Prueba','adult history includes the minor accompanied on the ascent');
select lives_ok(format($$select public.staff_register_administrative_return(%L,'e3000000-0000-4000-8000-000000000003','confirmed_in_person',null,null,null)$$,(select visit_id from phase4_active)),'administrative return uses the unified RPC');
select lives_ok(format($$select public.staff_register_administrative_return(%L,'e3000000-0000-4000-8000-000000000003','confirmed_in_person',null,null,null)$$,(select visit_id from phase4_active)),'double administrative return is idempotent');
reset role;
select is((select count(*) from public.audit_logs where action='administrative_individual_return_recorded' and target_id='e3000000-0000-4000-8000-000000000003'),1::bigint,'double return creates one audit event');
select is((select status::text from public.visits where id=(select visit_id from phase4_active)),'completed','last administrative return completes the ascent');

set local role authenticated;
select pg_temp.authenticate_as('e2000000-0000-4000-8000-000000000002');
select is(pg_temp.sqlstate_from($$select public.staff_save_notification('{"title_es":"Bloqueada","body_es":"Sin permiso","priority":"info","audience":"all_users","status":"published"}')$$),'42501','manager without notification permission cannot publish');
reset role; update public.staff_permissions set can_manage_notifications=true where user_id='e2000000-0000-4000-8000-000000000002';
set local role authenticated; select pg_temp.authenticate_as('e2000000-0000-4000-8000-000000000002');
select lives_ok($$select public.staff_save_notification('{"title_es":"Aviso","body_es":"Mensaje de prueba","priority":"caution","audience":"all_users","status":"published"}')$$,'authorized manager can publish');
select is((select count(*) from public.get_my_notifications()),1::bigint,'all-users audience reaches the authorized manager');
select lives_ok($$select public.snooze_notification((select notification_id from public.get_my_notifications() limit 1))$$,'recipient can snooze once');
select is(pg_temp.sqlstate_from($$select public.snooze_notification((select notification_id from public.get_my_notifications() limit 1))$$),'P0001','recipient cannot snooze twice');
select lives_ok($$select public.mark_notification_read((select notification_id from public.get_my_notifications() limit 1))$$,'recipient can close a notification');
select is((select count(*) from public.get_my_notifications() where read_at is not null),1::bigint,'read notification remains in history');
select lives_ok($$select public.register_push_subscription('https://push.example.invalid/phase4','p256dh-test','auth-test','pgTAP')$$,'user can register own push subscription');
reset role;
select is((select count(*) from public.push_subscriptions where user_id='e2000000-0000-4000-8000-000000000002'),1::bigint,'push subscription is bound to the authenticated user');

select * from finish();
rollback;
