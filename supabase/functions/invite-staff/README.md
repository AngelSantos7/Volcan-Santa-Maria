# invite-staff

Función local preparada para crear, reenviar y retirar invitaciones de gestores mediante Supabase Auth Admin. No se despliega automáticamente.

Requiere `STAFF_INVITE_REDIRECT_URL` además de las variables que Supabase proporciona a las Edge Functions. `SUPABASE_SERVICE_ROLE_KEY` se usa exclusivamente en el backend y nunca debe exponerse como variable `VITE_*`.

Antes de producción:

1. Configure SMTP/Auth email de Supabase y la URL permitida de redirección del panel.
2. Defina `STAFF_INVITE_REDIRECT_URL` con la URL HTTPS del panel administrativo.
3. Despliegue manualmente `invite-staff` y pruebe el correo de invitación.
4. Mantenga la verificación JWT habilitada.

Un gestor invitado queda `Pendiente`. Al autenticarse desde el enlace y definir su contraseña, el panel llama al RPC protegido `activate_my_staff_invitation`; no se almacena ni muestra ninguna contraseña inicial.
