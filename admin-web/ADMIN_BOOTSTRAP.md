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

Después del bootstrap, los cambios futuros de rol deben hacerse únicamente mediante la función administrativa protegida `admin_set_user_role`, ejecutada por una sesión con rol `admin`. La interfaz de esta fase administra gestores ya asignados; no genera cuentas ni contraseñas.
