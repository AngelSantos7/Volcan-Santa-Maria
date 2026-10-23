# Corrección de SEC-001 y SEC-002

22 de octubre de 2026, America/Guatemala. Ambos exploits quedan bloqueados en Supabase local. La corrección está preparada en `fix/security-p0`, sin commit ni push. No se aplicó en Cloud.

1. **Estado Git inicial.** Rama `qa-auditoria`, HEAD `47b12d9` (`mejora de rutas, menores de edad`). Se ejecutaron `git branch --show-current`, `git status` y `git log -5 --oneline` antes de modificar. Los cinco commits eran `47b12d9`, `10acf21`, `ff61c34`, `5f4f20a` y `e82199b`. Había un cambio previo en `supabase/config.toml` y los archivos no rastreados `supabase/config.toml.qa-backup` y `tmp/`. Se creó `fix/security-p0` desde ese HEAD, conservando esos archivos.

2. **Archivos de esta corrección.** Una migración nueva, dos suites nuevas, cinco suites existentes adaptadas y este informe. No cambió código de PWA/Admin, dependencias, lockfiles, RLS ni migraciones históricas.

   - `supabase/migrations/20261022130000_fix_legacy_return_and_sensitive_access.sql`
   - `supabase/tests/database/security_p0_returns_test.sql`
   - `supabase/tests/database/security_p0_sensitive_access_test.sql`
   - `supabase/tests/database/admin_visitor_management_test.sql`
   - `supabase/tests/database/avatar_and_start_mode_test.sql`
   - `supabase/tests/database/group_visits_rls_test.sql`
   - `supabase/tests/database/member_return_and_history_test.sql`
   - `supabase/tests/database/visit_type_and_return_test.sql`
   - `docs/SECURITY_P0_CORRECTIONS.md`

   Evidencias de ejecución: `tmp/security-p0-20261022/`. Los cambios previos de configuración no pertenecen a esta corrección.

3. **Migración.** [20261022130000_fix_legacy_return_and_sensitive_access.sql](../supabase/migrations/20261022130000_fix_legacy_return_and_sensitive_access.sql), posterior a `20261022125000`. Aplicada mediante `npx --no-install supabase migration up --local` al contenedor local existente. Una segunda ejecución dentro de `BEGIN`/`ROLLBACK` comprobó su idempotencia. Conserva `SECURITY DEFINER` donde necesita leer perfiles protegidos y escribir auditoría, con `SET search_path = ''` y objetos calificados. No realiza cambios de datos ni backfills.

4. **Consumidores de `complete_group_visit`.** Se buscaron referencias en `src/`, `admin-web/`, `supabase/` y `scripts/`; no existe el directorio raíz `tests/`. No hay consumidor de aplicación ni función vigente que delegue en ella. Había siete llamadas de pruebas en cuatro archivos: `avatar_and_start_mode_test.sql`, `group_visits_rls_test.sql`, `member_return_and_history_test.sql` y `visit_type_and_return_test.sql`, además de sus definiciones históricas. La PWA llama a `complete_my_visit_participation` desde `src/features/visits/visit-service.ts`. Se adaptaron los escenarios positivos a retornos personales; se conservó el intento negativo por la RPC antigua y se añadieron nuevas denegaciones.

5. **SEC-001: solución.** `REVOKE ALL` sobre `complete_group_visit(uuid)` para `PUBLIC`, `anon` y `authenticated`. Se conserva la firma, sin exponerla a las sesiones de usuario. Admin y gestores, que también entran mediante `authenticated`, utilizan sus RPC administrativas existentes con `can_confirm_returns`; no reciben una excepción sobre la entrada turística retirada. El propietario PostgreSQL y `service_role` conservan sus privilegios previos de backend. No se expuso ninguna clave ni se utiliza ese rol en los intentos de los actores.

6. **SEC-001: antes/después.** Antes, la llamada directa del líder a la RPC antigua fue permitida, tanto con los tres adultos activos como con un retorno anticipado pendiente. Las sondas revirtieron cada intento exitoso para no contaminar el flujo individual posterior. Después, ambos intentos devuelven SQLSTATE `42501`. También se intentó directamente con `anon`, turista externo, ambos integrantes, Admin y gestor: denegado. Evidencia: [antes](../tmp/security-p0-20261022/returns-before.txt) y [después](../tmp/security-p0-20261022/returns-after.txt).

7. **Consumidores de `staff_get_visitor_sensitive_details`.** Referencia en `admin-web/src/services/admin-service.ts`, función exportada `getSensitiveDetails`, sin llamadas desde las pantallas actuales. `VisitorsPage.tsx` utiliza `getOperationalContacts` y `getIdentityDetails`. También la consume `admin_visitor_management_test.sql`; no se encontraron usos en PWA ni scripts. Se mantuvo firma y estructura de respuesta para compatibilidad segura.

8. **SEC-002: solución.** La función antigua exige `can_view_emergency_contacts` y delega la lectura en `staff_get_operational_contacts`. Así reutiliza exactamente la regla vigente: gestor activo y participación `active` o `returning_early` en visita `in_progress`, incluidos retornos atrasados; Admin conserva su excepción temporal. Se mantiene el alcance previo de perfiles visitantes. Si se solicitan documentos, exige además `can_view_identity_documents` y llama a `staff_get_identity_details`. La API independiente de identidad no cambia y puede seguir utilizándose sin permiso de contactos. Se inspeccionaron `has_staff_permission` y ambas versiones de `admin_update_staff_permissions`; no fue necesario modificarlas.

   La delegación genera `emergency_contact_viewed` y, cuando procede, `identity_document_viewed`. Se conserva además `sensitive_data_viewed` para consumidores históricos de auditoría. Las regresiones comprueban que los eventos no contienen teléfonos completos, contacto completo, documento, contraseñas ni tokens.

