# send-push-notification

Local backend prepared for Web Push. It is intentionally not deployed by the migration.

Required function secrets: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT` (for example, `mailto:operations@example.com`). Supabase supplies its URL, anon key, and service-role key at runtime. Never expose the private key through a `VITE_*` variable.

The PWA receives only `VITE_VAPID_PUBLIC_KEY`. After publishing an in-app notification, call this function with `{ "notification_id": "..." }` using an authenticated admin or a visitor manager with `can_manage_notifications`. Responses 404/410 remove the expired subscription.

Production Web Push requires HTTPS. `localhost` can be a secure context during development; plain HTTP over a LAN IP cannot register Push. In-app notifications continue working without VAPID or Push support.

Configure a trusted server scheduler to call `publish_due_notifications()` with the service role for scheduled delivery, then invoke this function for each newly published notification. No scheduler or function is deployed automatically by this repository task.
