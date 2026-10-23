# Invitaciones de gestores: corrección de `adult_required`

Fecha: 2026-10-23. Rama: `fix/security-p1-auth`, HEAD `ccb2109`; `0b3c011` permanece en el historial. Trabajo exclusivamente local, sin commit ni push.

## Resultado

La invitación realizada por un administrador a través de la Edge Function real `invite-staff` ahora devuelve HTTP 200, llega a Mailpit y se completa con contraseña conforme, activación, login y únicamente el rol/permisos asignados. No se proporciona ni inventa fecha de nacimiento para el gestor.

Los turistas menores de edad o sin fecha requerida siguen rechazados en el backend. La metadata falsificada no concede roles ni permisos. No se modificaron `invite-staff`, la RPC de activación, RLS, grants de tablas, políticas de contraseña ni otras funcionalidades. La corrección productiva se limita a una migración incremental de validación de edad.

## Causa raíz y reproducción anterior al cambio

El trigger `auth_users_after_insert_create_profile_and_role`, `AFTER INSERT ON auth.users`, llama inmediatamente a `public.handle_new_user()`. La definición anterior procede de `20261022121000_staff_invitation_lifecycle.sql`, ya presente antes de SEC-003/004. Cuando `new.invited_at` es NULL, exige `date_of_birth` y lanza SQLSTATE `23514`, mensaje `adult_required`, si falta o no cumple 18 años.

Se reprodujo antes de aplicar la migración, mediante usuarios sintéticos y la Edge Function servida localmente:

- Turista autenticado llama a `invite-staff`: HTTP 403; no se crea identidad.
- Administrador autorizado llama con nombres, correo, teléfono y permisos: HTTP 500, `Database error saving new user`.
- Los logs locales de Auth contienen `adult_required` y SQLSTATE `23514`. Solo se extrajeron indicadores de diagnóstico, sin publicar logs completos, tokens ni contraseñas.
- La identidad del intento fallido no existe después de la respuesta: la transacción se revierte.
- `node scripts/staff-invitation.local.test.mjs --baseline` verificó esa reproducción antes del cambio. Este modo espera el fallo original y no debe usarse como criterio de éxito después de migrar.

Los ajustes SEC-003/004 cambian configuración de Auth y validación de contraseña; no cambiaron ese trigger ni el payload de `invite-staff`. La función original y el orden de GoTrue explican el fallo sin depender de esos ajustes. No fue necesario deshabilitar las nuevas protecciones para reproducirlo.

### Orden real y datos disponibles

1. `invite-staff` consulta `get_admin_session` con la sesión del llamante y exige rol `admin`. Después comprueba disponibilidad del correo y valida los datos administrativos.
2. Con la credencial de servicio interna llama a `inviteUserByEmail`. Envía nombres y `staff_invitation: true`; no envía DOB ni contraseña.
3. GoTrue v2.196.0 inserta `auth.users` con metadata de nombres, pero todavía con `invited_at` NULL y contraseña vacía. Aquí se ejecuta el trigger inmediato de la aplicación y ocurría el error.
4. En la **misma transacción**, GoTrue crea la identidad de email y procesa el envío de invitación, asignando `invited_at` y los campos de confirmación. La aplicación necesita observar ese estado final, no el snapshot inicial `NEW`.
5. Tras recibir éxito de Auth, `invite-staff` asigna `visitor_manager`, actualiza teléfono e inserta los permisos solicitados como pendientes/inactivos. No se cambió este orden ni el tratamiento de auditoría (SEC-009 queda fuera del alcance).
6. El enlace válido confirma el correo y permite establecer la contraseña; el flujo normal de Admin la establece antes de llamar a `activate_my_staff_invitation`.

La revisión del catálogo local encontró un trigger de inserción en `auth.users` y tres de actualización en `profiles` (timestamp, protección de campos administrados y edad del turista). `user_roles` no tenía triggers propios. Se conservaron todos. Las restricciones y permisos existentes impiden a `authenticated` insertar identidades Auth, modificar `invited_at` o promover `user_roles`.

## Solución mínima y garantía de seguridad

Nueva migración: `supabase/migrations/20261023090000_fix_invitation_age_check_timing.sql`, aplicada con `supabase migration up --local`. No se reescribieron migraciones históricas.

