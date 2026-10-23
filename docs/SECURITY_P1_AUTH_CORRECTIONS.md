# SEC-003 y SEC-004: correcciones locales de Auth

> Actualización posterior (2026-10-23): el bloqueo `adult_required` descrito abajo fue corregido mediante una nueva migración y la invitación real ya pasa sin fecha de nacimiento sintética. Véase [diagnóstico y corrección de invitaciones](STAFF_INVITATION_AGE_CORRECTION.md) para el estado final (552 pgTAP PASS). Por instrucción posterior, `config.toml` conserva ahora los puertos temporales 545xx mientras los servicios los utilizan; esos hunks deben excluirse del commit. Los resultados y el aislamiento con DOB descritos abajo corresponden a la etapa anterior a esa corrección; el test actual ya no tiene ese fallback.

Fecha: 2026-10-23. Rama: `fix/security-p1-auth`. Base conservada: `ccb2109`, con `0b3c011` en su historial. Sin commit, push, cambios de dependencias, migraciones nuevas ni acceso a Supabase Cloud.

## Resultado y límite de la validación

SEC-003 y SEC-004 quedan protegidas en el Auth local probado. Los cambios normales sin contraseña actual o con contraseña incorrecta se rechazan en el servidor. La política del servidor y la aplicación exige ocho caracteres, una minúscula, una mayúscula y un número. Recuperación por correo, cambio de contraseña PWA/Admin y registro válido funcionan.

**La validación integral de invitaciones NO pasa.** El payload real de invitación de gestores falla con HTTP 500 por `adult_required` en el trigger existente. El test de integración termina con código 1 para mantener visible este fallo. No debe interpretarse el resto de resultados como aprobación completa del flujo de invitaciones o del despliegue.

## Causa y configuración

Versiones probadas: Supabase CLI 2.117.0, GoTrue `v2.196.0`, Supabase JS 2.118.0 en ambas aplicaciones.

SEC-003: la comprobación en la aplicación no impedía una llamada directa a `PUT /auth/v1/user`. Además, en esta versión de CLI, `auth.email.secure_password_change = true` configura `GOTRUE_SECURITY_UPDATE_PASSWORD_REQUIRE_REAUTHENTICATION=true`. Una sesión reciente satisface esa condición sin enviar `current_password`. Se comprobó tanto en el código oficial como con peticiones reales.

Se activa también la opción nativa de GoTrue `GOTRUE_SECURITY_UPDATE_PASSWORD_REQUIRE_CURRENT_PASSWORD=true`. Esta es la que comprueba obligatoriamente `current_password` en cambios normales. CLI 2.117.0 no expone dicha opción en TOML: no se añadió una clave inventada. `scripts/configure-local-auth.mjs` configura el contenedor local de Auth mediante Docker Engine, conservando su configuración en memoria y recreando únicamente ese servicio sin volúmenes. Rechaza Docker remoto e imágenes distintas de la versión revisada. No implementa un verificador de contraseñas propio.

`npm run auth:local:start` detiene e inicia Supabase local conservando los volúmenes y aplica esa configuración. Para este entorno se ejecutó con `SUPABASE_LOCAL_PORT_BASE=54500`. Los puertos temporales solo se aplican durante el comando; el archivo versionable vuelve a sus puertos originales 543xx mediante `finally`. No se ejecutó `db reset`. El adaptador dispone de `node scripts/configure-local-auth.mjs --check` para detectar si falta la protección.

**Limitación operativa:** recrear Auth con un `supabase start` ordinario puede perder la opción de contraseña actual, porque la CLI todavía no la representa en TOML. Usar el arranque anterior y comprobar el flag. La configuración TOML por sí sola no resuelve SEC-003 en esta versión.

