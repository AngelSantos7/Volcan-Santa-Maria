begin;

create extension if not exists pgtap with schema extensions;
select plan(9);

insert into auth.users (
  id,
  email,
  email_confirmed_at,
  raw_user_meta_data
) values (
  'f1000000-0000-4000-8000-000000000001',
  'multiple-minors@example.invalid',
  now(),
  '{"first_name":"Persona","last_name":"Responsable"}'
);

update public.profiles
set
  date_of_birth = '1990-01-01',
  sex = 'female',
  nationality_country_code = 'GT',
  phone = '+50255550101',
  document_type = 'passport',
  document_number = 'MINORS-REGRESSION'
where id = 'f1000000-0000-4000-8000-000000000001';

insert into public.emergency_contacts (
  user_id,
  first_name,
  last_name,
  relationship,
  phone
) values (
  'f1000000-0000-4000-8000-000000000001',
  'Contacto',
  'Prueba',
  'Familiar',
  '+50255550102'
);

create function pg_temp.authenticate_as(requested_user_id uuid)
returns void
language plpgsql
as $$
begin
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', requested_user_id, 'role', 'authenticated')::text,
    true
  );
  perform set_config('request.jwt.claim.sub', requested_user_id::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
end;
$$;

create function pg_temp.sqlstate_from(command text)
returns text language plpgsql as $$
begin execute command; return null; exception when others then return sqlstate; end;
$$;

set local role authenticated;
select pg_temp.authenticate_as('f1000000-0000-4000-8000-000000000001');

create temporary table created_zero as
select created.visit_id from public.create_group_visit_with_minors(
  'day_hike',null,now()+interval '8 hours',false,null,true,true,'now','[]'::jsonb,false
) created;
grant select on created_zero to authenticated;
select is((select count(*) from public.visit_minors where visit_id=(select visit_id from created_zero)),0::bigint,'atomic creation supports zero minors');
select public.cancel_group_visit((select visit_id from created_zero));

create temporary table created_one as
select created.visit_id from public.create_group_visit_with_minors(
  'expedition_camping',now()+interval '2 days',now()+interval '3 days',false,null,true,true,'scheduled',
  '[{"full_name":"Menor Único","age":7,"sex":"female","relationship":"child"}]'::jsonb,true
) created;
grant select on created_one to authenticated;
select is((select count(*) from public.visit_minors where visit_id=(select visit_id from created_one)),1::bigint,'planned expedition creation supports one minor');
select public.cancel_group_visit((select visit_id from created_one));

create temporary table created_three as
select created.visit_id from public.create_group_visit_with_minors(
  'expedition_camping',null,now()+interval '1 day',false,null,true,true,'now',
  '[{"full_name":"Menor A","age":5,"sex":"female","relationship":"child"},{"full_name":"Menor B","age":9,"sex":"male","relationship":"sibling"},{"full_name":"Menor C","age":15,"sex":"female","relationship":"cousin"}]'::jsonb,true
) created;
grant select on created_three to authenticated;
select is((select count(*) from public.visit_minors where visit_id=(select visit_id from created_three)),3::bigint,'immediate expedition creation supports three minors');
select is((select count(*) from public.visit_minors where visit_id=(select visit_id from created_three) and responsibility_consent_version='1.0' and responsibility_consent_accepted_at is not null),3::bigint,'each minor records versioned responsibility consent');
select public.cancel_group_visit((select visit_id from created_three));

select is(pg_temp.sqlstate_from($$select * from public.create_group_visit_with_minors(
  'day_hike',null,now()+interval '8 hours',false,null,true,true,'now',
  '[{"full_name":"Sin Consentimiento","age":10,"sex":"male","relationship":"child"}]'::jsonb,false
)$$),'23514','creation rejects minors without responsibility consent');

create temporary table created_visit as
select created.visit_id
from public.create_group_visit_with_minors(
  'day_hike',
  now() + interval '1 day',
  now() + interval '1 day 8 hours',
  false,
  null,
  true,
  true,
  'scheduled',
  '[
    {"full_name":"Menor Uno","age":8,"sex":"female","relationship":"child"},
    {"full_name":"Menor Dos","age":12,"sex":"male","relationship":"sibling"}
  ]'::jsonb,
  true
) as created;

grant select on created_visit to authenticated;

select is(
  (select count(*) from created_visit),
  1::bigint,
  'atomic creation returns one visit when two minors are supplied'
);

reset role;

select is(
  (
    select count(*)
    from public.visit_minors
    where visit_id = (select visit_id from created_visit)
  ),
  2::bigint,
  'both minors are persisted'
);

select is(
  (
    select count(distinct responsible_member_id)
    from public.visit_minors
    where visit_id = (select visit_id from created_visit)
  ),
  1::bigint,
  'both minors retain the registering adult as responsible'
);

select is(
  (
    select count(*)
    from public.visit_members
    where visit_id = (select visit_id from created_visit)
  ),
  1::bigint,
  'minors do not create adult memberships'
);

select * from finish();
rollback;