- `handle_new_user()` conserva el rechazo inmediato cuando un registro con contraseña no cumple la edad. Conserva también la creación de perfil, rol y consentimientos.
- Para una identidad inicialmente sin contraseña y sin `invited_at`, la ausencia de contraseña **solo pospone** la validación; no es una exención de edad.
- Se agrega el constraint trigger `auth_users_check_registration_age`, `DEFERRABLE INITIALLY DEFERRED`. Antes de confirmar la transacción, `check_new_user_age_at_commit()` consulta la fila actual de Auth y la DOB del perfil. Si no existe el `invited_at` confiable escrito por Auth y la edad no es válida, aborta con `adult_required`, revirtiendo identidad, perfil y rol.
- Consulta la fila actual porque `NEW` conserva los datos del INSERT y seguiría mostrando NULL aunque GoTrue ya hubiera completado la invitación.
- Un signup OTP/passwordless con metadata de gestor también queda bloqueado al finalizar la transacción. Se verificó por HTTP real y con regresiones SQL.
- No se confía en `staff_invitation`, `role`, `app_metadata` o `invited_at` dentro de metadata. El rol inicial del flujo real sigue siendo `tourist` hasta que la Edge Function autorizada lo actualiza. No se crean permisos de staff en el trigger.
- Se conserva el comportamiento anterior para filas con `invited_at` ya establecido por un escritor privilegiado. Los clientes no pueden escribir ese campo.
- La función nueva es `SECURITY DEFINER`, con `search_path=''`, nombres calificados y ejecución revocada a `PUBLIC`, `anon` y `authenticated`.

No hay una identidad inválida confirmada durante el intervalo: toda la secuencia que pospone la validación está dentro de una sola transacción. Un fallo de envío o de la comprobación final revierte la identidad. En altas passwordless inválidas, el envío de correo puede ocurrir antes de que falle el COMMIT; aun así no queda identidad utilizable. Todas las pruebas de correo utilizaron Mailpit local.

## Pruebas realizadas

Prueba HTTP real nueva: `npm run test:staff:local`, con `SUPABASE_TEST_URL`, `SUPABASE_TEST_MAIL_URL`, `SUPABASE_TEST_ANON_KEY` y `SUPABASE_TEST_SERVICE_ROLE_KEY` suministrados por entorno. Se sirvió `invite-staff` localmente con `STAFF_INVITE_REDIRECT_URL` de localhost; el archivo de entorno temporal no contiene claves.

Resultados de los requisitos:

1. Turista de 17 años: DENEGADO, HTTP 500 de Auth, sin identidad persistida.
2. Turista exactamente de 18 años, fecha según Guatemala: PERMITIDO, rol `tourist`; correo de confirmación y login correctos.
3. Turista sin DOB: DENEGADO, sin identidad persistida.
4. Metadata de gestor falsificada sin DOB o siendo menor: DENEGADO. Adulto con metadata falsificada: solo `tourist`, sin `staff_permissions`, sin capacidad de invitar.
5. Administrador autorizado invita por la Edge Function real: HTTP 200.
6. Turista o gestor intenta invitar: HTTP 403. La solicitud denegada de turista no crea identidad.
7. Correo real en Mailpit y consumo de enlace: PASS.
8. Primera contraseña `volcan25` o `VOLCAN25`: `weak_password`; contraseña aleatoria conforme: aceptada sin contraseña anterior.
9. Activación y login del gestor: PASS. Rol `visitor_manager`; únicamente `can_view_visitors` y `can_view_emergency_contacts` solicitados. Los demás flags almacenados son falsos; comprobaciones efectivas niegan documentos, gestión de visitas y gestión de staff.
10. Cambio normal sin contraseña actual: HTTP 400 `current_password_required`; incorrecta: HTTP 400 `current_password_invalid`; correcta: HTTP 200. Recuperación por correo sin contraseña anterior: HTTP 200 y login posterior correcto. La sesión normal posterior vuelve a exigir contraseña actual.

Verificaciones adicionales:

- pgTAP completo: **552 PASS en 25 archivos** (535 anteriores + 17 nuevas).
- Suite SQL focalizada de edad/invitación y reglas anteriores: 61 PASS en 2 archivos.
- `test:policy`: 5 PASS; `test:password`: 9 PASS; `test:staff`: 6 PASS.
- `test:auth:local`: 7 comprobaciones PASS.
- `test:auth:security`: PASS, incluida invitación sin DOB sintética. Se retiró el fallback de diagnóstico que antes añadía DOB.
- Pruebas de navegador del cambio de contraseña PWA/Admin: validación de minúscula, rechazo de contraseña actual incorrecta, guardado y login con nueva contraseña.
- Lint y build PWA/Admin: PASS. Persisten únicamente los avisos de Vite por chunks mayores de 500 kB.
- `git diff --check`: PASS. Las cuentas sintéticas creadas por estas pruebas se eliminaron; pgTAP revierte sus fixtures. No se eliminaron usuarios preexistentes.

El test SQL anterior usaba INSERTs sin `encrypted_password`. Ahora fuerza el constraint a IMMEDIATE para que `throws_ok` observe el rechazo dentro de la sentencia; no se eliminó ni se relajó ninguna aserción. La suite nueva prueba explícitamente el orden diferido de Auth, el rechazo final y el rollback.

### Observación adicional preexistente, sin corregir

