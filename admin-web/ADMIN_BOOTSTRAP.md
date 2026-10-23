# Primer administrador

La aplicación no crea administradores ni almacena credenciales. Primero registre una cuenta por el flujo normal de autenticación y copie su UUID desde **Supabase Studio → Authentication → Users**.

En el editor SQL de Supabase, reemplace `<USER_UUID>` por ese UUID y ejecute:

```sql
begin;

update public.user_roles
set role = 'admin'::public.app_role
where user_id = '<USER_UUID>'::uuid;

-- Debe devolver exactamente una fila con role = admin.
select user_id, role
from public.user_roles
where user_id = '<USER_UUID>'::uuid;

commit;
```

Si el `select` no devuelve una fila, ejecute `rollback;` y compruebe que la cuenta completó el registro. No use el correo como identificador para este cambio.

Después del bootstrap, el panel crea únicamente gestores mediante la Edge Function `invite-staff` y las RPC administrativas vigentes. La RPC heredada `admin_set_user_role(uuid,text)` se conserva por compatibilidad histórica, pero no está expuesta a `PUBLIC`, `anon`, `authenticated` ni `service_role`; no debe utilizarse para promover administradores. Cualquier alta adicional de administradores requiere el mismo procedimiento manual, explícito y auditado aplicado al primer administrador.
