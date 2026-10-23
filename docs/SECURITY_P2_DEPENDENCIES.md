# SEC-008 — Seguridad de dependencias

Fecha de validación:2026-10-23
Rama: `fix/security-p2-deps`

## Resultado

SEC-008 quedó corregido mediante actualizaciones de parche compatibles. Los audits finales de la PWA y del Admin reportan **0 vulnerabilidades**, tanto con todas las dependencias como con `--omit=dev`. No se actualizaron dependencias mayores, Supabase Cloud ni componentes de base de datos. `@supabase/supabase-js` permanece exactamente en **2.118.0** en ambos proyectos.

## Estado inicial y exposición

El audit inicial de la PWA reportó **3 hallazgos agregados de severidad alta**, todos en el árbol de desarrollo:

- `vite@8.3.0`: avisos del servidor de desarrollo, incluidos problemas de `launch-editor` en Windows y controles de acceso del servidor. No forma parte del bundle de producción, pero sí representa exposición al abrir contenido no confiable durante desarrollo. El rango corregido comienza en 8.3.3.
- `source-map-js@1.2.1`: denegación de servicio al procesar mapas de fuentes indexados manipulados (`GHSA-68fv-2mgg-jv7q`). La ruta era Vite → PostCSS → `source-map-js`; afecta compilación/desarrollo, no la ejecución normal de la PWA en el navegador.
- `brace-expansion@5.0.9`: denegación de servicio por expansión cuadrática o recursión (`GHSA-q2hr-2g5m-vwhr`, `GHSA-qhr7-859c-m2p7` y `GHSA-6j4f-fj2g-mc7p`). La ruta era ESLint → minimatch → `brace-expansion`; no existía una ruta productiva demostrada, aunque un patrón hostil podía agotar el proceso de desarrollo o CI.

El audit inicial del Admin reportó **3 hallazgos agregados: 2 altos y 1 crítico**. Incluía Vite y `source-map-js` por las mismas rutas de desarrollo, además de `dompurify@3.4.16` por la dependencia opcional de producción de `jspdf@4.2.1`:

- La versión instalada de DOMPurify sí estaba afectada por `GHSA-mrv2-3pqr-j5jr`. npm agrupaba además otros avisos bajo el paquete y elevaba el resultado agregado a crítico, aunque sus rangos concretos no incluían 3.4.16.
- El generador actual usa texto, formas y `jspdf-autotable`; no llama `jsPDF.html()` ni procesa HTML proporcionado por visitantes. No se demostró una ruta explotable en los reportes actuales. Se actualizó de todos modos porque DOMPurify forma parte del árbol productivo del Admin.

## Actualizaciones aplicadas

- PWA y Admin: `vite` **8.3.0 → 8.3.5**. Es una actualización de parche dentro de Vite 8 y conserva el requisito de Node existente.
- PWA y Admin, transitiva de Vite/PostCSS: `source-map-js` **1.2.1 → 1.2.2**.
- PWA, transitiva de ESLint/minimatch: `brace-expansion` **5.0.9 → 5.0.12**. El Admin ya tenía 5.0.12.
- Admin, transitiva opcional de jsPDF: `dompurify` **3.4.16 → 3.4.17**.
- `jspdf` permanece en **4.2.1**, la versión directa instalada y vigente; no fue necesario cambiar su API.
- Los cambios adicionales de `postcss`, `rolldown`, sus bindings, `@oxc-project/types` y `nanoid` en los lockfiles son el árbol declarado por `vite@8.3.5`, no actualizaciones funcionales independientes.

No se ejecutó `npm audit fix` ni `npm audit fix --force`.

## Archivos modificados

- `package.json` y `package-lock.json`: Vite y resolución transitiva corregida para la PWA.
- `admin-web/package.json` y `admin-web/package-lock.json`: Vite, DOMPurify transitivo y comando `test:pdf`.
- `admin-web/scripts/report-pdf.test.mjs`: prueba reproducible del módulo real `report-pdf.ts`. Compila ese módulo en modo SSR, genera un reporte resumido y otro detallado de 80 filas, y valida firma, contenido no vacío y paginación.
- `docs/SECURITY_P2_DEPENDENCIES.md`: este informe.

