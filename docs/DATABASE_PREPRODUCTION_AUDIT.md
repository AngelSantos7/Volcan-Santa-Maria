# Auditoría de base de datos previa a producción

Fecha del diagnóstico: 2026-10-23
Rama: `release/production-prep`
Ámbito: Supabase local

## Alcance y método

El diagnóstico se realizó con consultas PostgreSQL dentro de transacciones `READ ONLY`, revisión del catálogo, de las 57 migraciones aplicadas y de los consumidores actuales de las RPC de retorno. No se ejecutó `DELETE`, `UPDATE`, `TRUNCATE`, `DROP`, `db reset`, `db push` ni ninguna operación contra Supabase Cloud. Tampoco se modificaron datos, Storage, Auth o código productivo.

El informe utiliza únicamente conteos y prefijos técnicos de ocho caracteres para distinguir casos. Esos prefijos no son identificadores suficientes para ejecutar una limpieza. No se incluyen nombres, correos completos, teléfonos, documentos, tokens ni secretos.

## 1. Conteo de registros por tabla

| Área | Tabla | Registros |
|---|---|---:|
| Auth | `auth.users` | 27 |
| Auth | `auth.identities` | 27 |
| Usuarios | `profiles` | 148 |
| Usuarios | `user_roles` | 27 |
| Usuarios | `staff_permissions` | 0 |
| Usuarios | `user_consents` | 16 |
| Operación | `visits` | 45 |
| Operación | `visit_members` | 59 |
| Operación | `visit_minors` | 8 |
| Operación | `emergency_contacts` | 24 |
| Comunicación | `announcements` | 1 |
| Comunicación | `notifications` | 8 |
| Comunicación | `notification_recipients` | 121 |
| Web Push | `push_subscriptions` | 0 |
| Auditoría | `audit_logs` | 88 |
| Rutas | `routes` | 2 |
| Rutas | `route_checkpoints` | 0 |
| Rutas | `route_media` | 1 |
| Configuración | `runtime_feature_flags` | 1 |
| Storage | `storage.buckets` | 3 |
| Storage | `storage.objects` | 10 |

Datos complementarios:

- Los 27 usuarios tienen exactamente una identidad de correo, perfil y rol. Hay 26 turistas y un administrador; 25 correos están confirmados y dos no.
- Hay 45 visitas: 35 `completed`, cinco `in_progress` y cinco `cancelled`. Sus 59 integrantes se distribuyen en 45 `completed`, ocho `active` y seis `returned_early`.
- Las ocho notificaciones están publicadas para todos los usuarios; siete ya expiraron. Los 121 destinatarios conservan historial, con 13 lecturas registradas.
- Los tres buckets privados son `avatars` (3 objetos, 102 414 bytes), `notification-media` (6 objetos, 1 461 180 bytes) y `route-media` (1 objeto, 243 530 bytes).
- La única bandera de ejecución es `web_push=false`. No hay suscripciones Push.

## 2. Datos que deben conservarse

Hasta completar respaldo, clasificación y revisión humana debe conservarse toda la base local. En particular:

- El perfil sin usuario Auth con referencia `524fe2d1` no es un huérfano descartable: fue registrado administrativamente, participa en una visita y tiene contacto de emergencia. Representa el modelo válido de visitante presencial sin cuenta.
- Las visitas completadas, sus integrantes, menores, retornos, notificaciones y las 88 entradas de auditoría forman historial operacional. La antigüedad o la ausencia de algún campo heredado no justifica eliminarlos.
- Los diez objetos Storage que sí existen tienen una referencia vigente en perfiles, notificaciones o galería. Ninguno debe eliminarse por barrido de objetos no referenciados.
- Las dos rutas activas contienen distancia, duración, GPX y metadatos de trazado. Los archivos GeoJSON, metadatos y GPX usados por la PWA están versionados en `public/data`.
- El anuncio ambiental activo es el único anuncio inicial. Su contenido no presenta indicios de codificación dañada, pero necesita aprobación editorial expresa antes del lanzamiento.
- El administrador local no debe copiarse automáticamente a producción. Debe conservarse en el respaldo local hasta decidir formalmente si es una cuenta de desarrollo o una identidad institucional.

