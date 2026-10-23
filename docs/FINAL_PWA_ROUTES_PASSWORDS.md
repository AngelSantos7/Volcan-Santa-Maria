**Correcciones finales de PWA, rutas y contraseñas — 22 de octubre de 2026**

Se continuó sobre el worktree existente, después de revisar `git status`, `git diff`, los componentes, servicios, tipos, RPC y migraciones. No se reemplazaron módulos terminados ni se revirtió trabajo previo.

Ya estaban realizados: login administrativo con ojo, recuperación como acción secundaria, cambio de contraseña en el menú, formulario de gestores con Nombre/Apellido y +502, política compartida de contraseña, orden del registro PWA, retorno anticipado sin duplicación, finalización habilitada a las cuatro horas, las dos rutas reales y su integración con administración. Esta fase amplía únicamente los puntos solicitados en el último requerimiento.

1. **Archivos modificados.** Se modificaron o añadieron 35 archivos de implementación/pruebas y dos documentos. El inventario de esta fase aparece al final; no representa todos los cambios anteriores del worktree.

2. **Menores por integrante.** Cualquier participante adulto activo, incluido quien se une al grupo, dispone de “Agregar menores a mi cargo” antes del inicio. El formulario reutiliza los campos de creación de visita mediante `MinorDraftEditor`. Nombre, edad de 0 a 17, sexo, parentesco y consentimiento llegan a la RPC existente `add_my_visit_minors`. La nueva RPC de retirada permite retirar únicamente menores propios antes del inicio.

3. **Relación adulto–menor.** `auth.uid()` determina el responsable y el creador en el servidor; no existe selector de otro adulto. Se conserva la protección previa contra reasignaciones. Los menores aparecen debajo de su responsable, con cantidad, nombre, edad y parentesco. Continúan heredando el retorno normal o anticipado de ese adulto mediante el modelo operativo existente.

4. **Bloqueo tras iniciar.** Interfaz y RPC requieren estado `forming` y `started_at IS NULL`. La RPC bloquea la visita durante la operación para coordinarse con el inicio del ascenso. El estado `in_progress` o cualquier `started_at` impiden altas y retiradas. Se muestra el mensaje solicitado en español o inglés. Ninguna operación de cambio de ruta elimina menores existentes.

5. **Mapa.** Mantiene ambos trazados simultáneos. La ruta activa es verde/menta, más gruesa y sólida; la otra es gris, más fina y discontinua. Se conserva la restauración de capas al cambiar el mapa base, sin duplicarlas. “Cambiar ruta” está disponible en la experiencia del mapa para el organizador autorizado; se conserva la pestaña elegida al actualizar la ruta.

6. **Nombres.** El indicador “Destino seleccionado”, el selector y la leyenda utilizan “Ruta Cima Volcán Santa María” y “Ruta Mirador Picacho”, con sus traducciones inglesas. El indicador queda encima del lienzo, sin cubrir sus controles. Las etiquetas no se truncan y conservan nombres accesibles completos.

7. **Destinos.** Se muestran los dos destinos a la vez: triángulo para “Cima del Volcán Santa María” y rombo para “Mirador Picacho”. Cada marcador tiene etiqueta visible, nombre accesible, detalle al pulsarlo y énfasis cuando corresponde a la ruta activa.

8. **Leyenda y accesibilidad.** Ambos nombres aparecen en la leyenda. Color, grosor, discontinuidad, forma del marcador y etiqueta distinguen rutas sin depender solamente de verde/gris. Se comprobaron ambas selecciones en 320, 360, 390, 430, 768 y 1280 px, sin desbordamiento ni recorte de los destinos al encuadrar.

9. **Sin conexión ficticia.** No se modificaron los GPX ni sus GeoJSON: Cima mantiene 1.935 puntos de subida y bajada; Picacho mantiene 858 puntos de ida. No se agregó ninguna línea entre destinos. Picacho conserva “El retorno se realiza por la misma ruta”.

