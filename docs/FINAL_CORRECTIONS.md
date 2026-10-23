# Informe de correcciones finales — 22 de octubre de 2026

> Informe más reciente: [correcciones finales de PWA, rutas y contraseñas](FINAL_PWA_ROUTES_PASSWORDS.md), con el inventario de esta fase y los 21 puntos de validación.

> Informe histórico de la fase anterior. La política de contraseña, la habilitación a las cuatro horas y el mapa con ambas rutas se actualizan en [UX_UI_CORRECTIONS.md](UX_UI_CORRECTIONS.md).

Implementación en el repositorio y Supabase local. No se modificó Supabase Cloud, no se ejecutó `db reset` ni `db push`, no se editaron archivos `.env.local`, no se borraron usuarios o datos existentes y no se hizo commit. No se agregaron dependencias. TypeScript continúa en modo estricto.

1. **Archivos modificados.** El inventario completo figura al final. Se reutilizaron servicios, tablas, RPC, componentes de visita, MapLibre y el flujo de correo existentes. Los dos GPX suministrados ya estaban en `public/data/`; se conservaron sin modificar.

2. **Migraciones creadas y aplicadas únicamente en local.**
   - `20261022120000_final_account_routes_return_rules.sql`: mayoría de edad, retornos, dos rutas, cambio auditado y consultas administrativas.
   - `20261022121000_staff_invitation_lifecycle.sql`: invitaciones pendientes/revocadas, protección de identidades existentes y activación.
   - `20261022122000_route_history_and_return_compatibility.sql`: compatibilidad del motivo administrativo anterior, cierre del grupo al regresar el último participante e historial/reportes con ruta.
   - `20261022123000_preserve_minor_responsibility.sql`: garantiza que sigan ausentes las antiguas RPC de reasignación de menores; conserva el modelo previo de responsable inmutable.
   Son cambios incrementales; no reescriben fechas de nacimiento ni recrean visitas. La ruta Cima conserva su identificador y slug históricos.

3. **Mayoría de edad.** Regla inclusiva `edad >= 18`, por fecha calendario de Guatemala, centralizada en `shared/account-policy.ts` y `public.is_adult`. El registro exige fecha de nacimiento, el selector limita la fecha máxima y el trigger de Auth rechaza altas de menores o sin fecha válida. Perfil, elegibilidad para ascensos y registro de menores tienen comprobación segura en DB. El mensaje dice “18 años o más” para incluir correctamente el cumpleaños número 18.

4. **Cuentas antiguas menores.** Se conservan cuenta y fecha original. Crear/unirse a ascensos queda bloqueado; pueden corregir una fecha errónea mediante el perfil. No se sugiere alterar una fecha verdadera. Las cuentas administrativas se identifican por rol y no pasan por el formulario turístico.

