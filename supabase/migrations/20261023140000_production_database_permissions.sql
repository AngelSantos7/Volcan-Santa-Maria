-- Final least-privilege grants for projects with automatic Data API exposure disabled.

-- invite-staff performs this exact lookup with the service role. Keep every
-- other staff permission column behind the audited SECURITY DEFINER RPCs.
revoke all on table public.staff_permissions
from public, anon, authenticated, service_role;
grant select (user_id, invitation_status, invitation_revoked_at)
on table public.staff_permissions
to service_role;

-- Notification data remains RPC-only. Storage evaluates this owner-executed
-- predicate without granting authenticated users direct table reads.
revoke all on table public.notifications
from public, anon, authenticated, service_role;
revoke all on table public.notification_recipients
from public, anon, authenticated, service_role;

-- Minors are exposed only through get_visit_minors(...) and the guarded
-- mutation RPCs. The application has no direct table consumer.
revoke all on table public.visit_minors
from public, anon, authenticated, service_role;

create or replace function public.can_read_notification_media(
  requested_path text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.notifications as notification
      join public.notification_recipients as recipient
        on recipient.notification_id = notification.id
      where notification.image_path = requested_path
        and notification.status = 'published'
        and (
          notification.expires_at is null
          or notification.expires_at > pg_catalog.now()
        )
        and recipient.user_id = (select auth.uid())
    );
$$;

alter function public.can_read_notification_media(text) owner to postgres;
revoke all on function public.can_read_notification_media(text)
from public, anon, authenticated, service_role;
grant execute on function public.can_read_notification_media(text)
to authenticated;

drop policy if exists "recipients read notification media" on storage.objects;
create policy "recipients read notification media"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'notification-media'
  and public.can_read_notification_media(name)
);

-- The PWA only writes these profile fields. Row ownership remains enforced by
-- profiles_update_own_profile; server and administrative fields stay closed.
revoke update on table public.profiles from anon, authenticated;
grant update (
  first_name,
  last_name,
  avatar_kind,
  avatar_path,
  avatar_preset,
  nationality_country_code,
  department_code,
  sex,
  date_of_birth,
  phone,
  document_type,
  document_number
) on table public.profiles to authenticated;

-- Web Push remains disabled. Registration/removal continue through their
-- SECURITY DEFINER RPCs, while direct endpoint/key reads stay server-closed.
revoke all on table public.push_subscriptions
from public, anon, authenticated, service_role;

-- Audit rows are inserted by owner-executed RPCs; API roles never need direct
-- sequence access.
revoke all on sequence public.audit_logs_id_seq
from public, anon, authenticated, service_role;

-- These legacy administrative entry points have no active application
-- consumers. Keep their definitions for migration compatibility, but expose
-- neither one through the Data API.
revoke all on function public.admin_set_user_role(uuid, text)
from public, anon, authenticated, service_role;
revoke all on function public.admin_update_staff_permissions(uuid, jsonb)
from public, anon, authenticated, service_role;
