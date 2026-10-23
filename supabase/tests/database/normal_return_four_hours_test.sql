begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
('fd000000-0000-4000-8000-000000000001','return-four-hours@example.invalid',now(),'{"first_name":"Prueba","last_name":"Retorno","date_of_birth":"1980-01-01"}');
update public.profiles set nationality_country_code='MX',phone='+525555551111',document_type='passport',document_number='FOUR-HOUR-TEST'
where id='fd000000-0000-4000-8000-000000000001';
insert into public.emergency_contacts(user_id,first_name,last_name,relationship,phone) values
('fd000000-0000-4000-8000-000000000001','Contacto','Prueba','sibling','+525555552222');
select set_config('request.jwt.claims','{"sub":"fd000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;
create temporary table timed_visit as select * from public.create_group_visit_with_minors(
  (select id from public.routes where slug='ascenso-a-la-cima'),'day_hike',null,now()+interval '8 hours',false,null,true,true,'now',
  '[{"full_name":"Menor prueba","age":8,"sex":"male","relationship":"child"}]',true);
select public.start_group_visit((select visit_id from timed_visit));
select throws_ok($$select public.complete_my_visit_participation((select visit_id from timed_visit))$$,'23514','early_return_required','normal checkout is rejected before four hours');
reset role;
-- Only this transaction's fixture moves in time; no production data or triggers change.
update public.visits set started_at=now()-interval '3 hours 59 minutes' where id=(select visit_id from timed_visit);
set local role authenticated;
select throws_ok($$select public.complete_my_visit_participation((select visit_id from timed_visit))$$,'23514','early_return_required','one minute before unlock remains rejected');
reset role;
update public.visits set started_at=now()-interval '4 hours' where id=(select visit_id from timed_visit);
set local role authenticated;
select lives_ok($$select public.complete_my_visit_participation((select visit_id from timed_visit))$$,'normal checkout works at four hours even when estimate is later');
select is((select status::text from public.visits where id=(select visit_id from timed_visit)),'completed','group completes normally');
select is((select member_status::text from public.visit_members where visit_id=(select visit_id from timed_visit)),'completed','adult completion is normal');
select is((select operational_status::text from public.get_visit_minors((select visit_id from timed_visit))),'completed','minor returns with responsible adult');
select ok((select expected_return_at>clock_timestamp() from public.visits where id=(select visit_id from timed_visit)),'future estimate is preserved');
select * from finish();
rollback;
