# SEC-005 y SEC-006 — seguridad de Web Push

Fecha: 2026-10-23. Rama comprobada: `fix/security-p1-push`. Historial conservado: `d91d6c2`, `ccb2109`, `0b3c011`. Sin commit, push ni acceso a Cloud.

## Clasificación final

**SEC-005: CORREGIDO en local.** El conflicto de endpoint no puede transferir propiedad ni reemplazar claves ajenas. Se verificaron el exploit original, grants/RLS y concurrencia real entre conexiones PostgreSQL.

**SEC-006: PARCIAL.** Se bloquean destinos arbitrarios en PostgreSQL y antes del transporte, con política de proveedores y rechazo explícito de redirecciones. No se ha demostrado ni instalado una política de salida de red que compruebe la IP efectivamente conectada. La resolución DNS de dominios permitidos, posibles cambios de resolución y las garantías de infraestructura siguen pendientes. No se declara cerrada completamente la SSRF.

## Diagnóstico y evidencia inicial

Se comprobaron `git branch --show-current`, `git status` y `git log -4 --oneline` antes de editar. Solo había cambios temporales de puertos en `supabase/config.toml`, el respaldo `supabase/config.toml.qa-backup` y `tmp/`.

SEC-005: `register_push_subscription` era `SECURITY DEFINER` y usaba `ON CONFLICT(endpoint) DO UPDATE SET user_id=auth.uid()`. El índice UNIQUE serializaba el conflicto, pero la operación autorizaba transferir el propietario. RLS estaba habilitado sin políticas de lectura/escritura de clientes; esto no protegía la operación interna del definer. Además existían grants directos amplios, incluido TRUNCATE, que no está sujeto a RLS.

Se reprodujo en una transacción local con dos identidades sintéticas, roles `authenticated` y claims separados: A registró un endpoint sintético de FCM; B registró exactamente el mismo endpoint con otras claves. Antes del cambio, la consulta privilegiada del fixture confirmó simultáneamente propietario B y ambas claves de B. Todo se revirtió con ROLLBACK, sin transporte ni datos reales.

SEC-006: la RPC solo comprobaba límites máximos de longitud; aceptaba `https://127.0.0.1:65500/sec-canary`. La misma reproducción SQL confirmó su aceptación. Edge leía los endpoints guardados y los entregaba directamente a `webpush.sendNotification`. Se ejecutó el código anterior de `d91d6c2` en un harness con SDK y transporte sustituidos: el destino loopback llegó al transporte mock una vez. No se abrió ninguna conexión a ese destino. Esto reproduce propagación insegura; no demuestra explotación real de SSRF.

La base local tenía **cero suscripciones** al comenzar. No se extrajeron ni imprimieron tokens de suscripciones reales. La PWA usa `registration.pushManager.subscribe` con VAPID y detección estándar de soporte; no contiene una selección propia de proveedor ni telemetría que permita certificar qué navegador usan los usuarios.

## Migración y propiedad atómica

Nueva migración: `supabase/migrations/20261023100000_secure_push_subscription_endpoints.sql`, aplicada únicamente con `supabase migration up --local`.

La RPC conserva nombre, argumentos y retorno UUID. Obtiene el propietario exclusivamente de `auth.uid()`. El upsert nunca asigna `user_id` durante un conflicto y solo actualiza claves, user agent y timestamp cuando `existing.user_id=caller_id`. Si el conflicto pertenece a otro usuario, no retorna fila y lanza SQLSTATE `42501`, mensaje genérico `Unable to register push subscription.`; no retorna UUID, propietario ni claves ajenas. La comprobación está dentro de `ON CONFLICT`, bajo el bloqueo del índice único, no en un SELECT previo vulnerable a carreras.

Se mantiene el índice UNIQUE del endpoint, el índice de usuario, las FK, RLS y el `search_path=''`. Se revoca ejecución de registro a PUBLIC/anon y se otorga a `authenticated`. Se revocan los accesos directos de escritura y TRUNCATE de clientes. Se conserva SELECT para `authenticated`, pero RLS sin políticas sigue ocultando todas las filas, igual que antes: no se añade una nueva vía de lectura de claves, ni siquiera propias. Los consumidores existentes registran/eliminan mediante RPC y no consultan directamente esta tabla.

`remove_push_subscription` conserva su filtro de propietario y su contrato. El test comprueba que B no puede borrar el endpoint de A y que A sí puede eliminar su propia suscripción. Renovación propia y múltiples endpoints siguen permitidos.

## Política de endpoints y proveedores