SEC-004: `letters_digits` permitía omitir la mayúscula exigida por la aplicación. Se sustituye por el preset oficial `lower_upper_letters_digits`, manteniendo `minimum_password_length = 8`. Esto añade explícitamente la obligación de una minúscula: contraseñas como `VOLCAN25`, antes válidas para la aplicación, ahora se rechazan al establecer una contraseña. Se alinearon el validador compartido, los indicadores y mensajes ES/EN de PWA y los mensajes/indicadores de Admin. No se cambió la lógica de inicio de sesión de cuentas existentes.

## Pruebas reales de Auth

Usuarios sintéticos, endpoints loopback, claves tomadas del entorno y contraseñas aleatorias solo en memoria. Los scripts no imprimen credenciales, cuerpos de peticiones, sesiones ni enlaces con tokens; eliminan las cuentas que crean.

Antes de los ajustes:

- Cambio normal sin `current_password`: HTTP 200.
- Cambio con `current_password` incorrecta: HTTP 200.
- Cambio con contraseña actual correcta: HTTP 200.
- Signup con `volcan25` o `VOLCAN25`: HTTP 200.
- Signup sin número o demasiado corto: HTTP 422; contraseña conforme: HTTP 200.

Con solo `secure_password_change=true` y el nuevo preset: las tres variantes de cambio normal seguían devolviendo HTTP 200; las contraseñas sin mayúscula/minúscula ya devolvían HTTP 422. Esto demuestra por qué se necesita el segundo flag nativo.

Con la configuración completa:

- Sin contraseña actual: HTTP 400, `current_password_required`.
- Contraseña actual incorrecta: HTTP 400, `current_password_invalid`.
- Contraseña actual correcta: HTTP 200 y login con la nueva contraseña correcto.
- Signup con `volcan25`, `VOLCAN25`, sin número o demasiado corto: HTTP 422, `weak_password`.
- Signup conforme: HTTP 200, enlace de confirmación recibido en Mailpit y login posterior correctos.
- Recuperación: correo real local, enlace válido, sesión de recuperación y cambio **sin contraseña anterior**: HTTP 200. Nuevo login correcto. Una sesión normal posterior vuelve a exigir contraseña actual (HTTP 400).
- PWA/Admin: helper compartido contra Auth real correcto. Pruebas de navegador con los componentes reales verifican rechazo de contraseña sin minúscula, error por contraseña actual incorrecta, guardado correcto y login con la nueva contraseña en ambas aplicaciones.

### Invitación: fallo previo separado de las protecciones

La llamada real de invitación con nombres y `staff_invitation: true`, sin fecha de nacimiento, devuelve HTTP 500. El diagnóstico local identifica `adult_required` (SQLSTATE 23514). El trigger `handle_new_user()` de `20261022121000_staff_invitation_lifecycle.sql` supone que `new.invited_at` ya está asignado al insertar; GoTrue v2.196.0 inserta el usuario antes de asignar ese campo al enviar la invitación. Por eso aplica el control de edad de turistas a esa inserción. Ese SQL no se modificó en esta tarea.

Para aislar la compatibilidad de Auth con la primera contraseña, el test usa una segunda invitación sintética con fecha de nacimiento de adulto. Ese fixture permite comprobar correo y enlace de invitación, establecimiento de primera contraseña sin contraseña anterior, activación mediante `activate_my_staff_invitation`, sesión `visitor_manager` y login. Todos pasan. **La fecha sintética es solo un fixture de prueba; no se añadió como solución al flujo de producción.** El fallo del payload real sigue haciendo fallar la suite de integración. Corregir ese trigger queda fuera de esta corrección limitada a SEC-003/004.

## Verificaciones

- pgTAP completo: 535 PASS, 24 archivos.
- `npm run test:policy`: 5 PASS.
- `npm run test:password`: 9 PASS.
- `npm run test:staff`: 6 PASS; son pruebas con mocks, no sustituyen la invitación real fallida.
- `npm run test:auth:local`: 7 comprobaciones PASS contra Auth.
- `npm run test:auth:security`: comprobaciones de seguridad, registro, recuperación y cambio PWA/Admin correctas; salida 1 por la invitación real descrita.
- `node scripts/auth-ui.local.test.mjs`: PWA y Admin PASS, usando Playwright y Edge ya instalados, sin añadir dependencias. Monta los componentes reales en un harness temporal; no representa una prueba de navegación completa de toda la aplicación.
- `npm run lint` y `npm run build`, tanto en raíz como en `admin-web`: PASS. Build avisa de chunks mayores de 500 kB; no se modificó ese aspecto.
- Arranque reproducible, comprobación del flag y `git diff --check`: correctos. Sin cambios en SEC-001/002 ni SEC-005 a SEC-009.

