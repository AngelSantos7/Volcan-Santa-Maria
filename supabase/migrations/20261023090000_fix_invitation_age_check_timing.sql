-- GoTrue v2.196.0 inserts an invitation identity before writing invited_at,
-- within the SAME transaction. Passwordless inserts are not proof of an invite:
-- they must pass the deferred constraint below before they can commit.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = '' as $$
declare birth_date date;
begin
  if new.invited_at is null then
    birth_date := nullif(new.raw_user_meta_data ->> 'date_of_birth','')::date;
    -- Preserve immediate rejection for ordinary password signup. The absence
    -- of a password only postpones validation; it never exempts an identity.
    if not public.is_adult(birth_date)
      and nullif(new.encrypted_password,'') is not null then
      raise exception using errcode='23514',message='adult_required';
    end if;
  end if;
  insert into public.profiles(id, first_name, last_name, date_of_birth)
  values(new.id, new.raw_user_meta_data ->> 'first_name',
    new.raw_user_meta_data ->> 'last_name', birth_date);
  -- Preserve existing behavior for already-marked trusted invitations.
  -- A normal GoTrue invite initially gets only tourist; invite-staff assigns
  -- visitor_manager and pending permissions after its administrator check.
  insert into public.user_roles(user_id, role)
  values(new.id, case when new.invited_at is not null
    then 'visitor_manager'::public.app_role else 'tourist'::public.app_role end);
  if new.raw_user_meta_data ->> 'terms_version' = '1.0'
    and new.raw_user_meta_data ->> 'privacy_version' = '1.0'
    and coalesce((new.raw_user_meta_data ->> 'legal_consent_accepted')::boolean, false)
  then
    insert into public.user_consents(user_id, terms_version, privacy_version)
    values(new.id, '1.0', '1.0');
  end if;
  return new;
end;
$$;
revoke all on function public.handle_new_user() from public, anon, authenticated;

create function public.check_new_user_age_at_commit()
returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- NEW is the insert-time snapshot. Read the final persisted-in-transaction
  -- Auth row to observe sendInvite's subsequent update. Neither user metadata
  -- nor a caller-supplied role can satisfy this check. Deleted rows need no check.
  if exists (
    select 1 from auth.users u left join public.profiles p on p.id=u.id
    where u.id=new.id and u.invited_at is null
      and not public.is_adult(p.date_of_birth)
  ) then
    raise exception using errcode='23514',message='adult_required';
  end if;
  return new;
end;
$$;
revoke all on function public.check_new_user_age_at_commit() from public, anon, authenticated;

create constraint trigger auth_users_check_registration_age
after insert on auth.users
deferrable initially deferred
for each row
when (new.invited_at is null and nullif(new.encrypted_password,'') is null)
execute function public.check_new_user_age_at_commit();