## 3. Datos sintéticos identificados con evidencia

### Evidencia suficiente

- Tres cuentas Auth usan el dominio reservado `example.invalid`, fueron creadas el 23 de octubre, no tienen visitas y presentan marcadores de pruebas en su perfil. Son cuentas sintéticas comprobables.
- Hay 120 perfiles `self` sin fila en `auth.users`, todos creados el 23 de octubre en ráfagas coincidentes con las pruebas de seguridad. Ninguno participa en visitas ni tiene contacto de emergencia; 106 carecen de nombre y 120 carecen de nacionalidad. Son residuos sintéticos con evidencia fuerte, aunque una futura eliminación debe usar UUID completos obtenidos en una consulta de revisión y una lista de inclusión aprobada.
- Los eventos de invitación refuerzan esa clasificación: nueve destinos distintos tienen perfil, pero ya no tienen identidad Auth, rol ni permisos. Las 12 entradas correspondientes (`9 accepted`, `3 created`) se generaron durante la misma ventana; las tres creaciones contienen dominios `example.invalid`.

### Indicios que no bastan para borrar

- Una cuarta cuenta tiene un marcador de prueba en el nombre del perfil, pero usa un dominio común y tiene una visita. Debe revisarse manualmente; no se clasifica para eliminación automática.
- Diez turistas no tienen consentimiento versionado. Siete son cuentas anteriores con actividad y tres son las cuentas `example.invalid`. La ausencia de consentimiento es una inconsistencia que debe revisarse, no una prueba autónoma de que la cuenta sea basura.
- Existen cinco grupos de teléfonos repetidos: tres pares y un grupo de tres entre cuentas Auth, y un grupo de siete entre perfiles sin Auth. Un teléfono compartido puede ser válido para una familia o grupo; no debe usarse como criterio único de deduplicación.
- Una cuenta antigua no confirmada carece de fecha de nacimiento y de los demás datos de registro. No tiene visitas, pero su estado incompleto por sí solo no permite concluir que sea sintética.

## 4. Visitas atascadas y causa probable

### Visitas realmente inconsistentes

Tres visitas siguen `in_progress` aunque ya no tienen integrantes `active` ni `returning_early`:

| Referencia | Origen | Estado de integrantes | Retorno esperado | Diagnóstico |
|---|---|---|---|---|
| `e78d5a29` | administrativa | 1 `returned_early` con salida | 2026-09-25 | La visita nunca recibió el cierre global. |
| `24db0153` | turista | 1 `completed` y 1 `returned_early`, ambos con salida | 2026-10-03 | Todos retornaron, pero `visits.status` quedó abierto. |
| `5846b935` | turista | 1 `returned_early` con salida | 2026-10-17 | La visita nunca recibió el cierre global. |

Las tres finalizaron antes de `20261022122000_route_history_and_return_compatibility.sql`. La versión histórica de `confirm_my_early_checkout(uuid)` cambiaba al integrante a `returned_early` y registraba `checked_out_at`, pero no actualizaba `visits.status` ni `completed_at` cuando salía la última persona. La migración del 22 de octubre añadió ese cierre. Esto explica los tres registros sin asumir un retorno que no esté documentado.

La RPC administrativa actual tampoco repara esos casos retrospectivamente: `staff_register_administrative_group_return(...)` solo procesa integrantes todavía abiertos; si no encuentra ninguno devuelve `already_confirmed` y deja la visita `in_progress`. Por ello son candidatos a una corrección de datos controlada, no a volver a registrar el retorno de un turista.

### Visitas abiertas que no deben cerrarse automáticamente

