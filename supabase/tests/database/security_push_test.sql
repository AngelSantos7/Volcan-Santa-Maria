begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
update public.runtime_feature_flags set enabled = true where feature = 'web_push';
insert into auth.users(id,email,raw_user_meta_data) values
('fa550000-0000-4000-8000-000000000001','push-test-a@example.invalid','{"date_of_birth":"1990-01-01"}'),
('fa550000-0000-4000-8000-000000000002','push-test-b@example.invalid','{"date_of_birth":"1990-01-01"}');
create function pg_temp.authenticate_as(p_id uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claims',jsonb_build_object('sub',p_id,'role','authenticated')::text,true); end; $$;
create function pg_temp.sqlstate_from(command text) returns text language plpgsql as $$
begin execute command; return null; exception when others then return sqlstate; end; $$;
select ok((select relrowsecurity from pg_class where oid='public.push_subscriptions'::regclass),'RLS remains enabled');
select ok(not has_table_privilege('authenticated','public.push_subscriptions','TRUNCATE'),'No RLS-bypassing TRUNCATE privilege');
select ok(not has_table_privilege('authenticated','public.push_subscriptions','INSERT'),'Client writes must use the RPC');
select ok(not has_function_privilege('anon','public.register_push_subscription(text,text,text,text)','EXECUTE'),'Anonymous cannot execute registration');
select ok((select prosecdef and proconfig @> array['search_path=""'] from pg_proc where oid='public.register_push_subscription(text,text,text,text)'::regprocedure),'Registration remains security definer with empty search_path');

select pg_temp.authenticate_as('fa550000-0000-4000-8000-000000000001');
set local role authenticated;
select lives_ok($$select public.register_push_subscription('https://fcm.googleapis.com/fcm/send/synthetic-owned','synthetic-A1','synthetic-auth-A1','test')$$,'A registers own subscription');
reset role;
create temp table original_push_id as select id from public.push_subscriptions where user_id='fa550000-0000-4000-8000-000000000001';
set local role authenticated;
select lives_ok($$select public.register_push_subscription('https://fcm.googleapis.com/fcm/send/synthetic-owned','synthetic-A2','synthetic-auth-A2','renewed')$$,'A renews own keys');
select lives_ok($$select public.register_push_subscription('https://web.push.apple.com/synthetic-second','synthetic-A3','synthetic-auth-A3')$$,'A registers a second endpoint');
reset role;
select is((select id from public.push_subscriptions where endpoint='https://fcm.googleapis.com/fcm/send/synthetic-owned'),(select id from original_push_id),'Renewal preserves UUID contract');
select ok((select p256dh='synthetic-A2' and auth='synthetic-auth-A2' from public.push_subscriptions where id=(select id from original_push_id)),'Renewal stores both new keys');
select is((select count(*) from public.push_subscriptions where user_id='fa550000-0000-4000-8000-000000000001'),2::bigint,'Multiple own endpoints retained');

select pg_temp.authenticate_as('fa550000-0000-4000-8000-000000000002');
set local role authenticated;
select throws_ok($$select public.register_push_subscription('https://fcm.googleapis.com/fcm/send/synthetic-owned','synthetic-B','synthetic-auth-B')$$,'42501','Unable to register push subscription.','Original takeover exploit denied');
select throws_ok($$select public.register_push_subscription('https://fcm.googleapis.com/fcm/send/synthetic-owned','synthetic-B2','synthetic-auth-B2')$$,'42501','Unable to register push subscription.','Repeated cross-owner key replacement denied');
select is(pg_temp.sqlstate_from('select * from public.push_subscriptions'),'42501','direct subscription reads are denied to B');
select lives_ok($$select public.remove_push_subscription('https://fcm.googleapis.com/fcm/send/synthetic-owned')$$,'Removal RPC hides foreign ownership');
reset role;
select ok((select user_id='fa550000-0000-4000-8000-000000000001' and p256dh='synthetic-A2' and auth='synthetic-auth-A2' from public.push_subscriptions where id=(select id from original_push_id)),'Owner and both keys unchanged after attacks and foreign removal');

set local role anon;
select throws_ok($$select public.register_push_subscription('https://fcm.googleapis.com/fcm/send/synthetic-anon','x','y')$$,'42501',null,'Anonymous registration denied');
reset role;
select pg_temp.authenticate_as(null);
set local role authenticated;
select throws_ok($$select public.register_push_subscription('https://fcm.googleapis.com/fcm/send/synthetic-no-session','x','y')$$,'42501','Authentication is required.','Missing identity denied inside security definer');
reset role;
select pg_temp.authenticate_as('fa550000-0000-4000-8000-000000000001');
set local role authenticated;
select throws_ok($$select public.register_push_subscription('https://127.0.0.1:65500/sec-canary','x','y')$$,'22023','Invalid push subscription.','Original internal endpoint registration denied');
select throws_ok($$select public.register_push_subscription('http://127.0.0.1/push','x','y')$$,'22023','Invalid push subscription.','HTTP destination denied');
select throws_ok($$select public.register_push_subscription('https://[::1]/push','x','y')$$,'22023','Invalid push subscription.','IPv6 loopback denied');
select throws_ok($$select public.register_push_subscription('https://192.168.1.1/push','x','y')$$,'22023','Invalid push subscription.','Private address denied');
select throws_ok($$select public.register_push_subscription('https://internal/push','x','y')$$,'22023','Invalid push subscription.','Internal hostname denied');
select throws_ok($$select public.register_push_subscription('https://fcm.googleapis.com:8443/push','x','y')$$,'22023','Invalid push subscription.','Unexpected port denied');
select throws_ok($$select public.register_push_subscription('invalid','x','y')$$,'22023','Invalid push subscription.','Malformed URL denied');
select throws_ok($$select public.register_push_subscription('https://fcm.googleapis.com/fcm/send/synthetic-empty',null,'y')$$,'22023','Invalid push subscription.','Missing key denied safely');
select lives_ok($$select public.remove_push_subscription('https://web.push.apple.com/synthetic-second')$$,'Own removal preserved');
reset role;
select is((select count(*) from public.push_subscriptions where endpoint='https://web.push.apple.com/synthetic-second'),0::bigint,'Own removal deletes only the target');
select throws_ok($$insert into public.push_subscriptions(user_id,endpoint,p256dh,auth) values('fa550000-0000-4000-8000-000000000001','https://10.0.0.1/push','x','y')$$,
  '23514',null,'Table constraint also protects privileged inserts');
select * from finish();
rollback;
