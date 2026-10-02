import { supabase } from '../../lib/supabase';
import type { AppNotification } from './notification-types';

type NotificationRow = { notification_id: string; title_es: string; body_es: string; title_en: string | null; body_en: string | null; priority: AppNotification['priority']; image_path: string | null; destination_url: string; published_at: string; expires_at: string | null; read_at: string | null; dismissed_at: string | null; snoozed_until: string | null; snooze_count: number };

export async function getMyNotifications(): Promise<AppNotification[]> {
  const { data, error } = await supabase.rpc('get_my_notifications'); if (error) throw error;
  return Promise.all(((data ?? []) as NotificationRow[]).map(async (row) => {
    let imageUrl: string | null = null;
    if (row.image_path) { const result = await supabase.storage.from('notification-media').createSignedUrl(row.image_path, 900); imageUrl = result.data?.signedUrl ?? null; }
    return { id: row.notification_id, titleEs: row.title_es, bodyEs: row.body_es, titleEn: row.title_en, bodyEn: row.body_en, priority: row.priority, imageUrl, destinationUrl: row.destination_url, publishedAt: row.published_at, expiresAt: row.expires_at, readAt: row.read_at, dismissedAt: row.dismissed_at, snoozedUntil: row.snoozed_until, snoozeCount: row.snooze_count };
  }));
}
export async function markNotificationRead(id: string) { const { error } = await supabase.rpc('mark_notification_read', { p_notification_id: id }); if (error) throw error; }
export async function snoozeNotification(id: string) { const { error } = await supabase.rpc('snooze_notification', { p_notification_id: id }); if (error) throw error; }
function decodeVapidKey(value: string): ArrayBuffer { const padding = '='.repeat((4 - value.length % 4) % 4); const bytes = atob((value + padding).replace(/-/g, '+').replace(/_/g, '/')); const key = new Uint8Array(new ArrayBuffer(bytes.length)); for (let index = 0; index < bytes.length; index += 1) key[index] = bytes.charCodeAt(index); return key.buffer; }
export function pushSupport(): { supported: boolean; reason?: 'insecure' | 'unsupported' | 'unconfigured' } {
  if (!window.isSecureContext) return { supported: false, reason: 'insecure' };
  if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) return { supported: false, reason: 'unsupported' };
  if (!import.meta.env.VITE_VAPID_PUBLIC_KEY?.trim()) return { supported: false, reason: 'unconfigured' };
  return { supported: true };
}
export async function enableDeviceNotifications(): Promise<void> {
  const support = pushSupport(); if (!support.supported) throw new Error(support.reason);
  const permission = await Notification.requestPermission(); if (permission !== 'granted') throw new Error('denied');
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: decodeVapidKey(import.meta.env.VITE_VAPID_PUBLIC_KEY.trim()) });
  const json = subscription.toJSON();
  const { error } = await supabase.rpc('register_push_subscription', { p_endpoint: subscription.endpoint, p_p256dh: json.keys?.p256dh, p_auth: json.keys?.auth, p_user_agent: navigator.userAgent }); if (error) throw error;
}
