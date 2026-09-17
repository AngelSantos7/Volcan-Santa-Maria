begin;

create extension if not exists pgtap with schema extensions;

select plan(15);

select has_table('public', 'announcements', 'announcements table exists');

select columns_are(
  'public',
  'announcements',
  array[
    'id', 'title_es', 'title_en', 'message_es', 'message_en',
    'announcement_type', 'priority', 'show_on_login',
    'show_on_create_ascent', 'starts_at', 'ends_at', 'is_active',
    'dismissible', 'created_at', 'updated_at'
  ],
  'announcements exposes the planned fields'
);

select ok(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.announcements'::regclass),
  'announcements has RLS enabled'
);

select ok(has_table_privilege('anon', 'public.announcements', 'SELECT'), 'anon can select announcements');
select ok(has_table_privilege('authenticated', 'public.announcements', 'SELECT'), 'authenticated can select announcements');

select ok(
  not has_table_privilege('anon', 'public.announcements', 'INSERT')
  and not has_table_privilege('anon', 'public.announcements', 'UPDATE')
  and not has_table_privilege('anon', 'public.announcements', 'DELETE'),
  'anon cannot mutate announcements'
);

select ok(
  not has_table_privilege('authenticated', 'public.announcements', 'INSERT')
  and not has_table_privilege('authenticated', 'public.announcements', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.announcements', 'DELETE'),
  'authenticated cannot mutate announcements'
);

select results_eq(
  $$ select announcement_type, dismissible, show_on_login, show_on_create_ascent from public.announcements where title_es = 'Cuida el Volcán Santa María' $$,
  $$ values ('environmental'::text, true, true, true) $$,
  'the initial environmental announcement is present and dismissible'
);

insert into public.announcements (message_es, is_active) values ('Inactivo', false);
insert into public.announcements (message_es, starts_at) values ('Futuro', now() + interval '1 day');
insert into public.announcements (message_es, ends_at) values ('Expirado', now() - interval '1 day');

set local role anon;
select is((select count(*) from public.announcements), 1::bigint, 'anon only sees current active announcements');
reset role;

set local role authenticated;
select is((select count(*) from public.announcements), 1::bigint, 'authenticated only sees current active announcements');
reset role;

select throws_ok(
  $$ insert into public.announcements (message_es, announcement_type) values ('Inválido', 'other') $$,
  '23514',
  null,
  'unsupported announcement types are rejected'
);

select throws_ok(
  $$ insert into public.announcements (message_es) values ('   ') $$,
  '23514',
  null,
  'blank Spanish messages are rejected'
);

select throws_ok(
  $$ insert into public.announcements (message_es, starts_at, ends_at) values ('Fechas', now(), now() - interval '1 hour') $$,
  '23514',
  null,
  'invalid date windows are rejected'
);

select is(
  (select count(*) from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'announcements'),
  1::bigint,
  'announcements has one read-only RLS policy'
);

select ok(
  exists (
    select 1 from pg_catalog.pg_trigger
    where tgrelid = 'public.announcements'::regclass
      and tgname = 'announcements_before_update_set_updated_at'
      and not tgisinternal
  ),
  'announcements updates its timestamp through a trigger'
);

select * from finish();
rollback;
