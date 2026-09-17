begin;

create extension if not exists pgtap with schema extensions;

select plan(24);

create function pg_temp.sqlstate_from(command text)
returns text
language plpgsql
as $$
begin
  execute command;
  return null;
exception
  when others then
    return sqlstate;
end;
$$;

select has_table(
  'public',
  'route_checkpoints',
  'route checkpoints table exists'
);

select has_table(
  'public',
  'route_media',
  'route media table exists'
);

select columns_are(
  'public',
  'routes',
  array[
    'id',
    'slug',
    'name_es',
    'name_en',
    'is_active',
    'created_at',
    'updated_at',
    'description_es',
    'description_en',
    'difficulty',
    'distance_km',
    'estimated_duration_minutes',
    'elevation_gain_m',
    'path_geojson'
  ],
  'routes exposes the informational fields'
);

select columns_are(
  'public',
  'route_checkpoints',
  array[
    'id',
    'route_id',
    'sequence',
    'checkpoint_type',
    'name_es',
    'name_en',
    'description_es',
    'description_en',
    'latitude',
    'longitude',
    'altitude_m',
    'created_at'
  ],
  'route checkpoints exposes only the planned fields'
);

select columns_are(
  'public',
  'route_media',
  array[
    'id',
    'route_id',
    'checkpoint_id',
    'storage_path',
    'caption_es',
    'caption_en',
    'sort_order',
    'is_cover',
    'created_at'
  ],
  'route media stores paths and metadata rather than image data'
);

select results_eq(
  $$
    select slug, name_es, name_en, is_active
    from public.routes
    where slug = 'ascenso-a-la-cima'
  $$,
  $$
    values (
      'ascenso-a-la-cima'::text,
      'Ascenso a la Cima'::text,
      'Summit Route'::text,
      true
    )
  $$,
  'the canonical summit route exists and is active'
);

select is(
  (select count(*) from public.routes where slug = 'ascenso-cima'),
  0::bigint,
  'the former route slug was normalized without creating a duplicate route'
);

select results_eq(
  $$
    select
      description_es is null,
      description_en is null,
      difficulty is null,
      distance_km is null,
      estimated_duration_minutes is null,
      elevation_gain_m is null,
      path_geojson is null
    from public.routes
    where slug = 'ascenso-a-la-cima'
  $$,
  $$ values (true, true, true, true, true, true, true) $$,
  'unknown route facts and geometry remain null'
);

select ok(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.routes'::regclass),
  'routes has row level security enabled'
);

select ok(
  (
    select relrowsecurity
    from pg_catalog.pg_class
    where oid = 'public.route_checkpoints'::regclass
  ),
  'route checkpoints has row level security enabled'
);

select ok(
  (
    select relrowsecurity
    from pg_catalog.pg_class
    where oid = 'public.route_media'::regclass
  ),
  'route media has row level security enabled'
);

select ok(
  has_table_privilege('authenticated', 'public.route_checkpoints', 'SELECT'),
  'authenticated tourists can read route checkpoints'
);

select ok(
  has_table_privilege('authenticated', 'public.route_media', 'SELECT'),
  'authenticated tourists can read route media metadata'
);

select ok(
  not has_table_privilege('authenticated', 'public.routes', 'INSERT')
  and not has_table_privilege('authenticated', 'public.routes', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.routes', 'DELETE'),
  'authenticated tourists cannot mutate routes'
);

select ok(
  not has_table_privilege('authenticated', 'public.route_checkpoints', 'INSERT')
  and not has_table_privilege('authenticated', 'public.route_checkpoints', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.route_checkpoints', 'DELETE'),
  'authenticated tourists cannot mutate route checkpoints'
);

select ok(
  not has_table_privilege('authenticated', 'public.route_media', 'INSERT')
  and not has_table_privilege('authenticated', 'public.route_media', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.route_media', 'DELETE'),
  'authenticated tourists cannot mutate route media'
);

select is(
  (select count(*) from public.route_checkpoints),
  0::bigint,
  'the migration creates no fictional checkpoints'
);

select is(
  (select count(*) from public.route_media),
  0::bigint,
  'the migration creates no fictional media'
);

select lives_ok(
  $$
    insert into public.route_checkpoints (
      route_id,
      sequence,
      checkpoint_type,
      name_es,
      name_en
    )
    select
      route.id,
      checkpoint.sequence,
      checkpoint.checkpoint_type,
      checkpoint.name_es,
      checkpoint.name_en
    from public.routes as route
    cross join (
      values
        (1, 'start', 'Inicio de prueba', 'Test start'),
        (2, 'reference', 'Referencia de prueba', 'Test reference'),
        (3, 'rest', 'Descanso de prueba', 'Test rest stop'),
        (4, 'viewpoint', 'Mirador de prueba', 'Test viewpoint'),
        (5, 'summit', 'Cima de prueba', 'Test summit')
    ) as checkpoint(sequence, checkpoint_type, name_es, name_en)
    where route.slug = 'ascenso-a-la-cima'
  $$,
  'all planned checkpoint types are accepted'
);

select is(
  pg_temp.sqlstate_from(
    $$
      insert into public.route_checkpoints (
        route_id,
        sequence,
        checkpoint_type,
        name_es,
        name_en
      )
      select id, 99, 'unknown', 'Inválido', 'Invalid'
      from public.routes
      where slug = 'ascenso-a-la-cima'
    $$
  ),
  '23514',
  'unknown checkpoint types are rejected'
);

insert into public.routes (slug, name_es, name_en, is_active)
values ('inactive-test-route', 'Ruta inactiva', 'Inactive route', false);

insert into public.route_checkpoints (
  route_id,
  sequence,
  checkpoint_type,
  name_es,
  name_en
)
select id, 1, 'start', 'Inicio inactivo', 'Inactive start'
from public.routes
where slug = 'inactive-test-route';

insert into public.route_media (route_id, storage_path)
select id, 'routes/test-active.jpg'
from public.routes
where slug = 'ascenso-a-la-cima';

insert into public.route_media (route_id, storage_path)
select id, 'routes/test-inactive.jpg'
from public.routes
where slug = 'inactive-test-route';

set local role authenticated;

select is(
  (select count(*) from public.routes),
  1::bigint,
  'RLS exposes only active routes to authenticated tourists'
);

select is(
  (select count(*) from public.route_checkpoints),
  5::bigint,
  'RLS exposes checkpoints only for active routes'
);

select is(
  (select count(*) from public.route_media),
  1::bigint,
  'RLS exposes media only for active routes'
);

reset role;

select ok(
  exists (
    select 1
    from pg_catalog.pg_constraint as constraint_record
    where constraint_record.conrelid = 'public.visits'::regclass
      and constraint_record.confrelid = 'public.routes'::regclass
      and constraint_record.contype = 'f'
  ),
  'visits remains linked to routes by foreign key'
);

select * from finish();

rollback;