La política se aplica en `public.is_allowed_push_endpoint`, en la RPC, mediante CHECK de tabla y en `supabase/functions/_shared/push-endpoint.ts` inmediatamente antes del envío. Hay 53 casos de paridad ejecutados contra PostgreSQL y TypeScript.

Hosts admitidos, según documentación de los proveedores:

- `fcm.googleapis.com`: Chrome/Chromium y navegadores que usen FCM, incluidos formatos `/fcm/send/...` y `/wp/...`.
- `updates.push.services.mozilla.com`: servicio público de Firefox/Mozilla Autopush.
- Subdominios válidos de `push.apple.com`: Safari y aplicaciones web compatibles en plataformas Apple. Se conserva el wildcard que Apple documenta, sin limitarlo a `web.push.apple.com`.
- Subdominios válidos de `notify.windows.com`: canales WNS, utilizados por Edge en Windows. Microsoft advierte que el subdominio puede cambiar; no se fija una región concreta.

Esta es compatibilidad de política y del formato de transporte, no una certificación de entrega en cada navegador. Un navegador que use otro proveedor o un servidor push personalizado será rechazado hasta revisar y añadir su proveedor con evidencia. No se permiten comodines generales como `*.googleapis.com` o `*.mozilla.com`.

Reglas:

- HTTPS, longitud máxima 2048, caracteres ASCII imprimibles seguros y autoridad DNS canónica en minúsculas.
- Sin credenciales, fragmentos, backslashes, espacios/controles, codificación porcentual inválida o controles/backslash codificados.
- Sin puerto explícito: el tráfico usa HTTPS 443. Incluso `:443` explícito se rechaza como alias; los endpoints canónicos serializados por el navegador lo omiten.
- Sin IP literales de ninguna familia (incluidas privadas, loopback, reservadas, link-local, IPv4 numérica/hexadecimal e IPv6 mapeada), localhost, hosts internos ni dominios ajenos. La allowlist cierra también formas de IP no enumeradas individualmente.
- Validación de cada etiqueta DNS y del límite de sufijo de proveedor. No se aceptan hosts porcentualmente codificados, Unicode, punto final ni variantes de autoridad que se normalicen a otra cadena.
- En Edge se usa el parser WHATWG `URL`, verificando protocolo, hostname, credenciales, puerto y serialización, además de la política estructurada. PostgreSQL separa autoridad/recurso y aplica comprobaciones equivalentes, no una única regex de prefijo.
- Ruta/query de proveedor tratadas como opacas: no se reescriben tokens ni se inventa un formato rígido de token. Se exige recurso no vacío y se rechazan segmentos `.`/`..`, incluidos sus equivalentes codificados.

El CHECK se crea **NOT VALID** para no borrar datos históricos ni impedir una futura migración por endpoints antiguos inseguros. PostgreSQL sí exige el CHECK en toda inserción/actualización nueva. Edge rechaza también filas históricas inválidas antes de llamar al generador o al transporte. No se realizó limpieza de datos existentes.

## Edge y transporte

Se conserva la autorización con la sesión del llamante mediante `has_staff_permission('can_manage_notifications')`. La credencial de servicio se utiliza solo después de autorizar. Se exige POST y UUID válido; solo se consultan notificaciones publicadas y sus destinatarios guardados, no endpoints recibidos en el cuerpo de la petición. Los errores de consulta interrumpen el envío y la respuesta general no expone mensajes internos.

`web-push@3.6.7` sigue realizando cifrado y firma VAPID mediante su API oficial `generateRequestDetails`. No se cambió ni actualizó la dependencia ni se implementó criptografía propia. `sendValidatedPush` valida el endpoint antes de generar la petición y comprueba que el generador no cambie endpoint/método. Envía los mismos bytes cifrados y cabeceras mediante `fetch` con `redirect: 'error'`, `credentials: 'omit'` y timeout de 15 segundos. Cualquier respuesta 3xx recibida también se rechaza sin usar Location ni reintentar. No se leen ni registran cuerpos de error del proveedor.

La biblioteca anterior ya usaba `https.request` sin seguir redirecciones; no se atribuye un exploit de redirección a la versión anterior. La nueva ruta de envío hace explícita esa garantía y la prueba independientemente del generador criptográfico.

Se mantiene TTL 3600, contenido del payload, conteo de enviados y eliminación de suscripciones expiradas por 404/410. La eliminación compara UUID, endpoint y ambas claves del snapshot enviado para no borrar una renovación concurrente. No se modificaron Service Worker, anuncios, contenido de notificaciones, PWA, Admin ni `invite-staff`.

## Resultados antes/después y pruebas