- `1c841f24` está vencida y conserva un líder `active`; otro integrante ya completó su participación. Requiere confirmación física del participante o retorno administrativo por personal con `can_confirm_returns`.
- `19054701` conserva dos integrantes `active` y todavía no había alcanzado su hora esperada en la instantánea consultada. Es un estado operativo válido.

### Historial heredado adicional

Veinte integrantes de 14 visitas completadas entre el 16 y el 26 de septiembre tienen `member_status=completed`, pero no `checked_out_at` ni `checkout_method`. Coinciden con el comportamiento heredado de `complete_group_visit(uuid)`, que cambiaba el estado grupal sin registrar la salida individual. La RPC sigue definida, pero SEC-001 retiró su ejecución a `PUBLIC`, `anon` y `authenticated`; solo `postgres` y `service_role` conservan acceso, y no existe consumidor de aplicación vigente.

Las rutas actuales son correctas para operaciones nuevas:

- `complete_my_visit_participation(uuid)` solo cierra la participación del usuario y completa la visita al salir el último integrante.
- `confirm_my_early_checkout(uuid)` cierra también la visita cuando ya no queda nadie abierto.
- Las RPC administrativas exigen `can_confirm_returns` y registran actor, método y auditoría.
- `complete_group_visit(uuid)` no es accesible a sesiones autenticadas. Como defensa adicional futura, conviene eliminarla o hacer que una eventual llamada de backend complete también los campos de salida; no hay un consumidor actual que justifique usarla.

No se modificó ningún estado ni se marcó a ningún turista como retornado durante esta auditoría.

## 5. Inconsistencias de integridad

No se encontraron relaciones rotas en las claves operativas revisadas: usuarios sin perfil, roles sin usuario, integrantes sin visita o perfil, menores sin responsable, destinatarios sin notificación o usuario, rutas ausentes, actores administrativos inexistentes ni objetos Storage sueltos. Todos esos conteos son cero.

Sí se encontraron estos casos que requieren decisión:

- **121 perfiles sin Auth:** 120 tienen evidencia de fixture; uno es un visitante presencial válido. La ausencia de Auth es permitida por el modelo administrativo y no puede tratarse como una infracción uniforme.
- **Consentimiento:** 10 de 26 turistas carecen de `user_consents`; siete tienen historial de visitas. Debe aclararse si son registros anteriores a la exigencia o si necesitan regularización antes de una nueva visita.
- **Perfiles incompletos:** cuatro turistas carecen de nacionalidad, teléfono y documento; uno de ellos también carece de fecha de nacimiento. Tres son las cuentas de dominio reservado y el cuarto es la cuenta antigua no confirmada.
- **Avatar faltante:** cuatro perfiles apuntan a un avatar cargado, pero solo tres objetos existen. La referencia faltante pertenece a una cuenta Auth con actividad y debe repararse o retirarse únicamente con decisión del propietario.
- **Auditoría de invitaciones:** nueve destinos auditados conservan perfil, pero no identidad Auth, rol ni permisos. Es coherente con limpieza parcial de usuarios sintéticos, aunque deja el historial sin entidad activa. Los logs no tienen una FK de destino y deben preservarse como evidencia hasta aplicar la política de retención.
- **Auditoría sensible:** no se detectaron términos de contraseña, secretos, tokens o enlaces de verificación/recuperación. Tres eventos sintéticos de creación de invitación sí contienen correo y nombre en metadata, por lo que el respaldo y la retención de auditoría deben tratarse como datos personales.
- **Rutas:** las dos rutas activas tienen distancia, duración y metadatos GPX, pero no descripción, dificultad ni desnivel; `route_checkpoints` está vacío. Los campos son anulables y la PWA utiliza los activos estáticos, así que no es una rotura referencial, pero el contenido debe aprobarse como suficiente para lanzamiento.
- **Notificaciones:** siete de ocho están expiradas. Es historial válido y no una razón automática de borrado.
- **Permisos:** el único administrador no tiene fila en `staff_permissions`; esto coincide con el diseño actual, que concede al rol `admin` las capacidades efectivas sin esa fila. No hay gestores activos ni invitaciones pendientes en `staff_permissions`.

