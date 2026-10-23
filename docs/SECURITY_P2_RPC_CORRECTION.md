# SEC-007 — Protección de `visit_operational_status(uuid)`

Fecha: 2026-10-23. Rama: `fix/security-p2-rpc`. Trabajo realizado exclusivamente contra Supabase local, sin `db reset`, `db push`, commit, push ni acceso a Cloud.

## Causa y evidencia

La RPC era `SECURITY DEFINER`, tenía `EXECUTE` para `authenticated` y consultaba `visits` y `visit_members` sin validar `auth.uid()`. Un turista externo que conocía el UUID de una visita podía obtener su estado derivado aunque `get_group_visit_details(uuid)` le negara acceso.

La reproducción previa con usuarios sintéticos devolvió `SEC007_BEFORE=scheduled` al turista ajeno. No existen consumidores directos en PWA, Admin, funciones Edge, `shared` o scripts. Sus consumidores SQL son los listados de ascensos y visitantes, el dashboard operativo y el acceso operativo a contactos.

## Corrección

La migración incremental `20261023110000_secure_visit_operational_status.sql` conserva la firma, `SECURITY DEFINER`, `search_path=''`, el cálculo y los grants existentes. Antes de leer la visita exige:

- pertenencia en `visit_members`, que cubre líder/organizador e integrantes según la regla ya usada por `get_group_visit_details`; o
- un permiso operativo activo usado por alguno de sus consumidores: `can_view_visitors`, `can_manage_visits`, `can_confirm_returns`, `can_register_walk_in_visitors` o `can_view_emergency_contacts`.

Administradores continúan autorizados mediante `has_staff_permission`. Un turista ajeno, un usuario sin sesión y un gestor con permiso no operativo reciben SQLSTATE `42501`. Para un turista ajeno, un UUID real y uno inexistente producen la misma denegación.

No se modificaron funciones de ascenso o retorno, RLS, Auth, SEC-001 a SEC-006, dependencias ni interfaces React.

## Archivos

- `supabase/migrations/20261023110000_secure_visit_operational_status.sql`: autorización visit-scoped de la RPC.
- `supabase/tests/database/security_visit_operational_status_test.sql`: 13 regresiones para grants, líder, integrante, turista externo, gestor autorizado, gestor con permiso ajeno, administrador, consumidores administrativos y `pending_returns`.
- `docs/SECURITY_P2_RPC_CORRECTION.md`: este informe.

## Verificación

- Migración aplicada con `supabase migration up --local`: PASS.
- Prueba focal SEC-007: **13/13 PASS**.
- pgTAP completo: **594 PASS en 27 archivos**; referencia previa 581.
- Lint PWA: PASS.
- Build PWA: PASS.
- Lint Admin: PASS.
- Build Admin: PASS.
- `git diff --check`: PASS.
- Auth local: protección de contraseña actual continúa habilitada.
- `supabase/config.toml`: hash SHA-256 sin cambios durante la tarea (`60911267AD5134B4BD790529E3D8E0B5A95594E30545BC94DA2FE03130234161`). Los builds solo emitieron los avisos preexistentes de chunks mayores de 500 kB.

## Riesgos pendientes

No se identificó una regresión funcional. Una llamada directa con `service_role` sin un JWT de usuario final ahora recibe `42501`; no existe tal consumidor en el repositorio. Si se añade un proceso backend futuro, deberá usar una RPC propia con autorización y alcance explícitos, en lugar de omitir este control.

## Git status

```text
 M supabase/config.toml
?? docs/SECURITY_P2_RPC_CORRECTION.md
?? supabase/config.toml.qa-backup
?? supabase/migrations/20261023110000_secure_visit_operational_status.sql
?? supabase/tests/database/security_visit_operational_status_test.sql
?? tmp/
```

Los cambios de esta tarea son la migración, su prueba y este informe. `supabase/config.toml`, `supabase/config.toml.qa-backup` y `tmp/` ya estaban presentes; contienen la configuración temporal local o artefactos y deben excluirse de un futuro commit.
