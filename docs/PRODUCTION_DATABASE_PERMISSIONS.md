# Permisos de base de datos para producción

Fecha de validación: 23 de octubre de 2026  
Rama: `release/production-prep`

## Resultado

La base de datos es compatible con un proyecto Supabase Cloud nuevo con Data API habilitada, `Automatically expose new tables` desactivado y Automatic RLS activado. La validación se hizo desde cero en una pila Supabase desechable independiente; no se reinició la instancia local habitual ni se modificó Cloud.

La instalación final aplicó 58 migraciones y dejó RLS habilitado en las 17 tablas de `public`.

## Migración nueva

`supabase/migrations/20261023140000_production_database_permissions.sql`

La migración 58 es incremental y no modifica ninguna migración anterior.

## Problemas corregidos

### Invitaciones de gestores

La Edge Function `invite-staff` consulta directamente `staff_permissions` durante el reenvío de una invitación. `service_role` recibe `SELECT` solamente sobre:

- `user_id`, necesario para el filtro de PostgREST.
- `invitation_status`.
- `invitation_revoked_at`.

Se revocaron los demás privilegios sobre la tabla para `PUBLIC`, `anon`, `authenticated` y `service_role`. La consulta exacta funciona y `SELECT *` con `service_role` devuelve `42501`.

### Imágenes de notificaciones

`notifications` y `notification_recipients` permanecen sin lectura directa para `anon` y `authenticated`. La política de `storage.objects` usa ahora `can_read_notification_media(text)`, una función booleana:

- `SECURITY DEFINER`, propiedad de `postgres`.
- `search_path` vacío y referencias completamente calificadas.
- Ejecutable solamente por `authenticated`.
- Autoriza únicamente al destinatario de una notificación publicada, no expirada y asociada a la ruta solicitada.

No se añadieron `GRANT SELECT` a las tablas de notificaciones. Una prueba HTTP confirmó que el destinatario puede crear y descargar una URL firmada, mientras que un usuario ajeno no puede obtenerla ni consultar directamente las notificaciones.

### Perfiles

Se eliminó el `UPDATE` general de `authenticated` sobre `profiles`. La PWA conserva actualización únicamente para:

```text
first_name, last_name, avatar_kind, avatar_path, avatar_preset,
nationality_country_code, department_code, sex, date_of_birth,
phone, document_type, document_number
```

`alternate_phone`, `document_type_detail` y los campos administrados por servidor no son actualizables directamente por el turista. RLS continúa limitando las operaciones al perfil propio.

### Menores y secuencia de auditoría

`visit_minors` queda RPC-only para los roles de la Data API. La PWA usa `get_visit_minors(...)`; las pruebas antiguas que dependían de privilegios implícitos se actualizaron para ejercer ese contrato.

También se revocó el acceso directo de los roles de la Data API a `audit_logs_id_seq`. Las inserciones de auditoría siguen funcionando dentro de RPC con propietario.

### Web Push

`runtime_feature_flags.web_push` permanece en `false`. `anon`, `authenticated` y `service_role` no pueden leer directamente `push_subscriptions`; registro y eliminación permanecen detrás de RPC `SECURITY DEFINER` y el registro falla con SQLSTATE `55000` mientras la bandera está desactivada.

No se concedieron ahora los privilegios requeridos por `send-push-notification`, porque el backend está desactivado. Antes de una activación futura deberán añadirse, mediante otra migración revisada, exclusivamente:

```sql
grant select (
  id, title_es, body_es, priority, image_path, destination_url, status
) on table public.notifications to service_role;

grant select (notification_id, user_id)
on table public.notification_recipients
to service_role;

grant select (id, user_id, endpoint, p256dh, auth)
on table public.push_subscriptions
to service_role;

grant delete on table public.push_subscriptions
to service_role;
```

La activación también requiere cambiar de forma controlada `runtime_feature_flags.web_push`, definir `WEB_PUSH_ENABLED=true`, configurar las credenciales VAPID y repetir las pruebas de envío y eliminación concurrente. No deben concederse `INSERT`, `UPDATE` ni lectura de otras columnas.

### RPC administrativas heredadas

No existen consumidores activos en `src`, `admin-web/src` ni en las Edge Functions para:

- `admin_set_user_role(uuid,text)`.
- `admin_update_staff_permissions(uuid,jsonb)`.

Se conserva su definición para compatibilidad del historial, pero se revocó `EXECUTE` a `PUBLIC`, `anon`, `authenticated` y `service_role`. `admin_update_staff_permissions_v2(uuid,jsonb)`, `admin_set_staff_access(uuid,boolean)` y el flujo auditado de invitaciones permanecen disponibles.

## Privilegios efectivos comprobados

- `anon`: conserva lectura de anuncios vigentes; no accede a perfiles, menores, notificaciones, suscripciones ni RPC administrativas.
- `authenticated`: conserva las tablas y RPC requeridas por la PWA/Admin, el `UPDATE` por columnas del perfil y el helper de medios; no tiene lectura directa de notificaciones, menores ni suscripciones push.
- `service_role`: puede consultar únicamente las tres columnas de `staff_permissions` requeridas por `invite-staff`; no recibe acceso directo de Web Push. Conserva los permisos explícitos ya existentes para la bandera de funcionalidad y las RPC de backend programadas.

## Validación

Se utilizó Supabase CLI 2.117.0 con una pila desechable separada, puertos independientes y `api.auto_expose_new_tables=false`.

- Instalación limpia: 58/58 migraciones aplicadas; última versión `20261023140000`.
- RLS: 17/17 tablas de `public` habilitadas.
- pgTAP: 30 archivos, 651 pruebas aprobadas. Son las 628 existentes más 23 nuevas comprobaciones de regresión.
- Invitaciones reales: creación y reenvío por Edge Function, dos correos en Mailpit, estado `visitor_manager/pending`, consulta mínima con `service_role` y rechazo de `SELECT *`.
- Storage real: URL firmada y descarga permitidas al destinatario; usuario ajeno denegado.
- Perfil vía PostgREST: actualización completa de la lista permitida aprobada; `alternate_phone` rechazado con `42501`.
- Pruebas Node relacionadas: invitaciones 12/12, seguridad Push 64/64 y Web Push desactivado 5/5.
- `npm run lint`: PWA y `admin-web` aprobados.
- `npm run build`: PWA y `admin-web` aprobados.

Los builds mantienen únicamente la advertencia ya conocida de Vite por chunks mayores de 500 kB; no afecta los permisos de base de datos.

## Riesgos pendientes

- Web Push no puede activarse hasta aplicar los privilegios mínimos anteriores y repetir su validación en un entorno previo a producción.
- El primer administrador y cualquier administrador adicional requieren un procedimiento SQL manual, explícito y auditado; no existe una RPC pública para promover cuentas a `admin`.
- Esta validación demuestra el comportamiento de una instalación limpia equivalente, pero no modifica ni verifica la configuración efectiva del proyecto Cloud. Esa comprobación debe realizarse durante el despliegue controlado, sin ampliar privilegios.