10. **Cambio antes del inicio.** El organizador selecciona la otra ruta y confirma su nombre. La RPC conserva el grupo, integrantes, menores, horarios y estado; únicamente cambia `route_id`, además de la marca técnica de actualización y la auditoría. Los metadatos, mapa y trazado se cargan desde la ruta elegida.

11. **Cambio durante el ascenso.** Primero aparece la advertencia de que no existe un sendero directo y de que debe regresar al inicio. “Entendido” abre la confirmación; “Cambiar ruta” permanece deshabilitado hasta marcar la declaración explícita de regreso físico. Cancelar no modifica la ruta. Admin usa la misma RPC y exige la misma confirmación. La RPC rechaza la confirmación omitida, falsa o nula incluso si se omite la interfaz. El regreso se declara: no se introduce geofencing ni seguimiento.

12. **Auditoría.** Conserva los eventos anteriores y registra ruta anterior/nueva, actor, fecha, estado y descripción. Para el cambio durante ascenso incorpora `returned_to_start_confirmed` y `return_confirmation_at`. La migración incremental `20261022125000_member_minors_and_safe_route_changes.sql` fue aplicada solo mediante `supabase migration up --local`; reemplaza la firma anterior para impedir que un llamado de dos argumentos eluda la confirmación.

13. **Recomendaciones.** El botón antes llamado “Ver ruta” ahora dice “Recomendaciones” / “Recommendations”, conservando su destino. Recomendaciones, Mapa y Galería también están disponibles mientras se prepara el grupo.

14. **Contraseña PWA.** El cambio autenticado pide actual, nueva y confirmación. Obtiene la identidad con `getUser`, autentica de verdad mediante `signInWithPassword` con el correo de esa identidad, comprueba que el usuario verificado sea el mismo y solo entonces ejecuta `updateUser`. También envía `current_password` a Auth. Credenciales incorrectas producen “Contraseña actual incorrecta.”; fallos de red no se disfrazan como contraseña incorrecta. La nueva contraseña mantiene mínimo ocho caracteres, mayúscula y número, con reglas visibles y ojos. No se guardan valores en DB propia, almacenamiento, logs ni auditoría.

15. **Admin y gestores.** Comparten la misma función de cambio de contraseña propia. La reautenticación usa un cliente temporal en memoria, sin persistencia, refresco automático ni difusión a otras pestañas. Su sesión se cierra con alcance local y el cliente se libera; la sesión principal y el rol permanecen intactos. La invitación inicial y recuperación auténtica por correo conservan el formulario sin contraseña actual. Un parámetro `?auth=recovery` por sí solo ya no activa esa excepción en Admin: se requiere el evento `PASSWORD_RECOVERY` de Auth.

16. **Lint PWA.** `npm run lint`: PASS, sin errores ni advertencias de ESLint.

17. **Build PWA.** `npm run build`: PASS, TypeScript estricto y compilación Vite correctos. Permanece el aviso de tamaño de chunks superior a 500 kB.

18. **Lint Admin.** `npm run lint` desde `admin-web`: PASS, sin errores ni advertencias de ESLint.

19. **Build Admin.** `npm run build` desde `admin-web`: PASS. Permanece el aviso de tamaño de chunks superior a 500 kB.

20. **Pruebas.** Todas correctas:

- `npx supabase test db --local`: 22 archivos, 453 comprobaciones. Incluyen organizador con dos menores, integrante con uno, propiedad de cada menor, retirada propia antes del inicio, rechazo de retirada ajena, bloqueo de ambos después de iniciar, conservación de los tres menores, bloqueo independiente por `started_at`, cambios en ambos sentidos antes de iniciar y auditoría de cambios activos confirmados. Las pruebas SQL usan transacciones con rollback.
- `npm run test:password`: 9 pruebas de reautenticación, rechazo, identidad y aislamiento de sesión.
- `npm run test:map`: 3 pruebas, incluyendo estilos sólido/discontinuo y conservación de geometrías reales.
- `npm run test:policy`: 5 pruebas.
- `npm run test:staff`: 6 pruebas.
- `npm run test:gpx`: ambos originales y sus salidas coinciden; no se regeneraron ni cambiaron.
- `npm run test:auth:local`: 5 comprobaciones HTTP contra Auth local; las solicitudes válidas alcanzan una validación que revierte la transacción y no crean usuarios.
- `npm run test:ui`: 6 escenarios en Edge/Playwright, incluyendo ambas rutas en los seis anchos solicitados.
- `npm run test:ui:final`: 9 escenarios en Edge/Playwright. Cubren PWA/Admin/gestor con contraseña actual incorrecta, nueva inválida y cambio válido, ojos y preservación de almacenamiento de sesión; recuperación/invitación; parámetro de recuperación sin token frente a enlace verificado; menores por adulto; cambios desde el mapa en ambos sentidos antes/durante el ascenso; confirmación administrativa.
- `git diff --check`: sin errores de whitespace. Git conserva sus avisos previos de normalización LF/CRLF para las salidas GPX existentes.