Una comprobación exploratoria esperaba que la activación fuera denegada después de consumir el enlace pero antes de elegir contraseña. Esa expectativa falló: GoTrue v2.196.0 genera internamente una contraseña temporal al verificar una invitación y la RPC actual comprueba que el hash no esté vacío. Por tanto, el destinatario de una invitación válida puede llamar a la RPC y activarse después de verificar el enlace, aun antes de elegir su contraseña.

La RPC y ese comportamiento de GoTrue no fueron modificados por esta migración. No concede permisos a un usuario sin invitación autorizada, pero **no demuestra que ya haya elegido su contraseña**. No se presenta esa comprobación exploratoria como PASS. La regresión funcional final verifica el orden previsto por la aplicación (contraseña elegida, luego activación), que sí pasa. Exigir además ese orden en el backend requeriría una comprobación específica de establecimiento de contraseña y debe revisarse por separado; no se añadió una marca confiada al cliente ni una excepción improvisada.

## Archivos de esta corrección

- Nueva migración `supabase/migrations/20261023090000_fix_invitation_age_check_timing.sql`.
- Nuevo test `supabase/tests/database/staff_invitation_age_timing_test.sql`.
- `supabase/tests/database/final_account_routes_return_test.sql`: evaluación explícita de constraint para fixtures sin contraseña.
- Nuevo test real `scripts/staff-invitation.local.test.mjs` y comando `test:staff:local` en `package.json`.
- `scripts/auth-security.local.test.mjs`: invitación obligatoria sin fallback DOB.
- `docs/SECURITY_P1_AUTH_CORRECTIONS.md`: nota que remite al estado final y conserva el diagnóstico histórico.
- Este informe.
- `supabase/config.toml`: restauración de puertos temporales 545xx solicitada, manteniendo los cambios de seguridad Auth ya implementados.

Los demás cambios pendientes pertenecen a SEC-003/004 y se conservaron. `supabase/functions/invite-staff/index.ts` no tiene cambios. No se modificaron SEC-001/002 ni SEC-005 a SEC-009, dependencias o lockfiles.

## Seguridad versionable frente a puertos temporales

Versionar en una futura revisión: la migración y sus pruebas, los cambios de política/mensajes de SEC-003/004, los scripts de configuración local y estas evidencias documentales. En `config.toml`, conservar `minimum_password_length = 8`, `password_requirements = "lower_upper_letters_digits"`, `auth.email.secure_password_change = true` y sus comentarios. La exigencia adicional nativa `GOTRUE_SECURITY_UPDATE_PASSWORD_REQUIRE_CURRENT_PASSWORD=true` sigue activa y debe conservarse mediante el mecanismo de arranque documentado; la CLI instalada no la representa en TOML.

**Excluir del commit únicamente los hunks de puertos**, no descartar el archivo entero: API 54521, DB 54522, shadow 54520, pooler 54529, Studio 54523, Mailpit 54524 y Analytics 54527. Se dejan así en el working tree mientras los servicios los usan, por instrucción expresa. También excluir `supabase/config.toml.qa-backup`, todo `tmp/`, archivos `.env` y artefactos de build. No se hizo staging parcial ni commit.

## Git status al finalizar

```text
 M admin-web/src/components/AccountPassword.tsx
 M package.json
 M scripts/account-policy.test.mjs
 M scripts/auth-policy.local.test.mjs
 M scripts/password-change.test.mjs
 M shared/account-policy.ts
 M src/final-translations.ts
 M supabase/config.toml
 M supabase/tests/database/final_account_routes_return_test.sql
?? docs/SECURITY_P1_AUTH_CORRECTIONS.md
?? docs/STAFF_INVITATION_AGE_CORRECTION.md
?? scripts/auth-security.local.test.mjs
?? scripts/auth-ui.local.test.mjs
?? scripts/configure-local-auth.mjs
?? scripts/staff-invitation.local.test.mjs
?? scripts/start-local-auth.mjs
?? supabase/config.toml.qa-backup
?? supabase/migrations/20261023090000_fix_invitation_age_check_timing.sql
?? supabase/tests/database/staff_invitation_age_timing_test.sql
?? tmp/
```

No se ejecutaron `db reset`, `db push`, actualizaciones de dependencias, commit ni push. No se accedió a Supabase Cloud ni a correo externo.

## Fuentes verificadas

- [GoTrue v2.196.0, Invite: inserción y envío en la misma transacción](https://github.com/supabase/auth/blob/v2.196.0/internal/api/invite.go).
- [GoTrue v2.196.0, creación inicial del usuario](https://github.com/supabase/auth/blob/v2.196.0/internal/api/signup.go).
- [GoTrue v2.196.0, asignación de campos de invitación](https://github.com/supabase/auth/blob/v2.196.0/internal/api/mail.go).
- [PostgreSQL 17, constraint triggers diferibles](https://www.postgresql.org/docs/17/sql-createtrigger.html).
- [GoTrue v2.196.0, contraseña temporal al verificar invitación](https://github.com/supabase/auth/blob/v2.196.0/internal/api/verify.go).
