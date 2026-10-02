import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getAppLanguage } from '../../i18n';
import { enableDeviceNotifications, getMyNotifications, markNotificationRead, pushSupport, snoozeNotification } from './notification-service';
import type { AppNotification } from './notification-types';

const shownKey = 'shown-notifications:v1';
function localized(notification: AppNotification, language: 'es' | 'en') { return { title: language === 'en' ? notification.titleEn ?? notification.titleEs : notification.titleEs, body: language === 'en' ? notification.bodyEn ?? notification.bodyEs : notification.bodyEs }; }
export function NotificationCenter() {
  const { i18n } = useTranslation(); const language = getAppLanguage(i18n.resolvedLanguage);
  const [items, setItems] = useState<AppNotification[]>([]); const [open, setOpen] = useState(false); const [selected, setSelected] = useState<AppNotification | null>(null); const [message, setMessage] = useState('');
  const load = useCallback(async () => { try { setItems(await getMyNotifications()); } catch { setMessage(language === 'es' ? 'No fue posible cargar las notificaciones.' : 'Notifications could not be loaded.'); } }, [language]);
  useEffect(() => { let active = true; void getMyNotifications().then((nextItems) => { if (active) setItems(nextItems); }).catch(() => { if (active) setMessage(language === 'es' ? 'No fue posible cargar las notificaciones.' : 'Notifications could not be loaded.'); }); return () => { active = false; }; }, [language]);
  useEffect(() => { const shown = new Set(JSON.parse(sessionStorage.getItem(shownKey) ?? '[]') as string[]); const now = Date.now(); const next = items.find((item) => !item.readAt && !shown.has(item.id) && (!item.snoozedUntil || Date.parse(item.snoozedUntil) <= now)); if (next) { shown.add(next.id); sessionStorage.setItem(shownKey, JSON.stringify([...shown])); queueMicrotask(() => setSelected(next)); } }, [items]);
  const unread = useMemo(() => items.filter((item) => !item.readAt).length, [items]);
  async function closeNotification(item: AppNotification) { await markNotificationRead(item.id); setSelected(null); await load(); }
  async function snooze(item: AppNotification) { await snoozeNotification(item.id); setSelected(null); await load(); }
  async function activatePush() { setMessage(''); try { await enableDeviceNotifications(); setMessage(language === 'es' ? 'Notificaciones del dispositivo activadas.' : 'Device notifications enabled.'); } catch { setMessage(language === 'es' ? 'No fue posible activar las notificaciones del dispositivo.' : 'Device notifications could not be enabled.'); } }
  const support = pushSupport();
  return <>
    <button className="notification-bell" type="button" onClick={() => setOpen(true)} aria-label={language === 'es' ? `Notificaciones: ${unread} sin leer` : `Notifications: ${unread} unread`}>🔔{unread > 0 && <span>{unread}</span>}</button>
    {open && <div className="notification-drawer-backdrop" role="presentation"><aside className="notification-drawer" aria-label={language === 'es' ? 'Notificaciones' : 'Notifications'}><header><h2>{language === 'es' ? 'Notificaciones' : 'Notifications'}</h2><button type="button" onClick={() => setOpen(false)} aria-label={language === 'es' ? 'Cerrar' : 'Close'}>×</button></header>
      {support.supported ? <button className="secondary-button" type="button" onClick={() => void activatePush()}>{language === 'es' ? 'Activar notificaciones del dispositivo' : 'Enable device notifications'}</button> : <p className="muted">{language === 'es' ? 'Las notificaciones del dispositivo no están disponibles en este navegador. Puede seguir consultando los mensajes dentro de la aplicación.' : 'Device notifications are unavailable in this browser. You can continue reading messages in the app.'}</p>}
      {message && <p role="status">{message}</p>}<div className="notification-list">{items.length === 0 ? <p>{language === 'es' ? 'No hay mensajes.' : 'No messages.'}</p> : items.map((item) => { const text = localized(item, language); return <button type="button" key={item.id} className={item.readAt ? 'notification-read' : ''} onClick={() => setSelected(item)}><span>{item.priority === 'urgent' ? '⚠️' : item.priority === 'caution' ? '◆' : '●'}</span><span><strong>{text.title}</strong><small>{new Intl.DateTimeFormat(language === 'es' ? 'es-GT' : 'en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(item.publishedAt))}</small></span></button>; })}</div>
    </aside></div>}
    {selected && <div className="notification-modal-backdrop"><article className={`notification-modal priority-${selected.priority}`} role="dialog" aria-modal="true">{selected.imageUrl && <img src={selected.imageUrl} alt="" />}<h2>{localized(selected, language).title}</h2><p>{localized(selected, language).body}</p><div className="notification-actions">{!selected.readAt && selected.snoozeCount === 0 && <button className="secondary-button" type="button" onClick={() => void snooze(selected)}>{language === 'es' ? 'Recordarme después' : 'Remind me later'}</button>}<button className="primary-button" type="button" onClick={() => void closeNotification(selected)}>{language === 'es' ? 'Cerrar' : 'Close'}</button></div></article></div>}
  </>;
}
