import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Content-Type': 'application/json',
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
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
      fullName?: string; email?: string; permissions?: Record<string, boolean>;
    };

    if (body.action === 'delete') {
      if (!body.userId) throw new Error('Falta el gestor pendiente.');
      const pending = await admin.from('staff_permissions').select('invitation_status').eq('user_id', body.userId).single();
      if (pending.data?.invitation_status !== 'pending')
        return new Response(JSON.stringify({ error: 'Solo se puede eliminar una invitación que nunca fue activada.' }), { status: 409, headers: cors });
      await admin.from('audit_logs').insert({ actor_user_id: session.data.user_id, action: 'staff_invitation_deleted', target_type: 'staff_user', target_id: body.userId, metadata: {} });
      const removed = await admin.auth.admin.deleteUser(body.userId);
      if (removed.error) throw removed.error;
      return new Response(JSON.stringify({ deleted: true }), { headers: cors });
    }

    const email = body.email?.trim().toLowerCase();
    if (!email) throw new Error('El correo es obligatorio.');

    if (body.action === 'resend') {
      const resent = await admin.auth.admin.inviteUserByEmail(email, { redirectTo });
      if (resent.error) throw resent.error;
      await admin.from('audit_logs').insert({ actor_user_id: session.data.user_id, action: 'staff_invitation_resent', target_type: 'staff_user', target_id: body.userId ?? resent.data.user.id, metadata: { email } });
      return new Response(JSON.stringify({ user_id: body.userId ?? resent.data.user.id }), { headers: cors });
    }

    const fullName = body.fullName?.trim();
    if (!fullName) throw new Error('El nombre completo es obligatorio.');
    const nameParts = fullName.split(/\s+/u);
    const firstName = nameParts.shift() ?? '';
    const lastName = nameParts.join(' ') || '-';
    const invited = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo,
      data: { first_name: firstName, last_name: lastName, staff_invitation: true },
    });
    if (invited.error) throw invited.error;
    const userId = invited.data.user.id;
    const roleUpdate = await admin.from('user_roles').update({ role: 'visitor_manager' }).eq('user_id', userId);
    if (roleUpdate.error) throw roleUpdate.error;
    const allowed = body.permissions ?? {};
    const permissionInsert = await admin.from('staff_permissions').upsert({
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
