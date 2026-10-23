# Preparación de producción — Web Push desactivado

Fecha de validación: 2026-10-23
Rama: `release/production-prep`

## Resultado

Web Push queda desactivado por defecto en la PWA, PostgreSQL y la Edge Function. La implementación conserva el código de Web Push y las protecciones SEC-005/SEC-006 para una activación futura controlada. Las notificaciones internas, anuncios, mensajes administrativos, historial y publicación programada permanecen disponibles.

No existe en el repositorio un cron, trigger ni tarea desplegada que invoque `send-push-notification`. `publish_due_notifications()` publica notificaciones internas y crea sus destinatarios; no llama a la Edge Function ni a un proveedor Web Push.

## Mecanismo de desactivación

La protección requiere habilitación explícita en tres capas. Si una sola permanece desactivada, Web Push no queda operativo:

- **PWA:** `VITE_WEB_PUSH_ENABLED` solo habilita la interfaz y la operación de suscripción cuando su valor es `true`. Está definido como `false` en `.env.example` y la ausencia de la variable también se interpreta como desactivación. El botón de activación no se muestra y una llamada directa al servicio se detiene antes de `Notification.requestPermission()`, `PushManager.subscribe()` o la RPC.
- **PostgreSQL:** la migración `20261023130000_disable_web_push_by_default.sql` crea la fila protegida `runtime_feature_flags.web_push=false`. `register_push_subscription(...)` falla con SQLSTATE `55000` mientras esté desactivada. Clientes `anon` y `authenticated` no pueden leer ni modificar la bandera; solo `service_role` recibe `SELECT` y `UPDATE`.
- **Edge Function:** `send-push-notification` exige `WEB_PUSH_ENABLED=true`. Con la variable ausente o distinta de `true`, responde HTTP 503 antes de autenticar, consultar notificaciones o suscripciones, generar VAPID o acceder al transporte externo.

El service worker sigue registrado porque mantiene el funcionamiento offline. Sus manejadores Push se conservan como código inactivo para una futura habilitación; las rutas de registro y envío del proyecto están cerradas por las tres capas anteriores.

## Notificaciones internas conservadas

No se modificaron `staff_save_notification`, `staff_list_notifications`, `get_my_notifications`, `mark_notification_read`, `snooze_notification` ni `publish_due_notifications`. La suite existente confirmó publicación, lectura, aplazamiento e historial. El Admin conserva creación inmediata, borradores y programación, y ahora indica claramente que Web Push está desactivado mientras la entrega dentro de la PWA continúa.

## Archivos modificados

- `.env.example`: añade `VITE_WEB_PUSH_ENABLED=false`.
- `src/features/notifications/web-push-config.ts`: interpretación cerrada por defecto y guardia que impide alcanzar la solicitud de permiso.
- `src/features/notifications/notification-service.ts`: aplica la bandera antes de soporte, permisos, suscripción y RPC.
- `admin-web/src/pages/NotificationsPage.tsx`: muestra el estado configurado de Web Push sin alterar la gestión de notificaciones internas.
- `supabase/functions/send-push-notification/index.ts`: bloqueo backend mediante `WEB_PUSH_ENABLED`.
- `supabase/functions/send-push-notification/README.md`: documenta las tres capas de activación.
- `supabase/migrations/20261023130000_disable_web_push_by_default.sql`: bandera protegida y bloqueo incremental de registro.
- `supabase/tests/database/production_web_push_disabled_test.sql`: regresión backend e invariantes de notificaciones internas.
- `supabase/tests/database/security_push_test.sql` y `phase4_operations_minors_notifications_test.sql`: habilitan la bandera solo dentro de sus transacciones revertidas para conservar la cobertura SEC-005/SEC-006.
- `scripts/web-push-disabled.test.mjs`: regresión de configuración y ausencia de solicitud de permiso.
- `scripts/push-security.test.mjs`: prueba que la Edge Function desactivada no llega a base de datos ni transporte, y conserva las 63 pruebas previas cuando se habilita explícitamente en el arnés.
- `scripts/push-concurrency.local.test.mjs`: habilita temporalmente la bandera para las regresiones concurrentes y restaura su estado original.
- `package.json`: añade `npm run test:production`.
- `docs/PRODUCTION_PREPARATION.md`: este informe.

No se modificaron dependencias, autenticación, roles, permisos, RLS ajena a la nueva tabla, RPC ajenas a Web Push ni las correcciones SEC-001 a SEC-009.

## Resultados de pruebas