- SEC-005 antes: B adquiría propietario y claves; después: SQLSTATE 42501 y los tres campos permanecen de A.
- SEC-006 antes: el endpoint interno era aceptado por SQL y alcanzaba el transporte interceptado; después: SQLSTATE 22023 en registro y cero llamadas al generador/transporte desde Edge.
- `node scripts/push-security.test.mjs --baseline`: **1 PASS**, reproducción controlada del código anterior desde Git, sin enviar push.
- `npm run test:push`: **63 PASS, 0 FAIL**. Incluye proveedores válidos, IP/localhost/internos, malformaciones, credenciales, puertos, manipulación/codificación, longitud, denegación por permiso, validación de parámetros, errores de consulta, 404/410 y redirecciones 301/302/303/307/308 a un recurso interno. Las redirecciones producen una sola llamada mock al proveedor permitido y ninguna al destino interno.
- `npm run test:push:local`: **53 casos de paridad PASS** y **3 escenarios concurrentes PASS**. Dos conexiones PostgreSQL reales por escenario; se observa `wait_event_type='Lock'` antes de liberar la primera transacción. A vence a B, B vence a A y renovación concurrente del mismo propietario: resultados correctos. No fue una prueba de carga.
- `node scripts/push-crypto.local.test.mjs`: **8 PASS**, usando `web-push 3.6.7` copiado de la caché existente de Edge. Se generan claves sintéticas solo en memoria, se verifica cifrado AES128GCM/VAPID, conservación de bytes, cabeceras y opciones; HTTP/HTTPS reales están bloqueados y fetch se intercepta. No se instalaron paquetes.
- pgTAP focalizado (seguridad push y notificaciones existentes): **63 PASS en 2 archivos**.
- pgTAP completo: **581 PASS, 0 FAIL en 26 archivos**; 552 anteriores + 29 nuevas.
- `npm run test:policy`: 5 PASS; `test:password`: 9 PASS; `test:staff`: 6 PASS; `test:map`: 3 PASS.
- `npm run lint` y `npm run build`: PASS en PWA.
- `npm --prefix admin-web run lint` y `npm --prefix admin-web run build` (ejecutados desde ese directorio): PASS. Persisten avisos Vite de chunks mayores de 500 kB.
- Comprobación TypeScript estricta de ambos helpers nuevos: PASS (`tsc --ignoreConfig --noEmit --strict --skipLibCheck --target es2023 --module nodenext --allowImportingTsExtensions ...`).
- `git diff --check`: PASS. Control local de exigencia de contraseña actual: activo.

El primer lint PWA se interrumpió con ENOENT mientras se movía la copia temporal de la caché usada por la prueba criptográfica. Se repitió después de ubicarla bajo el directorio temporal `node_modules`, ignorado normalmente por ESLint, y pasó. No se modificó la configuración de lint para ocultar errores.

La prueba histórica de notificaciones usaba `push.example.invalid`, ahora rechazado por diseño. Se sustituyó únicamente por un token sintético de FCM; se conservaron las mismas expectativas de registro permitido y propietario. No se relajaron aserciones. Las cuentas de concurrencia se eliminaron usando solo sus UUID recién generados; las pruebas SQL restantes se revierten.

## Límites y producción pendiente

1. **DNS/IP de conexión:** la allowlist controla nombres, no la IP resuelta efectivamente por fetch. No se aplica pinning ni inspección del peer conectado. Una consulta DNS previa aislada no eliminaría el riesgo de cambio entre comprobación y conexión, por lo que no se presenta como garantía. No se probaron resoluciones hacia recursos internos ni se enviaron peticiones a ellos.
2. **Egress:** antes de cerrar SEC-006, aplicar/verificar una política de salida para la función push o un transporte/proxy controlado que valide cada conexión, bloquee redes privadas/reservadas/link-local/loopback IPv4 e IPv6 y mantenga TLS, SNI y ausencia de redirecciones. Distinguir ese tráfico de la conexión autorizada al propio Supabase. Si la plataforma alojada no ofrece esa capacidad, evaluar un servicio de envío aislado que sí la ofrezca. Nada de esto se configuró en Cloud.
3. **Compatibilidad real:** no hubo suscripciones de navegadores ni envíos externos durante esta tarea. Quedan pendientes, con autorización específica, pruebas de entrega real en Chrome, Firefox, Safari/iOS y Edge/WNS, incluyendo recepción por el Service Worker. El código de consumidor y Service Worker permanece intacto; la prueba criptográfica no equivale a recepción física.
4. **Despliegue coordinado:** aplicar la migración y desplegar `send-push-notification` junto con `_shared` mediante el proceso autorizado. Hasta entonces la corrección no existe en Cloud. Las pruebas Edge ejecutaron el código en harness; no se invocó el envío real local ni remoto.
5. **Filas históricas:** revisar de forma privilegiada los registros rechazados por `is_allowed_push_endpoint`, sin exponer tokens. Renovarlos/eliminarlos solo con autorización. Luego se podrá validar completamente el CHECK. No hay borrado automático de suscripciones inválidas ni transferencia implícita entre usuarios.
6. Conservar VAPID privada y service role solo en secretos del backend; no incorporarlas a frontend, fixtures o logs. El adaptador mantiene validación TLS normal. No se implementaron idempotencia global de envío ni otros cambios fuera de SEC-005/006.