## 6. Riesgos de eliminación

- Eliminar una cuenta Auth activa puede romper o ser bloqueado por referencias de visitas, creaciones y acciones administrativas. También puede retirar roles e identidades sin resolver archivos, referencias textuales de auditoría o historial legal.
- Eliminar un perfil por no tener Auth puede borrar un visitante presencial legítimo y su contacto de emergencia. El caso `524fe2d1` demuestra que esa regla sería insegura.
- Eliminar visitas puede propagar la pérdida a integrantes y menores y destruir la evidencia de entrada, salida y responsabilidad.
- Eliminar notificaciones expiradas elimina historial de publicación, destinatarios y lectura.
- Eliminar filas de `storage.objects` no equivale necesariamente a respaldar o retirar el binario. A la inversa, borrar solo el binario deja referencias rotas en la base.
- Corregir `checked_out_at` usando `completed_at` introduciría una precisión que no está demostrada. Los 20 registros heredados deben mantenerse sin ese dato o corregirse solo si existe evidencia adicional.
- Borrar auditorías sintéticas de forma selectiva altera una bitácora que pretende ser inmutable. Para producción limpia es más seguro no migrar esas filas que reescribir el historial local.
- Los prefijos de UUID incluidos en este informe son solo referencias humanas y nunca deben alimentar un script de eliminación.

## 7. Propuesta de limpieza controlada

La opción recomendada es conservar la instancia local como evidencia y crear producción desde las migraciones, sin copiar datos mutables. Así no es necesario arriesgar una limpieza destructiva de la base que contiene pruebas mezcladas con registros potencialmente reales.

Si después se autoriza sanear la base local, el proceso debería ser:

1. Congelar escrituras y producir respaldo completo, manifiesto Storage y reporte de conteos.
2. Generar una lista de inclusión con UUID completos para las tres cuentas de dominio reservado y los 120 perfiles de la ventana de pruebas. Revisarla por dos personas y demostrar para cada fila la ausencia de relaciones que deban conservarse.
3. Separar explícitamente el visitante presencial válido y cualquier cuenta dudosa. Las cuentas antiguas, incompletas o con teléfonos repetidos permanecen fuera de la lista hasta decisión del propietario.
4. Ejecutar primero un ensayo que solo reporte filas afectadas. La limpieza real debe estar en un script versionado, transaccional, con precondiciones de conteo y aborto si el estado cambió.
5. Mantener o archivar las auditorías según una política de retención aprobada; no borrarlas como efecto lateral de limpiar fixtures.
6. Para las tres visitas inconsistentes, preparar una migración de datos independiente. Debe comprobar que no haya integrantes abiertos, fijar únicamente `visits.status='completed'` y `completed_at` a partir de la última salida ya registrada, e insertar una entrada de auditoría de corrección. No debe cambiar estados ni horarios de integrantes.
7. Para `1c841f24`, usar el flujo vigente solo después de verificar el retorno real. No incluirla en la reparación anterior.
8. Verificar conteos, claves, accesos RLS, informes y objetos Storage; conservar el respaldo hasta superar el período acordado de observación.

Ninguno de estos pasos destructivos se ejecutó en esta tarea.

## 8. Plan de respaldo y recuperación

Antes de cualquier limpieza o migración de datos:

