# SEC-009 — Auditoría segura de invitaciones

Fecha: 2026-10-23. Rama: `fix/security-p2-audit`. Trabajo realizado exclusivamente con Supabase local y Mailpit, sin `db reset`, `db push`, commit, push ni acceso a Cloud.

## Causa y reproducción

`invite-staff` comprobaba los errores de Auth, rol, perfil y permisos, pero ignoraba el resultado de las dos inserciones directas en `audit_logs`:

- `staff_invitation_created`, después de crear la identidad y configurar el gestor;
- `staff_invitation_resent`, después de solicitar otro correo a Auth.

La versión anterior se ejecutó en memoria con un mock que devolvió error únicamente para `audit_logs`. El resultado fue `SEC009_BEFORE_HTTP=200` con `AUDIT_ERROR_INJECTED=true`: se informaba éxito sin auditoría. Además, Auth, perfil, rol y permisos eran operaciones separadas; un fallo tardío podía dejar una identidad parcial que el control de correo existente impedía reintentar.

## Solución

La migración `20261023120000_secure_staff_invitation_audit.sql` incorpora tres RPC `SECURITY DEFINER`, con `search_path=''`, ejecución anónima revocada y comprobación interna de administrador:

1. `admin_find_recoverable_staff_invitation(text)` reconoce únicamente identidades creadas mediante una invitación confiable de Auth y que permanecen incompletas o pendientes. No convierte cuentas ordinarias.
2. `admin_finalize_staff_invitation(uuid,text,text,jsonb)` actualiza rol y perfil, inserta permisos pendientes y registra `staff_invitation_created` dentro de una sola transacción PostgreSQL. Si falla la auditoría, se revierten todos esos cambios. La RPC también recupera el estado parcial histórico y hace idempotentes los reintentos o respuestas perdidas, sin sobrescribir datos ya finalizados ni duplicar eventos.
3. `admin_record_staff_invitation_resend_request(uuid,text)` valida y audita obligatoriamente la solicitud antes de que la Edge Function llame de nuevo a Auth. Si falla, responde HTTP 500 y no se envía otro correo.

La Edge Function ya no escribe directamente en `user_roles`, `profiles`, `staff_permissions` ni `audit_logs`. Tras un fallo de finalización devuelve un error explícito y reintentable. El reintento reutiliza la misma identidad y no vuelve a llamar a `inviteUserByEmail`.

Los eventos nuevos guardan solo actor, tipo/ID objetivo y una marca técnica de origen. Se retiraron correo, nombre completo y teléfono de metadata; no se registran contraseñas, tokens ni enlaces. Admin reconoce y filtra `staff_invitation_resend_requested` como “Solicitó reenvío de invitación”.

## Archivos modificados

- `supabase/functions/invite-staff/index.ts`
- `supabase/migrations/20261023120000_secure_staff_invitation_audit.sql`
- `supabase/tests/database/security_staff_invitation_audit_test.sql`
- `scripts/staff-invitation.test.mjs`
- `scripts/staff-invitation.local.test.mjs`
- `admin-web/src/lib/admin-labels.ts`
- `admin-web/src/pages/AuditPage.tsx`
- `docs/SECURITY_P2_AUDIT_CORRECTION.md`

No se modificaron dependencias, lockfiles, SEC-008, Push ni las políticas de Auth.

## Pruebas

- Reproducción anterior con auditoría fallida: HTTP 200 incorrecto confirmado.
- Mocks de Edge Function: **12/12 PASS**, incluidos éxito, auditoría fallida, estado parcial, respuesta perdida, reintento idempotente, fallo de auditoría de reenvío sin correo y fallo posterior de Auth.
- pgTAP focal SEC-009: **24/24 PASS**. Un trigger de prueba fuerza el fallo real de `audit_logs` y demuestra rollback de rol, perfil y permisos, recuperación posterior y ausencia de eventos duplicados.
- pgTAP completo: **618 PASS en 28 archivos**; referencia previa 594.
- Invitación real local: administrador autorizado, correo inicial y reenvío en Mailpit, auditoría sin PII completa, enlace, contraseña conforme, activación, login y permisos exactos: PASS.
- Edad y privilegios: menor, DOB ausente, metadata privilegiada falsificada y alta passwordless siguen denegados; adulto válido conserva únicamente rol turista: PASS.
- `test:policy`: 5/5 PASS.
- `test:password`: 9/9 PASS.
- `test:auth:local`: 7/7 PASS.
- `test:auth:security`: PASS para cambio, recuperación, confirmación, invitación y PWA/Admin.
- Lint PWA/Admin: PASS.
- Build PWA/Admin: PASS; solo permanecen los avisos preexistentes de chunks mayores de 500 kB.
- Limpieza: cero identidades sintéticas y cero eventos SEC-009 huérfanos después del test real.
- `git diff --check`: PASS.

## Limitaciones

Auth y PostgreSQL continúan sin compartir una transacción. Si Auth crea y envía la invitación pero la finalización auditada falla, queda temporalmente una identidad turista sin permisos; la respuesta es HTTP 500 y el reintento la finaliza sin mandar otro correo. Esa identidad no obtiene acceso administrativo durante el estado parcial.

En un reenvío, el evento registra con precisión la **solicitud** antes de llamar a Auth. Si Auth falla, permanece el intento auditado y se devuelve error. Si la conexión se pierde después de que Auth acepte el reenvío, un reintento manual podría producir otro correo porque el proveedor no ofrece una transacción o clave de idempotencia compartida con PostgreSQL. No se afirma entrega de correo; únicamente solicitud auditada y aceptación de Auth.

## Git status

```text
 M admin-web/src/lib/admin-labels.ts
 M admin-web/src/pages/AuditPage.tsx
 M scripts/staff-invitation.local.test.mjs
 M scripts/staff-invitation.test.mjs
 M supabase/config.toml
 M supabase/functions/invite-staff/index.ts
?? docs/SECURITY_P2_AUDIT_CORRECTION.md
?? supabase/config.toml.qa-backup
?? supabase/migrations/20261023120000_secure_staff_invitation_audit.sql
?? supabase/tests/database/security_staff_invitation_audit_test.sql
?? tmp/
```

`supabase/config.toml`, `supabase/config.toml.qa-backup` y `tmp/` ya existían antes de SEC-009. Los puertos locales 545xx y la configuración segura de Auth se conservaron y deben excluirse del futuro commit según corresponda.
