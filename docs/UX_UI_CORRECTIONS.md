# Informe de correcciones UX/UI, contraseñas, retornos y rutas

Fecha: 22 de octubre de 2026. Este informe actualiza las reglas de contraseña, finalización y visualización de rutas del informe histórico `FINAL_CORRECTIONS.md`.

## Estado encontrado al retomar

Se inspeccionaron `git status`, `git diff`, los componentes existentes, servicios, migraciones y pruebas. Se conservó todo el worktree, incluyendo cambios de la fase anterior y ambos GPX suministrados.

Ya estaban implementados al recibir la instrucción de continuar: ojo de contraseña, recuperación secundaria, menú de cuenta, formulario con Nombre/Apellido/+502, validación compartida con mayúscula, orden inicial del registro, una acción de retorno anticipado, finalización visible con temporizador y primera implementación de ambas capas del mapa. La integración de cambio de ruta con visitas, historial, auditoría y Admin venía de la fase anterior y se conservó.

Quedaban pendientes la compilación del mapa, pruebas adaptadas, aplicación local de la nueva regla de cuatro horas, revisión responsive y encuadre, y el informe. Se completaron esos puntos. La revisión visual también permitió corregir el marcador inicial, el espacio del formulario estrecho y la superposición de controles del mapa.

## Resultado de los 25 puntos del informe solicitado

1. **Archivos modificados.** Inventario de esta fase al final. No se sustituyeron módulos completos ni se agregaron dependencias de producción. Playwright se ejecutó desde la caché temporal de npm, sin cambiar los lockfiles.

2. **Login Admin.** Mantiene Iniciar sesión como acción principal; el campo y sus acciones secundarias tienen menos peso visual. Se comprobó ausencia de desbordamiento en anchos de 375, 768 y 1280 px.

3. **Mostrar/Ocultar.** `PasswordField` presenta un ojo de 44 px dentro del extremo derecho del input. La contraseña está oculta inicialmente; cambia a visible y vuelve a ocultarse. El icono cerrado/abierto y `aria-label` se actualizan; el control es accesible por teclado, tiene `aria-pressed` y no envía el formulario. Se reutiliza también en la pantalla administrativa de nueva contraseña.

4. **Recuperación Admin.** “¿Olvidó su contraseña?” es una acción de texto subrayado debajo del botón principal. Sigue abriendo el formulario existente y usando `resetPasswordForEmail`; el envío se verificó con la red simulada, sin enviar correos reales.

5. **Cambiar contraseña.** Ya no hay un botón permanente separado en el sidebar. El usuario abre su menú inferior, que muestra Mi cuenta, identidad/correo, Cambiar contraseña y Cerrar sesión. Se cierra al pulsar fuera o Escape; reutiliza la pantalla existente. En pantallas estrechas sigue accesible desde el avatar.

6. **Gestores.** Nombre y Apellido son independientes y se conservan completos, incluidos nombres/apellidos compuestos. Correo, teléfono y permisos iniciales usan los estilos del panel, con distribución adaptable y protección contra doble envío. El prefijo fijo `GT +502` se presenta separado; se ingresan ocho dígitos y se envía E.164. La validación razonable de número nacional se aplica en formulario y Edge Function. No se agregaron datos turísticos. Se mantienen invitación, reenvío, cancelación y permisos existentes.

