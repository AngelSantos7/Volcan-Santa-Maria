-- 20260914234014_split_profile_name_fields.sql revoked table-level UPDATE
-- from authenticated and replaced it with grants for the columns that existed
-- at that time. Later migrations extended that list, but Phase 4 added `sex`
-- without a matching column grant. Profile saves that include `sex` therefore
-- failed at PostgreSQL privilege checking before RLS could authorize the row.
--
-- Restore the exact table privilege required by PostgREST. Row access remains
-- constrained by profiles_update_own_profile (USING and WITH CHECK auth.uid() = id).
revoke update on table public.profiles from anon;
grant update on table public.profiles to authenticated;

-- Preserve protection for server-managed fields after restoring the table grant.
create or replace function public.protect_profile_managed_fields()
returns trigger language plpgsql set search_path = '' as $$
begin
  if auth.role() = 'authenticated' and (
    new.id is distinct from old.id
    or new.created_at is distinct from old.created_at
    or new.registration_origin is distinct from old.registration_origin
    or new.registered_by is distinct from old.registered_by
    or new.registered_at is distinct from old.registered_at
  ) then
    raise exception using errcode = '42501', message = 'Server-managed profile fields cannot be updated.';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_profile_managed_fields_before_update on public.profiles;
create trigger protect_profile_managed_fields_before_update
before update on public.profiles for each row
execute function public.protect_profile_managed_fields();