No se modificaron migraciones, RLS, RPC, Edge Functions, dependencias de Supabase ni funcionalidad de las aplicaciones.

## Validación

- `npm audit`, PWA: **0 vulnerabilidades**.
- `npm audit --omit=dev`, PWA: **0 vulnerabilidades**.
- `npm audit`, Admin: **0 vulnerabilidades**.
- `npm audit --omit=dev`, Admin: **0 vulnerabilidades**.
- `npm ls @supabase/supabase-js --depth=0`: **2.118.0** en PWA y Admin.
- `npm run test:pdf`, Admin: **PASS**. Los reportes resumido y detallado se generaron con jsPDF/AutoTable; ambos produjeron firma `%PDF-`, contenido y el detallado produjo varias páginas.
- `npm run lint`, PWA y Admin: **PASS**.
- `npm run build`, PWA y Admin: **PASS** con Vite 8.3.5. Persisten avisos informativos de tamaño de chunks, sin fallo de compilación.
- pgTAP completo: **618/618 PASS en 28 archivos**.
- `npm run test:policy`: **5/5 PASS**.
- `npm run test:password`: **9/9 PASS**.
- `npm run test:staff`: **12/12 PASS**.
- `npm run test:push`: **63/63 PASS**.
- `npm run test:map`: **3/3 PASS**.
- `npm run test:gpx`: **PASS** para ambos artefactos de ruta.
- `npm run test:auth:local`: **7/7 PASS** contra Auth local.
- `npm run test:auth:security`: **PASS** para política de contraseña, cambio normal, recuperación, confirmación, invitación y cambio desde PWA/Admin; limpieza sintética correcta.
- `npm run test:staff:local`: **PASS** para autorización, invitación y reenvío mediante Mailpit, activación, permisos exactos, edad y metadata falsificada; limpieza sintética correcta.
- `git diff --check`: **PASS**.

Las pruebas HTTP usaron únicamente endpoints loopback y claves obtenidas en memoria de `supabase status`; los scripts de prueba no las imprimen ni las escriben en los archivos modificados.

## Riesgos residuales

- `npm audit` solo cubre avisos conocidos por el registro en el momento de la ejecución; debe repetirse cuando cambien los lockfiles.
- El flujo actual de PDF no usa HTML. Si en el futuro se incorpora `jsPDF.html()` o HTML externo, deberá añadirse una prueba específica de sanitización además de conservar DOMPurify actualizado.
- npm informó que el script `postinstall` de `core-js@3.50.0`, dependencia opcional existente de jsPDF, no está aprobado por la política local `allowScripts`. El script no se ejecutó y los reportes, lint y build funcionaron; no se cambió esa política porque queda fuera de SEC-008.
- Los avisos de chunks superiores a 500 kB son de rendimiento y ya existían como característica de los bundles; no constituyen un hallazgo de seguridad de este audit.

## Estado de Git y exclusiones

Estado esperado al cerrar la tarea:

```text
## fix/security-p2-deps
 M admin-web/package-lock.json
 M admin-web/package.json
 M package-lock.json
 M package.json
 M supabase/config.toml
?? admin-web/scripts/
?? docs/SECURITY_P2_DEPENDENCIES.md
?? supabase/config.toml.qa-backup
?? tmp/
```

Los archivos propios de SEC-008 que pueden incluirse en un futuro commit son los dos `package.json`, los dos lockfiles, `admin-web/scripts/report-pdf.test.mjs` y este informe.

Deben excluirse del commit:

- `supabase/config.toml`: su diff preexistente contiene exclusivamente los puertos locales temporales 54520/54521/54522/54523/54524/54527/54529. Su SHA-256 permaneció `60911267AD5134B4BD790529E3D8E0B5A95594E30545BC94DA2FE03130234161` durante esta tarea. Las políticas seguras de Auth ya están en la base versionada y no se tocaron.
- `supabase/config.toml.qa-backup`: respaldo local no versionado.
- `tmp/`: artefactos locales de auditorías anteriores.

No se realizó commit, push, `db reset`, `db push`, actualización de dependencias mayores ni acceso a Supabase Cloud.
