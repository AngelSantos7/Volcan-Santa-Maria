alter table public.routes
  add column description_es text,
  add column description_en text,
  add column difficulty text,
  add column distance_km numeric,
  add column estimated_duration_minutes integer,
  add column elevation_gain_m integer,
  add column path_geojson jsonb,
  add constraint routes_distance_km_positive check (
    distance_km is null or distance_km > 0
  ),
  add constraint routes_estimated_duration_positive check (
    estimated_duration_minutes is null or estimated_duration_minutes > 0
  ),
  add constraint routes_elevation_gain_nonnegative check (
    elevation_gain_m is null or elevation_gain_m >= 0
  ),
  add constraint routes_path_geojson_is_object check (
    path_geojson is null or jsonb_typeof(path_geojson) = 'object'
  );

-- Keep the existing route UUID so every current visit remains linked to the
-- same canonical route while its public identifier and English name are
-- normalized for this module.
update public.routes
set
  slug = 'ascenso-a-la-cima',
  name_es = 'Ascenso a la Cima',
  name_en = 'Summit Route'
where slug = 'ascenso-cima';

create table public.route_checkpoints (
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null references public.routes (id) on delete cascade,
  sequence integer not null,
  checkpoint_type text,
  name_es text not null,
  name_en text not null,
  description_es text,
  description_en text,
  latitude numeric,
  longitude numeric,
  altitude_m integer,
  created_at timestamptz not null default now(),
  constraint route_checkpoints_route_sequence_unique unique (route_id, sequence),
  constraint route_checkpoints_sequence_positive check (sequence > 0),
  constraint route_checkpoints_type_allowed check (
    checkpoint_type is null
    or checkpoint_type in ('start', 'reference', 'rest', 'viewpoint', 'summit')
  ),
  constraint route_checkpoints_latitude_range check (
    latitude is null or latitude between -90 and 90
  ),
  constraint route_checkpoints_longitude_range check (
    longitude is null or longitude between -180 and 180
  )
);

create table public.route_media (
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null references public.routes (id) on delete cascade,
  checkpoint_id uuid references public.route_checkpoints (id) on delete cascade,
  storage_path text not null,
  caption_es text,
  caption_en text,
  sort_order integer default 0,
  is_cover boolean default false,
  created_at timestamptz not null default now(),
  constraint route_media_storage_path_not_blank check (
    nullif(btrim(storage_path), '') is not null
  )
);

create index route_checkpoints_route_sequence_idx
on public.route_checkpoints (route_id, sequence);

create index route_media_route_sort_order_idx
on public.route_media (route_id, sort_order);

create index route_media_checkpoint_id_idx
on public.route_media (checkpoint_id)
where checkpoint_id is not null;

alter table public.route_checkpoints enable row level security;
alter table public.route_media enable row level security;

revoke all on table public.route_checkpoints from anon, authenticated;
revoke all on table public.route_media from anon, authenticated;

grant select on table public.route_checkpoints to authenticated;
grant select on table public.route_media to authenticated;

create policy route_checkpoints_select_for_active_routes
on public.route_checkpoints
for select
to authenticated
using (
  exists (
    select 1
    from public.routes as route
    where route.id = route_checkpoints.route_id
      and route.is_active
  )
);

create policy route_media_select_for_active_routes
on public.route_media
for select
to authenticated
using (
  exists (
    select 1
    from public.routes as route
    where route.id = route_media.route_id
      and route.is_active
  )
);

-- The route slug is an implementation detail of this RPC. Its behavior,
-- validation, authorization, and return type remain unchanged.
create or replace function public.create_group_visit(
  p_visit_type public.visit_type,
  p_expected_return_at timestamptz,
  p_has_local_guide boolean,
  p_guide_name text,
  p_terms_accepted boolean
)
returns table (visit_id uuid, join_code text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  default_route_id uuid;
  new_visit_id uuid;
  new_join_code text;
  normalized_guide_name text;
begin
  if current_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'Authentication is required.';
  end if;

  if not public.is_current_user_email_verified() then
    raise exception using
      errcode = 'P0001',
      message = 'email_not_verified';
  end if;

  if coalesce(p_terms_accepted, false) is not true then
    raise exception using
      errcode = '23514',
      message = 'You must accept the group visit terms.';
  end if;

  if p_visit_type is null then
    raise exception using
      errcode = '22023',
      message = 'A group visit type is required.';
  end if;

  if p_expected_return_at is null
    or p_expected_return_at <= pg_catalog.clock_timestamp() then
    raise exception using
      errcode = '22023',
      message = 'Expected return time must be in the future.';
  end if;

  if coalesce(p_has_local_guide, false) then
    normalized_guide_name := nullif(pg_catalog.btrim(p_guide_name), '');
    if normalized_guide_name is null then
      raise exception using
        errcode = '23514',
        message = 'Guide name is required when the group has a local guide.';
    end if;
  else
    normalized_guide_name := null;
  end if;

  perform public.assert_group_visit_eligibility(current_user_id);
  perform public.assert_no_active_group_visit(current_user_id);

  select route.id
  into default_route_id
  from public.routes as route
  where route.slug = 'ascenso-a-la-cima'
    and route.is_active;

  if default_route_id is null then
    raise exception using
      errcode = 'P0002',
      message = 'The default summit route is not available.';
  end if;

  for attempt in 1..10 loop
    new_join_code := public.generate_group_join_code();

    begin
      insert into public.visits (
        route_id,
        created_by,
        join_code,
        visit_type,
        expected_return_at,
        has_local_guide,
        guide_name,
        status
      )
      values (
        default_route_id,
        current_user_id,
        new_join_code,
        p_visit_type,
        p_expected_return_at,
        coalesce(p_has_local_guide, false),
        normalized_guide_name,
        'forming'::public.visit_status
      )
      returning id into new_visit_id;

      exit;
    exception
      when unique_violation then
        if attempt = 10 then
          raise exception using
            errcode = 'P0001',
            message = 'Could not generate a unique group join code.';
        end if;
    end;
  end loop;

  insert into public.visit_members (
    visit_id,
    user_id,
    member_role,
    terms_accepted_at
  )
  values (
    new_visit_id,
    current_user_id,
    'leader'::public.visit_member_role,
    pg_catalog.clock_timestamp()
  );

  return query
  select new_visit_id, new_join_code;
end;
$$;

revoke all on function public.create_group_visit(
  public.visit_type,
  timestamptz,
  boolean,
  text,
  boolean
)
from public, anon, authenticated;
grant execute on function public.create_group_visit(
  public.visit_type,
  timestamptz,
  boolean,
  text,
  boolean
)
to authenticated;