21. **Límites y pendientes.** No quedan pendientes de implementación local en esta fase. No se ha desplegado ni migrado Cloud, conforme a la restricción. Los escenarios de cambio de contraseña en navegador usan componentes y SDK reales con HTTP interceptado: no se cambiaron contraseñas de cuentas reales ni se probó entrega de correos externos. El mapa visual usa MapLibre y GPX reales con un estilo base local de prueba; no valida disponibilidad de los proveedores externos de tiles. La regla de mayúscula está en la política compartida de la aplicación; el preset nativo de Auth local sigue validando longitud/letras/dígitos como se documentó en la fase anterior. Esta fase no modifica la configuración de Auth/Cloud ni afirma que ese preset imponga mayúsculas a clientes ajenos a la aplicación.

Se mantuvieron `.env.local`, `supabase/config.toml`, dependencias y lockfiles sin cambios en esta fase. No se ejecutaron `db reset`, `db push` ni commits. No se borraron usuarios ni datos existentes durante el trabajo. La migración no contiene borrados de datos de instalación; la retirada de un menor solo está disponible como acción explícita de su responsable antes del inicio. No se implementaron mapa offline, conexiones ficticias, GPS almacenado, rastreo en segundo plano, geofencing ni navegación paso a paso.

**Inventario de esta fase** (respecto al estado inicial revisado, conservando el resto del worktree):

- `admin-web/src/App.tsx`
- `admin-web/src/components/AccountPassword.tsx`
- `admin-web/src/components/AdministrativeModals.tsx`
- `admin-web/src/components/ChangeRouteControl.tsx`
- `admin-web/src/lib/supabase.ts`
- `docs/FINAL_CORRECTIONS.md`
- `docs/FINAL_PWA_ROUTES_PASSWORDS.md`
- `package.json`
- `scripts/final-flows-ui.test.mjs`
- `scripts/password-change.test.mjs`
- `scripts/route-map.test.mjs`
- `scripts/ux-ui.test.mjs`
- `shared/password-change.ts`
- `src/App.css`
- `src/features/auth/AuthProvider.tsx`
- `src/features/auth/auth-context.ts`
- `src/features/auth/auth-errors.ts`
- `src/features/routes/ChangeRouteDialog.tsx`
- `src/features/routes/RouteInfoScreen.tsx`
- `src/features/routes/RouteSelector.tsx`
- `src/features/routes/components/RouteMap.tsx`
- `src/features/routes/components/route-map-layers.ts`
- `src/features/visits/AddMyMinorsForm.tsx`
- `src/features/visits/CreateVisitForm.tsx`
- `src/features/visits/GroupVisitScreen.tsx`
- `src/features/visits/GroupVisits.tsx`
- `src/features/visits/MinorDraftEditor.tsx`
- `src/features/visits/minor-draft.ts`
- `src/features/visits/visit-errors.ts`
- `src/features/visits/visit-service.ts`
- `src/final-translations.ts`
- `src/i18n.ts`
- `src/lib/supabase.ts`
- `src/pages/PasswordRecoveryPage.tsx`
- `supabase/migrations/20261022125000_member_minors_and_safe_route_changes.sql`
- `supabase/tests/database/final_account_routes_return_test.sql`
- `supabase/tests/database/member_minors_safe_routes_test.sql`
