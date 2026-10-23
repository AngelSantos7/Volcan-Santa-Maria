begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select is(
  (select enabled from public.runtime_feature_flags where feature = 'web_push'),
  false,
  'Web Push is disabled by default in PostgreSQL'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.runtime_feature_flags'::regclass),
  'feature flags keep RLS enabled'
);
select ok(
  not has_table_privilege('anon', 'public.runtime_feature_flags', 'SELECT')
    and not has_table_privilege('authenticated', 'public.runtime_feature_flags', 'SELECT'),
  'clients cannot read backend feature flags'
);
select ok(
  not has_table_privilege('anon', 'public.runtime_feature_flags', 'UPDATE')
    and not has_table_privilege('authenticated', 'public.runtime_feature_flags', 'UPDATE'),
  'clients cannot enable backend feature flags'
);
select ok(
  has_table_privilege('service_role', 'public.runtime_feature_flags', 'SELECT')
    and has_table_privilege('service_role', 'public.runtime_feature_flags', 'UPDATE'),
  'service role can manage the protected backend flag'
);

insert into auth.users(id, email, raw_user_meta_data)
values (
  'fa570000-0000-4000-8000-000000000001',
  'push-disabled@example.invalid',
  '{"date_of_birth":"1990-01-01"}'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"fa570000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
select throws_ok(
  $$select public.register_push_subscription(
    'https://fcm.googleapis.com/fcm/send/synthetic-disabled',
    'synthetic-key',
    'synthetic-auth'
  )$$,
  '55000',
  'Web Push is disabled.',
  'authenticated registration is rejected while Web Push is disabled'
);
reset role;

select is(
  (select count(*) from public.push_subscriptions where user_id = 'fa570000-0000-4000-8000-000000000001'),
  0::bigint,
  'disabled registration persists no subscription'
);
select ok(
  has_function_privilege('authenticated', 'public.get_my_notifications()', 'EXECUTE'),
  'in-app notification retrieval remains available'
);
select ok(
  has_function_privilege('authenticated', 'public.mark_notification_read(uuid)', 'EXECUTE')
    and has_function_privilege('authenticated', 'public.snooze_notification(uuid)', 'EXECUTE'),
  'in-app notification history actions remain available'
);
select ok(
  has_function_privilege('service_role', 'public.publish_due_notifications()', 'EXECUTE'),
  'scheduled in-app publication remains available to the service role'
);

select * from finish();
rollback;
