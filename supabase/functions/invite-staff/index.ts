import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-retry-count, traceparent, tracestate, baggage',
  'Content-Type': 'application/json',
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: cors });
  try {
    const url = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const redirectTo = Deno.env.get('STAFF_INVITE_REDIRECT_URL');
    if (!url || !anonKey || !serviceKey || !redirectTo)
      throw new Error('Staff invitation backend is not configured.');

    const authorization = request.headers.get('Authorization') ?? '';
    const caller = createClient(url, anonKey, { global: { headers: { Authorization: authorization } } });
    const session = await caller.rpc('get_admin_session');
    if (session.error || session.data?.role !== 'admin')
      return new Response(JSON.stringify({ error: 'Solo un administrador puede gestionar invitaciones.' }), { status: 403, headers: cors });

    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const body = await request.json() as {
      action?: 'invite' | 'resend' | 'delete'; userId?: string;
      firstName?: string; lastName?: string; email?: string; phone?: string; permissions?: Record<string, boolean>;
    };

    if (body.action === 'delete') {
      if (!body.userId) throw new Error('Falta el gestor pendiente.');
      const cancelled = await caller.rpc('cancel_pending_staff_invitation', { p_user_id: body.userId });
      if (cancelled.error) throw cancelled.error;
      return new Response(JSON.stringify({ deleted: true }), { headers: cors });
    }

    const email = body.email?.trim().toLowerCase();
    if (!email) throw new Error('El correo es obligatorio.');

    if (body.action === 'resend') {
      if (!body.userId) throw new Error('Falta la invitación pendiente.');
      const pending = await admin.from('staff_permissions').select('invitation_status,invitation_revoked_at').eq('user_id', body.userId).single();
      const account = await admin.auth.admin.getUserById(body.userId);
      if (pending.error || account.error || pending.data.invitation_status !== 'pending' || pending.data.invitation_revoked_at || account.data.user.email?.toLowerCase() !== email)
        throw new Error('Solo se puede reenviar una invitación pendiente al correo original.');
      const audited = await caller.rpc('admin_record_staff_invitation_resend_request', {
        p_user_id: body.userId,
        p_email: email,
      });
      if (audited.error)
        return new Response(JSON.stringify({ error: 'No fue posible registrar la auditoría del reenvío. No se envió otro correo.' }), { status: 500, headers: cors });
      const resent = await admin.auth.admin.inviteUserByEmail(email, { redirectTo });
      if (resent.error) throw resent.error;
      return new Response(JSON.stringify({ user_id: body.userId ?? resent.data.user.id }), { headers: cors });
    }

    if (body.action !== 'invite') throw new Error('Acción inválida.');
    const phone = body.phone?.trim();
    if (!phone || !/^\+502[2-7]\d{7}$/.test(phone)) throw new Error('Ingrese un teléfono de Guatemala de 8 dígitos.');
    const firstName = body.firstName?.trim();
    const lastName = body.lastName?.trim();
    if (!firstName || !lastName || firstName.length > 80 || lastName.length > 80) throw new Error('Nombre y apellido son obligatorios.');
    const recoverable = await caller.rpc('admin_find_recoverable_staff_invitation', {
      p_email: email,
    });
    if (recoverable.error) throw new Error('No fue posible verificar el estado de la invitación.');

    let userId = recoverable.data as string | null;
    const recovered = Boolean(userId);
    if (!userId) {
      const available = await admin.rpc('staff_invitation_email_available', { p_email: email });
      if (available.error || available.data !== true) throw new Error('Ya existe una identidad con ese correo. No se modificó su cuenta.');
      const invited = await admin.auth.admin.inviteUserByEmail(email, {
        redirectTo,
        data: { first_name: firstName, last_name: lastName, staff_invitation: true },
      });
      if (invited.error) throw invited.error;
      userId = invited.data.user.id;
    }

    const allowed = body.permissions ?? {};
    const finalized = await caller.rpc('admin_finalize_staff_invitation', {
      p_user_id: userId,
      p_email: email,
      p_phone: phone,
      p_permissions: {
        can_view_visitors: Boolean(allowed.can_view_visitors),
        can_register_walk_in_visitors: Boolean(allowed.can_register_walk_in_visitors),
        can_manage_visits: Boolean(allowed.can_manage_visits),
        can_confirm_returns: Boolean(allowed.can_confirm_returns),
        can_manage_notifications: Boolean(allowed.can_manage_notifications),
        can_manage_gallery: Boolean(allowed.can_manage_gallery),
        can_view_identity_documents: Boolean(allowed.can_view_identity_documents),
        can_view_emergency_contacts: Boolean(allowed.can_view_emergency_contacts),
      },
    });
    if (finalized.error)
      return new Response(JSON.stringify({ error: 'La invitación fue creada, pero su configuración auditada no pudo completarse. Reintente la operación.', retryable: true }), { status: 500, headers: cors });
    return new Response(JSON.stringify({ user_id: userId, recovered }), { headers: cors });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'No fue posible gestionar la invitación.' }), { status: 500, headers: cors });
  }
});