7. **Política de contraseña.** `shared/account-policy.ts` exige al menos ocho caracteres, una mayúscula A–Z y un número, sin exigir minúscula ni símbolo. Se aplica a registro, cambio/reset de turista y contraseña de invitación/cambio/reset de gestor o administrador. `12345678`, `abcdefgh` y `volcan25` se rechazan; `Volcan25`, `Maria2026`, `Xela1234` y `VOLCAN25` pasan. Los mensajes ES/EN indican mayúscula. **Límite pendiente:** esta regla exacta se aplica en las aplicaciones; el servidor Auth local conserva el preset `letters_digits`, que no exige mayúscula. El preset `lower_upper_letters_digits` agregaría una exigencia de minúscula que el requerimiento no pide. No se presenta como validación completa del servidor. Supabase documenta sus [opciones de seguridad de contraseña](https://supabase.com/docs/guides/auth/password-security); Auth autohospedado admite conjuntos personalizados mediante `GOTRUE_PASSWORD_REQUIRED_CHARACTERS`, según su [configuración oficial](https://github.com/supabase/auth/blob/master/README.md). No se modificó Cloud ni se creó una API paralela de contraseñas.

8. **Registro PWA.** Inicia con Nombre, Apellido, Fecha de nacimiento. El orden de validación sigue el mismo orden visual. Se conserva el registro de cuenta y la posterior finalización de perfil; no se fusionaron ambos módulos. En el formulario de perfil, la fecha precede a nacionalidad/departamento/sexo. La edad mínima inclusiva de 18 años y las validaciones seguras existentes siguen vigentes; las regresiones de edad pasan en DB.

9. **Retorno anticipado.** Hay una sola acción propia “Registrar retorno anticipado” dentro de Opciones del ascenso. La acción de Finalizar ya no se convierte en un segundo retorno anticipado. El formulario conserva enfermedad, lesión/esguince, clima, decisión personal, otro y la emergencia anterior. Otro requiere descripción. La llegada física utiliza la RPC atómica existente, guarda hora real y motivo, y los menores siguen a su responsable. Las acciones del organizador para otras personas se mantienen identificadas por nombre.

10. **Finalizar ascenso.** Para el participante activo en un ascenso en curso permanece visible y deshabilitado antes del mínimo. Debajo aparece la hora de habilitación y la indicación de usar retorno anticipado si necesita regresar antes. Un participante que ya está en retorno anticipado mantiene su acción específica para confirmar llegada.

11. **Hora de habilitación.** Se calcula exactamente como `started_at + 4 horas`, en formato ES/EN y zona `America/Guatemala`. Un `setTimeout` habilita el botón al alcanzar el umbral; se limpia al cambiar la fecha o desmontar. Se conserva el reloj local de 15 segundos que ya usaba la pantalla, sin introducir polling de red. La migración nueva `20261022124000_normal_return_four_hours.sql` modifica únicamente el trigger existente: el servidor permite finalizar a las cuatro horas aunque la estimación sea posterior. La estimación y las demás fechas se conservan. El mínimo de retorno estimado al crear sigue siendo cuatro horas.

12. **Ambas rutas.** MapLibre carga el contenido de rutas mediante el servicio existente y añade una fuente por trazado. Ambas permanecen visibles simultáneamente. Si falla la alternativa se informa y se permite reintentar, conservando la activa. Se ajusta el encuadre a los límites de ambos GPX, con espacio para controles y un límite de zoom.

13. **Activa y alternativa.** La elegida se dibuja verde/menta, con mayor anchura y contraste, encima de la alternativa gris. Cambiar la selección intercambia el énfasis sin eliminar ninguno de los trazados. El gris no representa una ruta deshabilitada; se conserva Cambiar ruta para elegirla. No se agregó una interacción ambigua al pulsar las líneas.

14. **Etiqueta.** El badge compacto muestra “Ruta Cima” o “Ruta Mirador Picacho” y sus equivalentes en inglés. Usa las variables de superficie/texto del tema y se coloca debajo del selector Mapa/Satélite, sin superponerlo.

15. **Leyenda.** Una leyenda pequeña muestra ambos nombres, con punto verde para la activa y gris para la alternativa. Se adapta al ancho disponible. Las capas se restauran al cambiar Mapa/Satélite. Un `ResizeObserver` reajusta el canvas cuando cambia su tamaño; se desconecta al desmontar. Mi ubicación conserva su centrado GPS.

16. **GPX Cima.** Se mantiene `public/data/volcan-santa-maria.gpx`, recorrido completo de subida y bajada, 1,935 puntos y 10.481064 km. Los recursos generados conservan el hash y metadata de la fase anterior; `test:gpx` confirma reproducibilidad. No se volvió al GPX antiguo ni se muestra desnivel positivo.

17. **Picacho.** Se mantiene el GPX real de ida de 858 puntos, 4.753648 km hasta el mirador y 9.507296 km de recorrido total aproximado, calculado como ida × 2. No se agregó una línea ficticia de retorno. Se conserva la explicación de regreso por el mismo trayecto en ES/EN.

18. **Cambio de ruta.** Se conserva el selector sin selección inicial al crear, la alternativa disponible y una sola elección. El diálogo existente confirma el cambio posterior, incluso durante el recorrido. La RPC conserva grupo, organizador, integrantes, menores, estado, horarios e historial; registra ruta anterior/nueva, actor y fecha. No se reimplementó esta lógica.

19. **Admin e historial.** Se conservan la ruta en Ascensos/detalle/historial/reportes y el cambio administrativo con la misma RPC de PWA. Las pruebas DB existentes de conservación y auditoría continúan pasando. El clima mantiene los horarios de la visita y utiliza el destino seleccionado.

20. **Lint PWA.** `npm run lint`: PASS, sin errores ni advertencias ESLint.

21. **Build PWA.** `npm run build`: PASS. Persiste la advertencia de Vite por chunks mayores de 500 kB.

22. **Lint Admin.** `cd admin-web; npm run lint`: PASS, sin errores ni advertencias ESLint.

23. **Build Admin.** `cd admin-web; npm run build`: PASS. Persiste la advertencia de Vite por chunks mayores de 500 kB.

24. **Tests relevantes.**
    - DB local: **21 archivos, 430 pruebas, PASS**, incluidas siete nuevas de límite de cuatro horas, estimación posterior conservada y menores.
    - `test:policy`: **5/5**, edad, nueva contraseña, umbral de retorno y GPS.
    - `test:staff`: **6/6**, autorización, nombres compuestos, teléfono, invitación pendiente, reenvío y cancelación; backend simulado, sin correo real.
    - `test:map`: **3/3**, coordenadas reales/encuadre, cambio de colores, conservación/restauración de capas y ausencia de duplicación.
    - `test:gpx`: **PASS** para ambos GPX y artefactos generados.
    - `test:auth:local`: **cinco solicitudes correctas** para comprobar la política base de Auth (longitud/letra/número) y llegada de contraseñas válidas al bloqueo de edad que revierte el alta. El rechazo de `volcan25` se verifica en la política de aplicación; no se afirma que el preset Auth lo rechace.
    - `test:ui`: **6 grupos de comprobaciones PASS** con Edge headless y Playwright: login/recuperación, gestor responsive y menú, retorno/temporizador, selector, registro y mapa. Se comprobaron 375/768/1280 px en Admin y 390 px en mapa, tema oscuro ES y claro EN. Se inspeccionaron capturas. Las llamadas de Auth, invitación y datos, y el estilo de mapa base, se simulan; las líneas se renderizan con MapLibre real y los GPX reales. Esto no es una prueba E2E contra cuentas o correo reales.

25. **Problemas encontrados y pendientes.** Se corrigieron un tipo incompatible de propiedades de pintura, el encuadre inicial cuando el estilo aún cargaba fuentes, controles superpuestos, el marcador inicial sin dimensiones/contraste y el exceso de padding del formulario estrecho. Una prueba anterior calculaba su baseline global solo con adultos: ahora incluye menores locales existentes, sin modificar esos registros. **Pendiente funcional:** reforzar la mayúscula en el servidor Auth con una configuración compatible con la política exacta; las aplicaciones ya la exigen. **Pendiente de despliegue:** aplicar la nueva migración incremental y desplegar conjuntamente Admin/Edge Function actualizados; verificar SMTP, invitación y recuperación reales, proveedor de mapa real y GPS físico. No se modificó Cloud. Las advertencias de tamaño de bundles siguen presentes.

## Reproducción y evidencia

Desde la raíz: `npm run test:policy`, `npm run test:staff`, `npm run test:map`, `npm run test:gpx`, `npx supabase test db --local`, `npm run lint`, `npm run build`. En `admin-web`: `npm run lint`, `npm run build`.

Para UI, iniciar los servidores Vite en loopback: raíz `npm run dev -- --port 5173` y Admin `npm run dev -- --port 5174`. Ejecutar `npm run test:ui` con Playwright disponible, o pasar `PLAYWRIGHT_MODULE_PATH` al `index.mjs` de su instalación temporal. La prueba usa Edge headless, genera fixtures en dos directorios `.ux-check.local` fijos y los retira al terminar. Las capturas están en `.ux-artifacts.local/` (ignorado por Git). La prueba intercepta las mutaciones; no crea gestores, usuarios ni correos reales.

Para Auth local se requieren `SUPABASE_TEST_URL` y `SUPABASE_TEST_ANON_KEY` como variables del proceso. El script solo admite loopback. No se editaron `.env.local` ni se imprimieron claves.

No se ejecutaron commits, pushes, `db reset` ni `db push`. No se borraron usuarios ni datos. No se implementaron PMTiles, descarga de mapas ni tiles offline. La lógica GPS sigue siendo local, sin historial persistido ni envío a Supabase. Se preservaron las capacidades PWA existentes.

## Archivos de esta fase

El inventario siguiente compara con el estado previo a esta corrección UX/UI, no con HEAD: los cambios de la fase anterior permanecen en el worktree.

- `admin-web/src/App.tsx`
- `admin-web/src/components/AccountPassword.tsx`
- `admin-web/src/components/AdminShell.tsx`
- `admin-web/src/components/PasswordField.tsx`
- `admin-web/src/pages/StaffPage.tsx`
- `admin-web/src/services/admin-service.ts`
- `admin-web/src/styles.css`
- `docs/FINAL_CORRECTIONS.md`
- `docs/UX_UI_CORRECTIONS.md`
- `package.json`
- `scripts/account-policy.test.mjs`
- `scripts/auth-policy.local.test.mjs`
- `scripts/route-map.test.mjs`
- `scripts/staff-invitation.test.mjs`
- `scripts/ux-ui.test.mjs`
- `shared/account-policy.ts`
- `src/App.css`
- `src/features/auth/registration-validation.ts`
- `src/features/routes/components/RouteMap.tsx`
- `src/features/routes/components/route-map-layers.ts`
- `src/features/visits/GroupVisitScreen.tsx`
- `src/final-translations.ts`
- `src/pages/ProfileFormPage.tsx`
- `src/pages/RegisterPage.tsx`
- `supabase/config.toml`
- `supabase/functions/invite-staff/index.ts`
- `supabase/migrations/20261022124000_normal_return_four_hours.sql`
- `supabase/tests/database/admin_visitor_management_test.sql`
- `supabase/tests/database/normal_return_four_hours_test.sql`