5. **Contraseña.** Una política compartida para PWA y Admin: ocho caracteres como mínimo, una letra y un número; mayúsculas y símbolos opcionales. Validación visible en tiempo real y Mostrar/Ocultar. `volcan25`, `Maria2026` y `Xela1234` son válidas; `12345678` y `abcdefgh` no. Supabase Auth local usa `minimum_password_length = 8` y `password_requirements = "letters_digits"`. No se agregó una lista casera de contraseñas comunes. La configuración equivalente de Auth en Cloud es un paso manual; véase la [documentación oficial de seguridad de contraseñas](https://supabase.com/docs/guides/auth/password-security).

6. **Cambio y recuperación PWA.** El menú incluye Cambiar contraseña con nueva contraseña y confirmación. Se reutiliza la pantalla de recuperación y los métodos seguros `updateUser` y `resetPasswordForEmail`. La misma política se aplica antes de enviar al servidor. No se almacenan contraseñas manualmente.

7. **Mínimo de cuatro horas.** El selector de retorno limita opciones anteriores a inicio + 4 h, o inicio planificado + 4 h, con explicación ES/EN. El trigger de DB valida el mínimo real al guardar. Los horarios se interpretan en Guatemala. Ejemplo probado: 08:00 exige al menos 12:00.

8. **Retorno anticipado.** Antes del retorno estimado o del mínimo de cuatro horas, la PWA ofrece Registrar retorno anticipado. La confirmación de llegada física es atómica y guarda hora real y motivo. Incluye enfermedad, lesión/esguince, clima, decisión personal y otro; Otro exige descripción. Se conserva el motivo de emergencia previo. Los menores regresan con su responsable y el grupo se cierra al regresar la última persona. El flujo existente para indicar que alguien comienza a regresar permanece disponible. Se mantiene la operación administrativa de retorno y su auditoría.

9. **Arquitectura de rutas.** Se extiende `routes` y se usa la relación existente `visits.route_id`. Slugs: `ascenso-a-la-cima` y `mirador-picacho`. Los campos nuevos describen origen GPX, prefijo de recursos, distancia total, tipo de recorrido y metadata. El alta con ruta usa una sobrecarga de la RPC atómica existente; la firma anterior permanece por compatibilidad.

10. **GPX Cima.** Fuente real: `public/data/volcan-santa-maria.gpx`, sin mover a `/routes`. `scripts/process-gpx.mjs` valida coordenadas y tiempos, respeta segmentos, suma distancias Haversine y genera GeoJSON/JSON deterministas con SHA-256. Usa el recorrido completo de subida y bajada. La cima se identifica como el punto de mayor elevación registrado, no mediante una coordenada inventada.

11. **Metadata Cima.** 1,935 puntos, un segmento, **10.481064 km**, **502 minutos de referencia (8 h 22 min)**. Inicio `[longitud, latitud]`: `[-91.548599, 14.787427]`; cima: `[-91.551731, 14.75719]`; final: `[-91.548605, 14.787453]`. Registro UTC: `2026-02-03T08:27:27Z` a `2026-02-03T16:49:44Z`. Elevación máxima del archivo: 3700.947 m; no se presenta como altitud oficial. No se muestra desnivel positivo. El tiempo del archivo es una referencia, no modifica horarios del visitante.

12. **GPX Picacho.** Fuente real: `public/data/mirador-picacho.gpx`. Se procesa con el mismo script. El destino es el extremo del GPX de ida. Inicio: `[-91.548608, 14.787156]`; destino: `[-91.560011, 14.75507]`. 858 puntos y un segmento. Registro UTC: `2026-04-11T21:40:30Z` a `2026-04-11T23:44:48Z`.

13. **Distancias Picacho.** **4.753648 km hasta el mirador**, **9.507296 km de recorrido total aproximado**, calculado como ida × 2. Tiempo de ida registrado: **124 minutos (2 h 04 min)**. Se distingue ida de total y se indica en ES/EN que el retorno se realiza por la misma ruta. No se duplica artificialmente el trazado del mapa.

14. **Selector.** Dos tarjetas con radio buttons y ninguna seleccionada inicialmente. La elegida se resalta, la otra se atenúa y sigue disponible. Se requiere una selección para crear. Cada tarjeta muestra nombre, distancia y referencia de tiempo; Picacho distingue ida y total.

15. **Cambio de ruta.** El organizador puede abrir ambas tarjetas después de crear y durante el ascenso, con la ruta actual seleccionada. Hay confirmación separada antes de guardar. `change_visit_route` bloquea la visita durante la operación, valida permisos y modifica exclusivamente la relación de ruta. Conserva participantes, menores, organizador, estados, fechas y datos registrados.

16. **Auditoría.** El cambio registra actor, fecha/hora, identificadores y nombres de las rutas anterior/nueva en la auditoría existente. Se muestra la acción en español en Admin. Se conserva el historial anterior.

17. **Mapa y clima.** El mapa carga únicamente el GeoJSON de la ruta seleccionada y actualiza destino y métricas. Se conservan MapLibre, MapTiler, Satélite/Mapa, Mi ubicación y círculo de precisión. El clima se consulta y cachea por coordenadas de destino, usando los mismos horarios de la visita tras un cambio de ruta.

18. **Admin.** Ascensos muestra ruta y mantiene un grupo como unidad principal con integrantes desplegados. Desde el detalle, quien tenga permisos puede cambiar ruta con confirmación usando la misma RPC de la PWA. Todo el panel continúa en español.

19. **Historial y reportes.** La ruta aparece en el historial del visitante y en el detalle exportado. Los reportes incorporan desglose por ruta sin sustituir sus datos anteriores. Se verificaron consultas y permisos con las suites existentes.

20. **GPS.** `watchPosition` solicita alta precisión, `maximumAge: 1000` y `timeout: 20000`. Se muestra `coords.accuracy` real, incluso cuando es mala. El filtro valida coordenadas y descarta saltos incompatibles con tiempo/distancia/incertidumbre sin exigir que cada actualización mejore la precisión. Se limpia el watch al desmontar. No se promete precisión fija de cinco metros.

21. **Privacidad GPS e interfaz.** Solo se mantiene la posición actual y la última muestra necesaria para comparar; no hay historial persistido ni envío de coordenadas GPS a la base de datos. El texto ES/EN explica uso local y no menciona Supabase. Se retiró el aviso grande de Crear Ascenso, conservando seguridad en términos/recomendaciones y advertencias de Santiaguito. Privacidad/Términos están en el footer; el correo se conserva en menú/perfil y se quitó del saludo principal.

22. **Sin mapa offline.** No se implementaron PMTiles, descarga de mapas, caché de tiles ni botones de descarga. Se mantienen las capacidades PWA anteriores; la caché de recursos de ruta incorpora el GeoJSON/metadata de Picacho, sin almacenar mapas base.

23. **Donaciones.** La pestaña y su contenido quedaron fuera de la interfaz. No se expone PayPal, URL inventada ni un aviso de función futura. Pueden permanecer tipos o traducciones internas sin uso.

24. **Gestores.** Alta mediante backend seguro con nombre real, correo, teléfono y permisos. No exige cuenta turística, documento, nacionalidad, emergencia o fecha de nacimiento. El backend rechaza reutilizar una identidad existente. Invitación pendiente: reenviar al correo original o eliminar invitación. Eliminar revoca y oculta la invitación, conserva la identidad Auth y el historial. Activos: desactivar/reactivar, sin borrar usuario. La activación requiere correo confirmado y contraseña establecida. La exención de datos turísticos se basa en `invited_at` de Auth, no en metadata editable por el cliente.

25. **Contraseñas Admin/Gestor.** Una invitación pendiente muestra Establezca su contraseña antes de activar acceso. Admin y gestores tienen Cambiar contraseña y Olvidé mi contraseña. La recuperación usa `?auth=recovery`, Auth y la misma política compartida. El administrador no define ni conoce la contraseña del gestor.

26. **Tests DB y adicionales.** Supabase local: **20 archivos, 423 pruebas, PASS**, incluidas las suites previas y 44 aserciones nuevas. Los fixtures se adaptaron a mayoría de edad y mínimo de retorno dentro de transacciones revertidas. `npm run test:policy`: **5/5**, edad, contraseña, retorno y GPS mock. `npm run test:staff`: **5/5**, Edge Function con Supabase simulado, autorización, pendiente, reenvío y cancelación sin borrar usuarios. `npm run test:gpx`: **PASS**, ambos artefactos reproducibles. `test:auth:local`: **5/5 solicitudes contra Auth local**; las contraseñas débiles se rechazan y las válidas alcanzan deliberadamente el bloqueo de edad, revirtiendo el alta sin persistir cuentas ni enviar correos. Esta comprobación no sustituye una prueba interactiva de cada flujo de cambio/reset.

27. **Lint PWA.** `npm run lint`: PASS, sin errores ni advertencias ESLint.

28. **Build PWA.** `npm run build`: PASS. Vite advierte sobre chunks mayores de 500 kB; no bloquea la compilación.

29. **Lint Admin.** `cd admin-web; npm run lint`: PASS, sin errores ni advertencias ESLint.

30. **Build Admin.** `cd admin-web; npm run build`: PASS. Vite advierte sobre chunks mayores de 500 kB; no bloquea la compilación.

31. **Pasos manuales y límites antes de producción.**
   - Revisar y aplicar las cuatro migraciones incrementales en el entorno destino mediante el procedimiento de despliegue del proyecto. Esta sesión solo las aplicó en local.
   - Desplegar `invite-staff` y configurar sus variables sensibles en el backend, especialmente `STAFF_INVITE_REDIRECT_URL`, sin poner service role en frontend.
   - Configurar en Auth de producción el mínimo de ocho caracteres y letras+números; el cambio de `supabase/config.toml` se verificó únicamente en local.
   - Verificar SMTP y las URL permitidas de confirmación, invitación y recuperación de PWA/Admin. Probar recepción/apertura de correo y contraseña elegida por el gestor. No se enviaron correos reales en las pruebas automatizadas.
   - Ejecutar QA visual móvil/escritorio ES/EN: selección y cambio de tarjetas, mapa de cada ruta, footer, flujos de contraseña y Admin. No había navegador conectado disponible, por lo que no se afirma validación visual ni E2E interactiva.
   - Probar GPS y permisos en un dispositivo físico. Los tests de GPS son mocks y no garantizan precisión física.
   - Una invitación cancelada conserva su identidad Auth por la restricción de no borrar usuarios; el alta rechaza reutilizar ese correo. No se implementó un flujo de restauración de invitaciones canceladas.
   - Considerar división de bundles si el rendimiento de carga lo requiere; las advertencias de tamaño siguen presentes.

## Reproducción de pruebas

Desde la raíz: `npm run test:policy`, `npm run test:staff`, `npm run test:gpx`, `npx supabase test db --local`, `npm run lint`, `npm run build`. En `admin-web`: `npm run lint`, `npm run build`.

Para `npm run test:auth:local`, pasar `SUPABASE_TEST_URL` y `SUPABASE_TEST_ANON_KEY` del Supabase local mediante variables del proceso, sin editar `.env.local` ni imprimir claves. El script rechaza hosts que no sean loopback. Supabase local debe estar ejecutando la configuración actual de Auth; se reinició conservando volúmenes durante esta sesión.

## Inventario de archivos

El siguiente inventario incluye código, configuración, migraciones, recursos generados y tests cambiados o agregados en esta fase. Los GPX originales se enumeran separadamente porque ya estaban suministrados y no se editaron.

- `admin-web/src/App.tsx`
- `admin-web/src/components/AccountPassword.tsx`
- `admin-web/src/components/AdminShell.tsx`
- `admin-web/src/components/AdministrativeModals.tsx`
- `admin-web/src/components/ChangeRouteControl.tsx`
- `admin-web/src/lib/admin-labels.ts`
- `admin-web/src/lib/report-pdf.ts`
- `admin-web/src/pages/AscentsPage.tsx`
- `admin-web/src/pages/AuditPage.tsx`
- `admin-web/src/pages/ReportsPage.tsx`
- `admin-web/src/pages/StaffPage.tsx`
- `admin-web/src/pages/VisitorsPage.tsx`
- `admin-web/src/services/admin-service.ts`
- `admin-web/src/styles.css`
- `admin-web/src/types.ts`
- `docs/FINAL_CORRECTIONS.md`
- `package.json`
- `public/data/mirador-picacho-route-metadata.json`
- `public/data/mirador-picacho-route.geojson`
- `public/data/santa-maria-route-metadata.json`
- `public/data/santa-maria-route.geojson`
- `public/sw.js`
- `scripts/account-policy.test.mjs`
- `scripts/auth-policy.local.test.mjs`
- `scripts/process-gpx.mjs`
- `scripts/staff-invitation.test.mjs`
- `shared/account-policy.ts`
- `shared/gps-policy.ts`
- `src/App.css`
- `src/App.tsx`
- `src/components/PasswordInput.tsx`
- `src/components/PasswordRules.tsx`
- `src/components/ReturnTimePicker.tsx`
- `src/components/UserMenu.tsx`
- `src/features/auth/AuthProvider.tsx`
- `src/features/auth/auth-context.ts`
- `src/features/auth/auth-errors.ts`
- `src/features/auth/registration-validation.ts`
- `src/features/profile/ProfileGate.tsx`
- `src/features/routes/ChangeRouteDialog.tsx`
- `src/features/routes/RouteInfoScreen.tsx`
- `src/features/routes/RouteSelector.tsx`
- `src/features/routes/components/RouteMap.tsx`
- `src/features/routes/components/RouteRecommendations.tsx`
- `src/features/routes/route-service.ts`
- `src/features/routes/route-types.ts`
- `src/features/visits/CreateVisitForm.tsx`
- `src/features/visits/EarlyReturnForm.tsx`
- `src/features/visits/GroupVisitScreen.tsx`
- `src/features/visits/GroupVisits.tsx`
- `src/features/visits/visit-errors.ts`
- `src/features/visits/visit-service.ts`
- `src/features/visits/visit-types.ts`
- `src/features/weather/HikeForecastCard.tsx`
- `src/features/weather/RouteHikeForecast.tsx`
- `src/features/weather/WeatherPanel.tsx`
- `src/features/weather/weather-service.ts`
- `src/final-translations.ts`
- `src/i18n.ts`
- `src/pages/AuthenticatedPage.tsx`
- `src/pages/LoginPage.tsx`
- `src/pages/PasswordRecoveryPage.tsx`
- `src/pages/ProfileFormPage.tsx`
- `src/pages/RegisterPage.tsx`
- `supabase/config.toml`
- `supabase/functions/invite-staff/index.ts`
- `supabase/migrations/20261022120000_final_account_routes_return_rules.sql`
- `supabase/migrations/20261022121000_staff_invitation_lifecycle.sql`
- `supabase/migrations/20261022122000_route_history_and_return_compatibility.sql`
- `supabase/migrations/20261022123000_preserve_minor_responsibility.sql`
- `supabase/tests/database/admin_visitor_management_test.sql`
- `supabase/tests/database/administrative_visit_operations_test.sql`
- `supabase/tests/database/auth_rls_test.sql`
- `supabase/tests/database/avatar_and_start_mode_test.sql`
- `supabase/tests/database/final_account_routes_return_test.sql`
- `supabase/tests/database/group_visit_details_rpc_test.sql`
- `supabase/tests/database/group_visits_rls_test.sql`
- `supabase/tests/database/master_group_individual_return_test.sql`
- `supabase/tests/database/master_minors_regression_test.sql`
- `supabase/tests/database/master_privacy_gallery_security_test.sql`
- `supabase/tests/database/member_return_and_history_test.sql`
- `supabase/tests/database/phase3_visitors_returns_reports_test.sql`
- `supabase/tests/database/phase4_operations_minors_notifications_test.sql`
- `supabase/tests/database/planned_start_and_recommendations_test.sql`
- `supabase/tests/database/profile_update_privileges_test.sql`
- `supabase/tests/database/routes_and_checkpoints_test.sql`
- `supabase/tests/database/verified_email_visits_test.sql`
- `supabase/tests/database/visit_history_members_rpc_test.sql`
- `supabase/tests/database/visit_type_and_return_test.sql`
- `tsconfig.app.json`

GPX suministrados, conservados sin editar:

- `public/data/mirador-picacho.gpx`
- `public/data/volcan-santa-maria.gpx`