1. Crear un dump cifrado de base completa y dumps separados de esquema y datos, incluyendo `auth`, `public`, `storage` y el historial de migraciones. Guardar versión de PostgreSQL/Supabase y checksums SHA-256.
2. Exportar un manifiesto de buckets con ruta, tamaño, tipo y checksum; descargar los binarios mediante la API Storage a un repositorio cifrado y con acceso restringido. Los respaldos de base cubren PostgreSQL, pero no los objetos binarios de Storage, según la [documentación oficial de Supabase](https://supabase.com/docs/guides/database/overview).
3. Guardar configuración Auth, URLs, plantillas y nombres de secretos por separado. Los valores de secretos permanecen en el gestor de secretos y nunca en el repositorio o el informe.
4. Probar la restauración en una instancia aislada: comparar los 21 conteos de la sección 1, ejecutar comprobaciones de integridad, verificar login de cuentas sintéticas autorizadas para el ensayo y comprobar descarga de una muestra de cada bucket.
5. Documentar responsable, ubicación, cifrado, retención, RPO y RTO. Una copia no se considera respaldo válido hasta completar una restauración de ensayo.

## 9. Plan para iniciar Supabase Cloud con datos limpios

La base local registra 57 migraciones aplicadas, desde `20260914204658` hasta `20261023130000`. El repositorio no contiene `supabase/seed.sql`, aunque `config.toml` apunta a esa ruta. Los datos esenciales se crean dentro de las migraciones:

- dos rutas activas con GPX y metadatos;
- tres buckets Storage privados;
- un anuncio ambiental activo;
- `runtime_feature_flags.web_push=false`;
- esquema, RLS, RPC, roles y correcciones SEC-001 a SEC-009.

Las migraciones no crean usuarios Auth, visitas, contactos, notificaciones, auditorías ni objetos Storage. Tampoco crean un administrador inicial. Por tanto, un proyecto nuevo permite una línea base limpia sin exportar datos de esta instancia.

Plan propuesto para una ventana futura expresamente autorizada:

1. Crear un proyecto Cloud vacío y registrar región, versión y responsables. No reutilizar esta base local ni ejecutar restauración de sus datos.
2. Desde un artefacto Git revisado, enlazar el proyecto, ejecutar primero `supabase db push --dry-run` y después aplicar las migraciones sin `--include-seed`. Supabase documenta que `db push` aplica las migraciones pendientes y recomienda no incluir seeds de desarrollo en producción: [flujo local y despliegue](https://supabase.com/docs/guides/local-development/cli-workflows) y [migraciones](https://supabase.com/docs/guides/local-development/database-migrations).
3. Confirmar la línea base esperada antes de admitir usuarios: 2 rutas, 3 buckets, 1 anuncio, 1 bandera `web_push=false`; cero usuarios, perfiles, visitas, contactos, notificaciones, destinatarios, suscripciones y auditorías.
4. Desplegar las Edge Functions desde el mismo release y configurar únicamente variables de entorno y secretos en Cloud. Mantener `WEB_PUSH_ENABLED` ausente o `false`; no configurar VAPID ni tareas de envío.
5. Aplicar en Auth: confirmación obligatoria de correo, mínimo ocho caracteres, `lower_upper_letters_digits`, cambio seguro y exigencia de contraseña actual. Esta última opción debe verificarse en la versión Cloud; no basta la reautenticación. Configurar URLs permitidas y plantillas. SMTP real sigue siendo una etapa separada.
6. Publicar PWA/Admin con sus URLs Cloud y `VITE_WEB_PUSH_ENABLED=false`. Comprobar que los archivos versionados de `public/data` se entregan con los checksums esperados.
7. Revisar las dos rutas y el anuncio con responsables de operación y contenido. Si descripción, dificultad, desnivel, checkpoints o texto requieren cambios, realizarlos mediante una nueva migración revisada antes del lanzamiento. No editar la base remota manualmente.
8. No copiar el objeto de galería local ni ningún avatar o medio de notificación. Si se aprueban imágenes iniciales, cargarlas mediante un proceso de contenido auditado después de crear el administrador y crear sus filas de referencia de forma coordinada.
9. Crear la identidad administrativa inicial mediante Auth con correo institucional confirmado y contraseña conforme. Dos responsables deben verificar el UUID. Una operación transaccional de bootstrap, revisada y parametrizada, cambia únicamente ese UUID de `tourist` a `admin` e inserta auditoría; no debe contener correo, contraseña o UUID fijo en Git. Verificar inmediatamente acceso, rol y ausencia de cuentas adicionales.
10. Mantener la instancia vacía cerrada al público hasta completar todas las pruebas de la sección 10. Solo después habilitar las URLs públicas y el registro.

Las instrucciones oficiales también advierten que clonar/restaurar un proyecto copia la base, pero no los objetos ni la configuración Storage; por eso este plan separa esquema, binarios y configuración: [restaurar a un proyecto nuevo](https://supabase.com/docs/guides/platform/clone-project).

## 10. Pruebas necesarias antes del lanzamiento

- Reproducir las 57 migraciones desde cero en una instancia desechable o staging y comparar esquema, grants, RLS, funciones y conteos base. Esta auditoría no ejecutó `db reset` por restricción expresa.
- Ejecutar el pgTAP completo y conservar como mínimo la referencia actual de 628 pruebas aprobadas.
- Ejecutar `npm run lint` y `npm run build` en PWA y Admin con las variables de producción no secretas.
- Repetir pruebas directas de Auth: registro adulto, rechazo de menor/sin DOB, confirmación de correo, recuperación, contraseña actual obligatoria e invitación/activación de gestor.
- Verificar que metadata de cliente no concede roles, que el administrador inicial es único y que cada gestor recibe únicamente sus permisos aprobados.
- Probar RLS y RPC para ascensos, integrantes, menores, retorno normal, anticipado y administrativo. Incluir la condición de que la última salida cierre la visita y que una visita sin integrantes abiertos no permanezca `in_progress`.
- Verificar que `complete_group_visit(uuid)` continúa inaccesible para `anon` y `authenticated` y que no existe consumidor productivo.
- Probar anuncios, notificaciones internas, historial y publicación programada; confirmar que no se solicita permiso del navegador ni se registra o envía Web Push.
- Validar ambas rutas, GeoJSON/GPX, modo offline y orientación sin seguimiento continuo. Revisar explícitamente los campos de contenido actualmente vacíos.
- Comprobar buckets privados, políticas, URLs firmadas y consistencia entre cada fila de medios y su objeto. Una línea base limpia debe empezar con cero objetos hasta cargar contenido aprobado.
- Ejecutar una restauración de ensayo del respaldo previo y comparar conteos, checksums y una muestra de archivos.
- Realizar un ensayo de rollback del despliegue y documentar el punto de decisión antes de abrir el registro público.

### Validaciones ejecutadas en este diagnóstico

- Consultas de inventario, integridad, Storage, auditoría y estados de visita: **PASS**, todas dentro de transacciones `READ ONLY`.
- Revisión de las 57 migraciones aplicadas y de las definiciones/ACL de las RPC de retorno: **PASS**.
- `npm run lint`, PWA: **PASS**.
- `npm run build`, PWA: **PASS** con Vite 8.3.5; persiste el aviso informativo de chunks mayores de 500 kB.
- `npm run lint`, Admin: **PASS**.
- `npm run build`, Admin: **PASS** con Vite 8.3.5; persiste el aviso informativo de chunks mayores de 500 kB.
- `git diff --check`: **PASS**.
- pgTAP no se repitió: la tarea exigía inspección de base exclusivamente mediante lecturas y las suites crean fixtures, aunque los reviertan. La última referencia documentada permanece en **628 PASS** y debe repetirse en el ensayo previo al lanzamiento.

## Estado Git al finalizar el diagnóstico

Antes de esta auditoría ya existían cambios locales que se preservaron:

```text
 M supabase/config.toml
?? supabase/config.toml.qa-backup
?? tmp/
```

`supabase/config.toml` solo difiere de `HEAD` en los puertos temporales 545xx y mantiene el SHA-256 `60911267AD5134B4BD790529E3D8E0B5A95594E30545BC94DA2FE03130234161`. Esos puertos, el respaldo y `tmp/` deben quedar fuera de un futuro commit. El único archivo creado por este diagnóstico es `docs/DATABASE_PREPRODUCTION_AUDIT.md`.

No se hizo commit, push ni modificación de Supabase Cloud.
