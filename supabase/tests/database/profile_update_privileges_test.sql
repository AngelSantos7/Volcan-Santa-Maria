begin;

create extension if not exists pgtap with schema extensions;
select plan(12);

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('f1000000-0000-4000-8000-000000000001', 'profile-owner@example.invalid', now(), '{"first_name":"Perfil","last_name":"Propio"}'),
  ('f2000000-0000-4000-8000-000000000002', 'profile-other@example.invalid', now(), '{"first_name":"Perfil","last_name":"Ajeno"}');

create function pg_temp.authenticate_as(requested_user_id uuid, requested_role text default 'authenticated')
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub', requested_user_id, 'role', requested_role)::text, true);
  perform set_config('request.jwt.claim.sub', requested_user_id::text, true);
  perform set_config('request.jwt.claim.role', requested_role, true);
end;
$$;

create function pg_temp.sqlstate_from(command text)
returns text language plpgsql as $$
begin
  execute command;
  return null;
exception when others then
  return sqlstate;
end;
$$;

select ok(has_table_privilege('authenticated', 'public.profiles', 'UPDATE'), 'authenticated has the required table UPDATE grant');
select ok(has_column_privilege('authenticated', 'public.profiles', 'sex', 'UPDATE'), 'authenticated can update the sex profile field');
select ok(has_column_privilege('authenticated', 'public.profiles', 'first_name', 'UPDATE'), 'authenticated can update an established profile field');
select ok(not has_table_privilege('anon', 'public.profiles', 'UPDATE'), 'anon has no UPDATE privilege on profiles');
select ok((select relrowsecurity from pg_class where oid = 'public.profiles'::regclass), 'RLS remains enabled on profiles');
select is((select count(*) from pg_policies where schemaname='public' and tablename='profiles' and policyname='profiles_update_own_profile' and cmd='UPDATE'), 1::bigint, 'own-profile UPDATE policy remains installed');

set local role authenticated;
select pg_temp.authenticate_as('f1000000-0000-4000-8000-000000000001');
select lives_ok($$update public.profiles set first_name='Nombre actualizado', sex='female' where id='f1000000-0000-4000-8000-000000000001'$$, 'authenticated user can update their own complete profile');
select lives_ok($$update public.profiles set first_name='No permitido' where id='f2000000-0000-4000-8000-000000000002'$$, 'attempt to update another profile is filtered by RLS');
select is(pg_temp.sqlstate_from($$update public.profiles set created_at=created_at + interval '1 day' where id='f1000000-0000-4000-8000-000000000001'$$), '42501', 'authenticated cannot change server-managed profile fields');

reset role;
select is((select first_name from public.profiles where id='f1000000-0000-4000-8000-000000000001'), 'Nombre actualizado', 'own profile update is persisted');
select is((select first_name from public.profiles where id='f2000000-0000-4000-8000-000000000002'), 'Perfil', 'another user profile is not modified');

set local role anon;
select pg_temp.authenticate_as('f1000000-0000-4000-8000-000000000001', 'anon');
select is(pg_temp.sqlstate_from($$update public.profiles set first_name='Anónimo' where id='f1000000-0000-4000-8000-000000000001'$$), '42501', 'anon cannot update profiles');

select * from finish();
rollback;
