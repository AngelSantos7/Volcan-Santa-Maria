create type public.app_role as enum ('tourist', 'admin');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_roles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role public.app_role not null default 'tourist'::public.app_role,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;

-- Remove default client privileges, then grant only the operations exposed by
-- the policies below. Profiles are created by the auth trigger, not clients.
revoke all on table public.profiles from anon, authenticated;
revoke all on table public.user_roles from anon, authenticated;

grant select on table public.profiles to authenticated;
grant update (full_name) on table public.profiles to authenticated;
grant select on table public.user_roles to authenticated;

drop policy if exists profiles_select_own_profile on public.profiles;
create policy profiles_select_own_profile
on public.profiles
for select
to authenticated
using (
  (select auth.uid()) is not null
  and (select auth.uid()) = id
);

drop policy if exists profiles_update_own_profile on public.profiles;
create policy profiles_update_own_profile
on public.profiles
for update
to authenticated
using (
  (select auth.uid()) is not null
  and (select auth.uid()) = id
)
with check (
  (select auth.uid()) is not null
  and (select auth.uid()) = id
);

drop policy if exists user_roles_select_own_role on public.user_roles;
create policy user_roles_select_own_role
on public.user_roles
for select
to authenticated
using (
  (select auth.uid()) is not null
  and (select auth.uid()) = user_id
);

create or replace function public.set_profiles_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = pg_catalog.now();
  return new;
end;
$$;

revoke execute on function public.set_profiles_updated_at() from public, anon, authenticated;

drop trigger if exists profiles_before_update_set_updated_at on public.profiles;
create trigger profiles_before_update_set_updated_at
before update on public.profiles
for each row
execute function public.set_profiles_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data ->> 'full_name');

  insert into public.user_roles (user_id, role)
  values (new.id, 'tourist'::public.app_role);

  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

drop trigger if exists auth_users_after_insert_create_profile_and_role on auth.users;
create trigger auth_users_after_insert_create_profile_and_role
after insert on auth.users
for each row
execute function public.handle_new_user();
