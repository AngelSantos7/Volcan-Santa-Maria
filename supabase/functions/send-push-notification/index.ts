import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type' };
Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const url = Deno.env.get('SUPABASE_URL'); const anon = Deno.env.get('SUPABASE_ANON_KEY'); const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const publicKey = Deno.env.get('VAPID_PUBLIC_KEY'); const privateKey = Deno.env.get('VAPID_PRIVATE_KEY'); const subject = Deno.env.get('VAPID_SUBJECT');
    if (!url || !anon || !serviceKey || !publicKey || !privateKey || !subject) throw new Error('Push backend is not configured.');
    const authorization = request.headers.get('Authorization') ?? '';
    const caller = createClient(url, anon, { global: { headers: { Authorization: authorization } } });
    const { data: allowed, error: permissionError } = await caller.rpc('has_staff_permission', { permission_name: 'can_manage_notifications' });
    if (permissionError || !allowed) return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { ...cors, 'Content-Type': 'application/json' } });
    const { notification_id: notificationId } = await request.json() as { notification_id?: string };
    if (!notificationId) return new Response(JSON.stringify({ error: 'notification_id is required' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
    const admin = createClient(url, serviceKey); const { data: notification, error } = await admin.from('notifications').select('id,title_es,body_es,priority,image_path,destination_url,status').eq('id', notificationId).eq('status', 'published').single();
    if (error || !notification) return new Response(JSON.stringify({ error: 'Published notification not found' }), { status: 404, headers: { ...cors, 'Content-Type': 'application/json' } });
    const { data: recipients } = await admin.from('notification_recipients').select('user_id').eq('notification_id', notificationId);
    const userIds = (recipients ?? []).map((row) => row.user_id); const { data: subscriptions } = userIds.length ? await admin.from('push_subscriptions').select('id,endpoint,p256dh,auth').in('user_id', userIds) : { data: [] };
    let image: string | undefined; if (notification.image_path) { const signed = await admin.storage.from('notification-media').createSignedUrl(notification.image_path, 3600); image = signed.data?.signedUrl; }
    webpush.setVapidDetails(subject, publicKey, privateKey); let sent = 0; let removed = 0;
    await Promise.all((subscriptions ?? []).map(async (subscription) => { try { await webpush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, JSON.stringify({ notification_id: notification.id, title: notification.title_es, body: notification.body_es, priority: notification.priority, image, url: notification.destination_url }), { TTL: 3600 }); sent += 1; } catch (pushError) { const statusCode = (pushError as { statusCode?: number }).statusCode; if (statusCode === 404 || statusCode === 410) { await admin.from('push_subscriptions').delete().eq('id', subscription.id); removed += 1; } } }));
    return new Response(JSON.stringify({ sent, expired_subscriptions_removed: removed }), { headers: { ...cors, 'Content-Type': 'application/json' } });
  } catch (error) { return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Push failed' }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } }); }
});
