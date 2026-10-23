begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
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

create function pg_temp.authenticate_as(p_id uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claims',jsonb_build_object('sub',p_id,'role','authenticated')::text,true); end; $$;
select pg_temp.authenticate_as('fc000000-0000-4000-8000-000000000001');
set local role authenticated;
create temporary table final_group as select * from public.create_group_visit_with_minors(
  (select id from public.routes where slug='ascenso-a-la-cima'),'day_hike',null,now()+interval '8 hours',false,null,true,true,'now',
  '[{"full_name":"Menor acompañado","age":8,"sex":"male","relationship":"child"}]',true);
grant select on final_group to authenticated;

select lives_ok($$select * from public.add_my_visit_minors((select visit_id from final_group), '[{"full_name":"Segundo menor","age":16,"sex":"female","relationship":"cousin"}]',true)$$,'organizer adds second minor');
select is((select count(*) from public.get_visit_minors((select visit_id from final_group)) where responsible_member_id=auth.uid()),2::bigint,'organizer has two minors');
select pg_temp.authenticate_as('fc000000-0000-4000-8000-000000000002');
select public.join_group_visit((select join_code from final_group),true);
select lives_ok($$select * from public.add_my_visit_minors((select visit_id from final_group), '[{"full_name":"Carlos","age":12,"sex":"male","relationship":"child"}]',true)$$,'member adds own minor');
select is((select count(*) from public.get_visit_minors((select visit_id from final_group)) where responsible_member_id=auth.uid()),1::bigint,'member owns Carlos');
select throws_ok($$select public.remove_my_visit_minor((select visit_id from final_group),(select id from public.get_visit_minors((select visit_id from final_group)) where full_name='Segundo menor'))$$,'42501','Only the responsible adult can remove this minor.','member cannot remove another adult minor');
select lives_ok($$select public.remove_my_visit_minor((select visit_id from final_group),(select id from public.get_visit_minors((select visit_id from final_group)) where full_name='Carlos'))$$,'member can remove own minor before start');
select * from public.add_my_visit_minors((select visit_id from final_group), '[{"full_name":"Carlos","age":12,"sex":"male","relationship":"child"}]',true);
select pg_temp.authenticate_as('fc000000-0000-4000-8000-000000000001');
select lives_ok($$select public.change_visit_route((select visit_id from final_group),(select id from public.routes where slug='mirador-picacho'))$$,'before start: summit to Picacho');
select lives_ok($$select public.change_visit_route((select visit_id from final_group),(select id from public.routes where slug='ascenso-a-la-cima'))$$,'before start: Picacho to summit');
select public.change_visit_route((select visit_id from final_group),(select id from public.routes where slug='mirador-picacho'));
select public.start_group_visit((select visit_id from final_group));
create temporary table route_snapshot as select to_jsonb(v)-'route_id'-'updated_at' snapshot from public.visits v where id=(select visit_id from final_group);
select throws_ok($$select * from public.add_my_visit_minors((select visit_id from final_group),'[{"full_name":"Too late","age":12,"sex":"male","relationship":"child"}]',true)$$,'P0001','Minors can be registered only before the ascent starts.','organizer blocked after start');
select pg_temp.authenticate_as('fc000000-0000-4000-8000-000000000002');
select throws_ok($$select * from public.add_my_visit_minors((select visit_id from final_group),'[{"full_name":"Too late","age":12,"sex":"male","relationship":"child"}]',true)$$,'P0001','Minors can be registered only before the ascent starts.','member blocked after start');
select throws_ok($$select public.remove_my_visit_minor((select visit_id from final_group),(select id from public.get_visit_minors((select visit_id from final_group)) where full_name='Carlos'))$$,'P0001','minors_before_start_only','remove blocked after start');
select is((select count(*) from public.get_visit_minors((select visit_id from final_group))),3::bigint,'all existing minors preserved');
select pg_temp.authenticate_as('fc000000-0000-4000-8000-000000000001');
select throws_ok($$select public.change_visit_route((select visit_id from final_group),(select id from public.routes where slug='ascenso-a-la-cima'))$$,'23514','route_return_confirmation_required','old two-arg call cannot bypass active confirmation');
select throws_ok($$select public.change_visit_route((select visit_id from final_group),(select id from public.routes where slug='ascenso-a-la-cima'),null)$$,'23514','route_return_confirmation_required','null confirmation rejected');
select throws_ok($$select public.change_visit_route((select visit_id from final_group),(select id from public.routes where slug='ascenso-a-la-cima'),false)$$,'23514','route_return_confirmation_required','false confirmation rejected');
select lives_ok($$select public.change_visit_route((select visit_id from final_group),(select id from public.routes where slug='ascenso-a-la-cima'),true)$$,'confirmed physical return allows active change');
select is((select to_jsonb(v)-'route_id'-'updated_at' from public.visits v where id=(select visit_id from final_group)),(select snapshot from route_snapshot),'route change preserves all visit fields including times and status');
select is((select count(*) from public.get_visit_minors((select visit_id from final_group))),3::bigint,'route change retains minors');
select is((select jsonb_array_length(participants) from public.get_group_visit_details((select visit_id from final_group))),2,'route change retains adults');
reset role;
select is((select count(*) from public.audit_logs where target_id=(select visit_id::text from final_group) and action='visit_route_changed'),4::bigint,'failed changes do not write audit; prior history retained');
select ok((select count(*)=1 from public.audit_logs where target_id=(select visit_id::text from final_group) and action='visit_route_changed' and actor_user_id='fc000000-0000-4000-8000-000000000001' and created_at is not null and metadata->>'returned_to_start_confirmed'='true' and metadata->>'return_confirmation_at' is not null and metadata ? 'previous_route_id' and metadata ? 'new_route_id'),'active audit includes both routes, actor, date and explicit return confirmation');
-- A malformed legacy forming state must still be locked when started_at exists.
update public.visits set status='forming' where id=(select visit_id from final_group);
set local role authenticated;
select throws_ok($$select * from public.add_my_visit_minors((select visit_id from final_group),'[{"full_name":"Too late","age":12,"sex":"male","relationship":"child"}]',true)$$,'P0001','Minors can be registered only before the ascent starts.','started_at independently locks minors');
select throws_ok($$select public.change_visit_route((select visit_id from final_group),(select id from public.routes where slug='mirador-picacho'))$$,'23514','route_return_confirmation_required','started_at independently requires confirmation');
reset role;
select * from finish();
rollback;