- Configuración frontend desactivada: **5/5 PASS**. Incluye valor ausente/falso, activación explícita reversible y comprobación de que la operación de permiso no se ejecuta.
- Edge Function con configuración local real y `WEB_PUSH_ENABLED` ausente: **HTTP 503**, `{"error":"Web Push is disabled"}`.
- Seguridad Edge/transportes: **64/64 PASS**; una regresión nueva de desactivación más las 63 de SEC-006.
- PostgreSQL focal: **73/73 PASS** en las suites de desactivación, seguridad de endpoints y notificaciones internas.
- Concurrencia SEC-005: **53 casos de paridad PASS** y **3 escenarios concurrentes PASS**. La bandera fue restaurada; comprobación final local: `web_push=false`.
- pgTAP completo: **628/628 PASS en 29 archivos**; referencia previa 618 más 10 regresiones nuevas.
- `npm run lint`, PWA y Admin: **PASS**.
- `npm run build`, PWA y Admin: **PASS** con Vite 8.3.5. Solo permanecen avisos informativos de tamaño de chunks.
- Flujo UI final con Edge/Playwright: **9/9 PASS** para PWA, Admin, cambio/recuperación de contraseña, invitación, menores, ascensos y cambios de ruta.
- `npm run test:policy`: **5/5 PASS**.
- `npm run test:password`: **9/9 PASS**.
- `npm run test:staff`: **12/12 PASS**.
- `npm run test:map`: **3/3 PASS**.
- `npm run test:gpx`: **PASS** para ambas rutas.
- `npm run test:auth:local`: **7/7 PASS**.
- `npm run test:auth:security`: **PASS** para cambio de contraseña, registro, confirmación, recuperación, invitación y PWA/Admin.
- `npm run test:staff:local`: **PASS** para autorización, Mailpit, activación, roles, permisos, edad y metadata falsificada.
- Base local al finalizar: `web_push=false`, cero suscripciones sintéticas persistidas y cero funciones PostgreSQL que invoquen `send-push-notification`.
- `git diff --check`: **PASS**.

## Configuración para producción

Para esta versión:

- Mantener `VITE_WEB_PUSH_ENABLED=false` o no definir la variable durante el build de la PWA y del Admin.
- Mantener `WEB_PUSH_ENABLED` ausente o en `false` para `send-push-notification`.
- Aplicar la migración incremental; deja `runtime_feature_flags.web_push=false`.
- No configurar VAPID ni desplegar una tarea que invoque la Edge Function mientras Web Push permanezca desactivado.
- Mantener HTTPS, las variables normales de Supabase, confirmación obligatoria de correo y la configuración actual de Auth.
- SMTP real continúa pendiente para la siguiente etapa y no fue configurado aquí.

Una activación futura debe ser un cambio revisado que, en la misma liberación, establezca `VITE_WEB_PUSH_ENABLED=true`, `WEB_PUSH_ENABLED=true`, configure las tres variables VAPID y actualice la fila `web_push` a `true` con `updated_at=now()`. Antes de hacerlo deben repetirse las pruebas de permisos, endpoints, cifrado, concurrencia y entrega real.

## Riesgos pendientes

- Pueden existir suscripciones históricas en un entorno remoto. Permanecen inertes mientras el backend esté desactivado; deberán revisarse antes de una reactivación.
- La publicación programada interna requiere que producción invoque de forma confiable `publish_due_notifications()`. El repositorio no instala esa tarea automáticamente y no debe conectarse a `send-push-notification` en esta versión.
- No se validó un despliegue real, SMTP externo ni Supabase Cloud por restricción expresa.
- El service worker conserva el manejador Push para mantener la reversibilidad. La desactivación depende de conservar cerradas las capas frontend, RPC y Edge documentadas arriba.

## Estado Git

```text
## release/production-prep
 M .env.example
 M admin-web/src/pages/NotificationsPage.tsx
 M package.json
 M scripts/push-concurrency.local.test.mjs
 M scripts/push-security.test.mjs
 M src/features/notifications/notification-service.ts
 M supabase/config.toml
 M supabase/functions/send-push-notification/README.md
 M supabase/functions/send-push-notification/index.ts
 M supabase/tests/database/phase4_operations_minors_notifications_test.sql
 M supabase/tests/database/security_push_test.sql
?? docs/PRODUCTION_PREPARATION.md
?? scripts/web-push-disabled.test.mjs
?? src/features/notifications/web-push-config.ts
?? supabase/config.toml.qa-backup
?? supabase/migrations/20261023130000_disable_web_push_by_default.sql
?? supabase/tests/database/production_web_push_disabled_test.sql
?? tmp/
```

Los cambios de código, pruebas, migración, `.env.example`, `package.json` y este informe pertenecen a la preparación de producción.

Deben quedar fuera de un futuro commit:

- `supabase/config.toml`: modificación preexistente que contiene únicamente los puertos temporales 545xx. Su SHA-256 se mantuvo en `60911267AD5134B4BD790529E3D8E0B5A95594E30545BC94DA2FE03130234161` durante la tarea.
- `supabase/config.toml.qa-backup`: respaldo local solicitado.
- `tmp/`: artefactos locales de tareas anteriores.

No se realizó commit, push, `db reset`, `db push` ni modificación de Supabase Cloud.