9. **SEC-002: antes/después.** Antes, un gestor activo con solo `can_view_sensitive_data=true` obtuvo acceso por la RPC antigua a un visitante sin contexto operativo permitido. Después recibe `42501`. También se deniega con el permiso específico fuera de la ventana, aunque el permiso genérico siga activo. Los contactos permitidos, la excepción de Admin y el acceso independiente a identidad pasan. Evidencia: [antes](../tmp/security-p0-20261022/sensitive-before.txt) y [después](../tmp/security-p0-20261022/sensitive-after.txt).

10. **Pruebas nuevas.** **75 PASS, 0 FAIL:** 36 de retornos y 39 de datos sensibles. Cubren ACL y llamadas directas, líder y dos adultos, confirmación individual, `returning_early` pendiente, cierre al último retorno, `checked_out_at`, `return_started_at`, `completed_at`, menores por responsable, bloqueo antes de cuatro horas, retornos administrativos autorizados y denegados, gestores sin permiso/desactivados, contexto operativo y atrasos, Admin, auditoría e independencia de identidad. Las identidades son sintéticas y las suites terminan en `ROLLBACK`. Se añadieron otras dos aserciones a suites anteriores para que cada adulto confirme personalmente.

11. **pgTAP completo.** Antes: **453 PASS en 22 archivos**. Después y en la repetición final: **530 PASS, 0 FAIL en 24 archivos**, mediante `npx --no-install supabase test db --local`. Se mantienen los 453 controles anteriores, adaptando las expectativas que legitimaban las dos vías inseguras, más 75 regresiones nuevas y dos confirmaciones personales adicionales. Incluye retornos, grupos, menores, visitas, gestores, datos sensibles, RLS y auditoría. [Salida final](../tmp/security-p0-20261022/pgtap-final.txt).

12. **Lint PWA.** `npm run lint`: PASS, salida 0.

13. **Build PWA.** `npm run build`: PASS, salida 0. Vite mantiene advertencias de chunks mayores de 500 kB y de tiempo de callbacks; no bloquean la compilación.

14. **Lint Admin.** `npm run lint` en `admin-web`: PASS, salida 0.

15. **Build Admin.** `npm run build` en `admin-web`: FAIL, salida 2. Error previo `TS2345` en `src/components/AccountPassword.tsx:47`: incompatibilidad de los tipos `SupabaseClient` de las instalaciones raíz y Admin, por la propiedad protegida `supabaseUrl`. Coincide con el informe de auditoría anterior. No se modificaron dependencias ni se abordó SEC-008. [Salida](../tmp/security-p0-20261022/admin-build.txt).

16. **Regresiones.** Ninguna detectada en las pruebas SQL o lint. El fallo de build Admin es preexistente. No se afirma validación de interfaz en navegador, Cloud ni datos históricos reales. `git diff --check` pasa.

17. **Git final.** Rama `fix/security-p0`, HEAD todavía `47b12d9`, sin archivos staged. `git status --short`:

    ```text
     M supabase/config.toml
     M supabase/tests/database/admin_visitor_management_test.sql
     M supabase/tests/database/avatar_and_start_mode_test.sql
     M supabase/tests/database/group_visits_rls_test.sql
     M supabase/tests/database/member_return_and_history_test.sql
     M supabase/tests/database/visit_type_and_return_test.sql
    ?? docs/SECURITY_P0_CORRECTIONS.md
    ?? supabase/config.toml.qa-backup
    ?? supabase/migrations/20261022130000_fix_legacy_return_and_sensitive_access.sql
    ?? supabase/tests/database/security_p0_returns_test.sql
    ?? supabase/tests/database/security_p0_sensitive_access_test.sql
    ?? tmp/
    ```

18. **`git diff --stat`.** Refleja únicamente archivos rastreados e incluye la configuración modificada antes de esta sesión; no incluye los cuatro archivos nuevos de la corrección ni las evidencias:

    ```text
     supabase/config.toml                                     | 14 +++++++-------
     .../tests/database/admin_visitor_management_test.sql     |  4 ++--
     supabase/tests/database/avatar_and_start_mode_test.sql   |  2 +-
     supabase/tests/database/group_visits_rls_test.sql        | 10 +++++++---
     .../tests/database/member_return_and_history_test.sql    | 16 +++++++++++-----
     supabase/tests/database/visit_type_and_return_test.sql   |  2 +-
     6 files changed, 29 insertions(+), 19 deletions(-)
    ```

19. **Pendientes y límites.** Desplegar la migración en el entorno destino mediante el proceso autorizado y repetir las comprobaciones allí. Esta sesión no modificó Cloud, `.env.local`, usuarios reales, política de contraseñas, push ni SEC-003 a SEC-009; no ejecutó `db push`, `db reset` ni `npm audit fix`. Los puertos 545xx ya estaban configurados y en uso al comenzar: no se editó `supabase/config.toml`, se conservó su estado inicial y no se preparó para commit. No se repararon datos históricos posiblemente afectados por el comportamiento anterior. El build Admin sigue pendiente como trabajo separado. Sin commit ni push.
