create type public.document_type as enum ('dpi', 'passport', 'other');

alter table public.profiles
add column nationality_country_code text
  constraint profiles_nationality_country_code_format
  check (nationality_country_code ~ '^[A-Z]{2}$'),
add column date_of_birth date,
add column phone text
  constraint profiles_phone_e164_format
  check (phone ~ '^\+[1-9][0-9]{1,14}$'),
add column document_type public.document_type,
add column document_number text;

-- Profile rows are still created by the auth trigger. Authenticated users can
-- only update their own profile because the existing RLS policy remains active.
grant update (
  nationality_country_code,
  date_of_birth,
  phone,
  document_type,
  document_number
) on table public.profiles to authenticated;

create table public.emergency_contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  first_name text not null,
  last_name text not null,
  relationship text not null,
  phone text not null
    constraint emergency_contacts_phone_e164_format
    check (phone ~ '^\+[1-9][0-9]{1,14}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint emergency_contacts_user_id_key unique (user_id)
);

-- The unique constraint on user_id also provides the index used by ownership
-- checks and guarantees one emergency contact per tourist.
alter table public.emergency_contacts enable row level security;

revoke all on table public.emergency_contacts from anon, authenticated;
grant select on table public.emergency_contacts to authenticated;
grant insert (
  user_id,
  first_name,
  last_name,
  relationship,
  phone
) on table public.emergency_contacts to authenticated;
grant update (
  first_name,
  last_name,
  relationship,
  phone
) on table public.emergency_contacts to authenticated;

create policy emergency_contacts_select_own
on public.emergency_contacts
for select
to authenticated
using (
  (select auth.uid()) is not null
  and (select auth.uid()) = user_id
);

create policy emergency_contacts_insert_own
on public.emergency_contacts
for insert
to authenticated
with check (
  (select auth.uid()) is not null
  and (select auth.uid()) = user_id
);

create policy emergency_contacts_update_own
on public.emergency_contacts
for update
to authenticated
using (
  (select auth.uid()) is not null
  and (select auth.uid()) = user_id
)
with check (
  (select auth.uid()) is not null
  and (select auth.uid()) = user_id
);

create or replace function public.set_emergency_contacts_updated_at()
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

revoke execute on function public.set_emergency_contacts_updated_at()
from public, anon, authenticated;

create trigger emergency_contacts_before_update_set_updated_at
before update on public.emergency_contacts
for each row
execute function public.set_emergency_contacts_updated_at();
