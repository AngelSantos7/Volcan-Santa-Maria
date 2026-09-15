alter table public.profiles
add column first_name text,
add column last_name text;

-- Preserve existing profile names when possible. A profile with a single name
-- keeps it as first_name and receives a null last_name.
update public.profiles
set
  first_name = nullif(split_part(btrim(full_name), ' ', 1), ''),
  last_name = case
    when strpos(btrim(full_name), ' ') > 0 then
      nullif(
        ltrim(substr(btrim(full_name), strpos(btrim(full_name), ' ') + 1)),
        ''
      )
    else null
  end;

revoke update (full_name) on table public.profiles from anon, authenticated;

alter table public.profiles
drop column full_name;

-- Profile rows continue to be created only by the auth trigger. Authenticated
-- users may change only their own first and last names.
revoke insert, update, delete on table public.profiles from anon, authenticated;
grant update (first_name, last_name) on table public.profiles to authenticated;

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

-- No client role receives write privileges on user_roles. The only public
-- operation remains reading the authenticated user's own role via the existing
-- select policy.
revoke all on table public.user_roles from anon, authenticated;
grant select on table public.user_roles to authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, first_name, last_name)
  values (
    new.id,
    new.raw_user_meta_data ->> 'first_name',
    new.raw_user_meta_data ->> 'last_name'
  );

  insert into public.user_roles (user_id, role)
  values (new.id, 'tourist'::public.app_role);

  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
