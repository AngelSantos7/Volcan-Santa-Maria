import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
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
      const resent = await admin.auth.admin.inviteUserByEmail(email, { redirectTo });
      if (resent.error) throw resent.error;
      await admin.from('audit_logs').insert({ actor_user_id: session.data.user_id, action: 'staff_invitation_resent', target_type: 'staff_user', target_id: body.userId ?? resent.data.user.id, metadata: { email } });
      return new Response(JSON.stringify({ user_id: body.userId ?? resent.data.user.id }), { headers: cors });
    }

    if (body.action !== 'invite') throw new Error('Acción inválida.');
    const available = await admin.rpc('staff_invitation_email_available', { p_email: email });
    if (available.error || available.data !== true) throw new Error('Ya existe una identidad con ese correo. No se modificó su cuenta.');
    const phone = body.phone?.trim();
    if (!phone || !/^\+502[2-7]\d{7}$/.test(phone)) throw new Error('Ingrese un teléfono de Guatemala de 8 dígitos.');
    const firstName = body.firstName?.trim();
    const lastName = body.lastName?.trim();
    if (!firstName || !lastName || firstName.length > 80 || lastName.length > 80) throw new Error('Nombre y apellido son obligatorios.');
    const fullName = `${firstName} ${lastName}`;
    const invited = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo,
      data: { first_name: firstName, last_name: lastName, staff_invitation: true },
    });
    if (invited.error) throw invited.error;
    const userId = invited.data.user.id;
    const roleUpdate = await admin.from('user_roles').update({ role: 'visitor_manager' }).eq('user_id', userId);
    if (roleUpdate.error) throw roleUpdate.error;
    const profileUpdate = await admin.from('profiles').update({ phone }).eq('id', userId);
    if (profileUpdate.error) throw profileUpdate.error;
    const allowed = body.permissions ?? {};
    const permissionInsert = await admin.from('staff_permissions').insert({
      user_id: userId, is_active: false, invitation_status: 'pending',
      can_view_visitors: Boolean(allowed.can_view_visitors),
      can_register_walk_in_visitors: Boolean(allowed.can_register_walk_in_visitors),
      can_manage_visits: Boolean(allowed.can_manage_visits),
      can_confirm_returns: Boolean(allowed.can_confirm_returns),
      can_manage_notifications: Boolean(allowed.can_manage_notifications),
      can_manage_gallery: Boolean(allowed.can_manage_gallery),
      can_view_identity_documents: Boolean(allowed.can_view_identity_documents),
      can_view_emergency_contacts: Boolean(allowed.can_view_emergency_contacts),
    });
    if (permissionInsert.error) throw permissionInsert.error;
    await admin.from('audit_logs').insert({ actor_user_id: session.data.user_id, action: 'staff_invitation_created', target_type: 'staff_user', target_id: userId, metadata: { email, full_name: fullName } });
    return new Response(JSON.stringify({ user_id: userId }), { headers: cors });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'No fue posible gestionar la invitación.' }), { status: 500, headers: cors });
  }
});