Para repetir Auth local, proporcionar `SUPABASE_TEST_URL`, `SUPABASE_TEST_MAIL_URL`, `SUPABASE_TEST_ANON_KEY` y `SUPABASE_TEST_SERVICE_ROLE_KEY` mediante el entorno. En esta máquina los endpoints están en 54521/54524. La prueba de navegador requiere además `PLAYWRIGHT_MODULE_PATH` apuntando al módulo instalado. No guardar claves en comandos versionados ni imprimir `supabase status` con credenciales.

## Archivos y estado de Git

Modificados (`M`):

- `supabase/config.toml`: preset y reautenticación; comentarios del flag adicional. Sin diferencias de puertos frente a HEAD.
- `shared/account-policy.ts`: requisito de minúscula.
- `src/final-translations.ts`: textos ES/EN y regla de minúscula.
- `admin-web/src/components/AccountPassword.tsx`: texto y regla de minúscula.
- `scripts/account-policy.test.mjs`, `scripts/password-change.test.mjs`, `scripts/auth-policy.local.test.mjs`: regresiones de política y envío de contraseña actual.
- `package.json`: comandos locales de arranque y pruebas; sin cambios de dependencias.

Nuevos (`??`), propuestos para una futura revisión/commit:

- `scripts/configure-local-auth.mjs` y `scripts/start-local-auth.mjs`.
- `scripts/auth-security.local.test.mjs` y `scripts/auth-ui.local.test.mjs`.
- `docs/SECURITY_P1_AUTH_CORRECTIONS.md`.

Excluir del commit: `supabase/config.toml.qa-backup` y todo `tmp/` (incluidos respaldos, fuentes consultadas y evidencias locales). No añadir archivos `.env`, credenciales ni artefactos `dist/`. Los harnesses `.auth-security.local/` se eliminan al terminar las pruebas. No hay cambios de lockfiles. No se preparó un commit ni se modificó el historial.

## Aplicación futura a Cloud, solo cuando se autorice

Aplicar la política de mínimo ocho caracteres y minúscula/mayúscula/número, habilitar cambio seguro/reautenticación y, de forma separada, habilitar **Require current password** en Auth. Verificar que la versión/configuración alojada soporta y activa este último control: no basta con habilitar únicamente reautenticación. Desplegar los cambios de validación/mensajes de ambas aplicaciones de forma coordinada. Los scripts Docker y los puertos locales no se aplican a Cloud.

Repetir allí, con autorización, las verificaciones directas de Auth, recuperación e invitación. Resolver y validar previamente el bloqueo del trigger de invitaciones. Esta tarea no accedió a Cloud ni cambió configuración remota.

## Fuentes oficiales consultadas

- [GoTrue v2.196.0: actualización de usuario y excepciones de recuperación/primera contraseña](https://github.com/supabase/auth/blob/v2.196.0/internal/api/user.go).
- [CLI v2.117.0: variables de entorno de GoTrue](https://github.com/supabase/cli/blob/v2.117.0/apps/cli/src/commands/start/services/gotrue.service.ts).
- [CLI v2.117.0: configuración Auth admitida](https://github.com/supabase/cli/blob/v2.117.0/apps/cli-go/pkg/config/auth.go).
- [Supabase: seguridad de contraseñas](https://supabase.com/docs/guides/auth/password-security).
- [GoTrue v2.196.0: orden de creación y envío de invitaciones](https://github.com/supabase/auth/blob/v2.196.0/internal/api/invite.go).