## Archivos modificados y nuevos

Modificados: `package.json` (dos comandos de prueba), `supabase/functions/send-push-notification/index.ts`, `supabase/tests/database/phase4_operations_minors_notifications_test.sql` (fixture de proveedor).

Nuevos: la migración `20261023100000_secure_push_subscription_endpoints.sql`, `supabase/tests/database/security_push_test.sql`, `supabase/functions/_shared/push-endpoint.ts`, `supabase/functions/_shared/push-transport.ts`, `scripts/fixtures/push-endpoints.json`, `scripts/push-security.test.mjs`, `scripts/push-concurrency.local.test.mjs`, `scripts/push-crypto.local.test.mjs` y este informe.

## Configuración conservada y exclusiones del commit

`supabase/config.toml` no fue editado durante esta tarea. SHA-256 inicial y final: `60911267AD5134B4BD790529E3D8E0B5A95594E30545BC94DA2FE03130234161`. Conserva los puertos temporales 545xx y las protecciones Auth de SEC-003/004. No se reinició Supabase ni se reemplazó Auth; el flag nativo de contraseña actual sigue activo.

Los ajustes permanentes de Auth ya pertenecen a `d91d6c2`: deben conservarse versionados. El diff actual de `config.toml` contiene solo puertos temporales y **debe excluirse del commit**, sin restaurar el archivo mientras los servicios usen esos puertos. Excluir también `supabase/config.toml.qa-backup`, todo `tmp/` (incluida la copia de caché para pruebas), archivos `.env` y artefactos de build. No hay cambios de dependencias ni lockfiles.

Git status final:

```text
 M package.json
 M supabase/config.toml
 M supabase/functions/send-push-notification/index.ts
 M supabase/tests/database/phase4_operations_minors_notifications_test.sql
?? docs/SECURITY_P1_PUSH_CORRECTIONS.md
?? scripts/fixtures/
?? scripts/push-concurrency.local.test.mjs
?? scripts/push-crypto.local.test.mjs
?? scripts/push-security.test.mjs
?? supabase/config.toml.qa-backup
?? supabase/functions/_shared/
?? supabase/migrations/20261023100000_secure_push_subscription_endpoints.sql
?? supabase/tests/database/security_push_test.sql
?? tmp/
```

`git diff --stat` (archivos rastreados; incluye los puertos preexistentes):

```text
 package.json                                        |  4 +++-
 supabase/config.toml                                | 14 +++++++-------
 supabase/functions/send-push-notification/index.ts  | 24 +++++++++++++++++++-----
 ...phase4_operations_minors_notifications_test.sql  |  3 ++-
 4 files changed, 31 insertions(+), 14 deletions(-)
```

Git no incluye archivos nuevos sin staging en ese diff. Los nueve archivos nuevos se enumeran arriba; no se hizo staging para alterar la salida del informe.

## Fuentes oficiales consultadas

- [Chromium: constantes de endpoint push](https://chromium.googlesource.com/chromium/src/+/refs/tags/148.0.7734.4/components/push_messaging/push_messaging_constants.cc).
- [Mozilla Autopush: endpoints y URLs opacas](https://mozilla-services.github.io/autopush-rs/http.html).
- [WebKit: Web Push y dominios de Apple](https://webkit.org/blog/12945/meet-web-push/).
- [Apple: envío Web Push](https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers).
- [Microsoft: WNS, validación del dominio y subdominios variables](https://learn.microsoft.com/en-us/windows/apps/develop/notifications/push-notifications/wns-overview).
- [Microsoft Edge: notificaciones PWA](https://learn.microsoft.com/en-us/microsoft-edge/progressive-web-apps/how-to/notifications-badges).
- [web-push 3.6.7: generación de petición, cifrado y transporte](https://github.com/web-push-libs/web-push/blob/v3.6.7/src/web-push-lib.js).

Sin `db reset`, `db push`, `npm audit fix`, modificaciones de SEC-001 a SEC-004 o SEC-007 a SEC-009, envío real de push, pruebas de estrés, eliminación de datos reales, commit, push ni Cloud.
