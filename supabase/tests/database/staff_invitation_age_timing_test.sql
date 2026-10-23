begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select ok((select tgdeferrable and tginitdeferred from pg_trigger
  where tgname='auth_users_check_registration_age' and tgrelid='auth.users'::regclass),
  'Passwordless age validation is mandatory and initially deferred');
select ok(not has_function_privilege('authenticated','public.check_new_user_age_at_commit()','EXECUTE'),
  'Clients cannot execute the security definer trigger function');
select ok(not has_table_privilege('authenticated','auth.users','INSERT'), 'Clients cannot insert Auth identities');
select ok(not has_column_privilege('authenticated','auth.users','invited_at','UPDATE'), 'Clients cannot forge trusted invited_at');
select ok(not has_table_privilege('authenticated','public.user_roles','UPDATE'), 'Clients cannot promote roles');

-- Model the actual GoTrue ordering, rather than pre-populating invited_at.
insert into auth.users(id,email,raw_user_meta_data) values
('fa230000-0000-4000-8000-000000000001','timing-invite@example.invalid',
 '{"first_name":"Synthetic","last_name":"Invite","staff_invitation":true}');
select is((select role::text from public.user_roles where user_id='fa230000-0000-4000-8000-000000000001'),
  'tourist','Metadata does not assign staff role before trusted backend provisioning');
select is((select count(*) from public.staff_permissions where user_id='fa230000-0000-4000-8000-000000000001'),
  0::bigint,'Insertion creates no staff permissions');
update auth.users set invited_at=now() where id='fa230000-0000-4000-8000-000000000001';
select lives_ok('set constraints auth.auth_users_check_registration_age immediate',
  'Auth invitation marker written later in the same transaction passes final validation');
select is((select date_of_birth from public.profiles where id='fa230000-0000-4000-8000-000000000001'),
  null::date,'No fabricated birth date is required');

-- Subtransactions ensure a failed deferred check leaves no identity or profile.
create function pg_temp.try_passwordless(p_id uuid, p_data jsonb) returns void language plpgsql as $$
begin
  set constraints auth.auth_users_check_registration_age deferred;
  insert into auth.users(id,email,raw_user_meta_data) values(p_id,p_id::text||'@example.invalid',p_data);
  set constraints auth.auth_users_check_registration_age immediate;
end;
$$;
select throws_ok($$select pg_temp.try_passwordless('fa230000-0000-4000-8000-000000000002','{}')$$,
  '23514','adult_required','No-password signup without DOB cannot commit');
select throws_ok($$select pg_temp.try_passwordless('fa230000-0000-4000-8000-000000000003',
  '{"staff_invitation":true,"invited_at":"2026-10-23","role":"admin","app_metadata":{"role":"visitor_manager"}}')$$,
  '23514','adult_required','Forged metadata cannot pass the deferred constraint');
select throws_ok($$select pg_temp.try_passwordless('fa230000-0000-4000-8000-000000000004',
  jsonb_build_object('date_of_birth',((now() at time zone 'America/Guatemala')::date-interval '17 years')::date))$$,
  '23514','adult_required','Passwordless minor cannot commit');
select is((select count(*) from auth.users where id in
  ('fa230000-0000-4000-8000-000000000002','fa230000-0000-4000-8000-000000000003','fa230000-0000-4000-8000-000000000004')),
  0::bigint,'Rejected passwordless identities roll back');
select is((select count(*) from public.profiles where id in
  ('fa230000-0000-4000-8000-000000000002','fa230000-0000-4000-8000-000000000003','fa230000-0000-4000-8000-000000000004')),
  0::bigint,'Rejected profiles roll back too');

select lives_ok($$select pg_temp.try_passwordless('fa230000-0000-4000-8000-000000000005',
  jsonb_build_object('date_of_birth',((now() at time zone 'America/Guatemala')::date-interval '18 years')::date,'staff_invitation',true,'role','admin'))$$,
  'Exactly 18 passes even when the check is deferred');
select is((select role::text from public.user_roles where user_id='fa230000-0000-4000-8000-000000000005'),
  'tourist','Adult forged metadata still grants only tourist');
select throws_ok($$insert into auth.users(id,email,encrypted_password,raw_user_meta_data) values
  ('fa230000-0000-4000-8000-000000000006','password-minor@example.invalid','synthetic-nonempty-hash',
  jsonb_build_object('date_of_birth',((now() at time zone 'America/Guatemala')::date-interval '17 years')::date))$$,
  '23514','adult_required','Password signup minor still fails immediately');

select * from finish();
rollback;
