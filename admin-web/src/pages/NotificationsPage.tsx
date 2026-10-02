import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { EmptyState, ErrorState, LoadingState, PageHeader, Panel, StatusBadge } from '../components/ui';
import { formatDateTime } from '../lib/date-range';
import { listNotifications, saveNotification, uploadNotificationImage } from '../services/admin-service';
import type { NotificationRow } from '../types';

export function NotificationsPage() {
  const [rows, setRows] = useState<NotificationRow[]>([]);
  const [state, setState] = useState<'loading' | 'success' | 'error'>('loading');
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [audience, setAudience] = useState('all_users');
  const load = useCallback(async () => {
    setState('loading');
    try { setRows(await listNotifications()); setState('success'); }
    catch { setState('error'); }
  }, []);
  useEffect(() => { let active = true; void listNotifications().then((nextRows) => { if (active) { setRows(nextRows); setState('success'); } }).catch(() => { if (active) setState('error'); }); return () => { active = false; }; }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true); setMessage('');
    const form = new FormData(event.currentTarget);
    try {
      const image = form.get('image');
      const imagePath = image instanceof File && image.size > 0 ? await uploadNotificationImage(image) : null;
      const status = String(form.get('status'));
      await saveNotification({
        title_es: String(form.get('titleEs') ?? ''), body_es: String(form.get('bodyEs') ?? ''),
        title_en: String(form.get('titleEn') ?? ''), body_en: String(form.get('bodyEn') ?? ''),
        priority: String(form.get('priority')), audience, status,
        audience_visit_id: audience === 'specific_visit' ? String(form.get('audienceVisitId') ?? '') : null,
        audience_user_id: audience === 'specific_user' ? String(form.get('audienceUserId') ?? '') : null,
        image_path: imagePath,
        scheduled_at: status === 'scheduled' ? new Date(String(form.get('scheduledAt'))).toISOString() : null,
        expires_at: form.get('expiresAt') ? new Date(String(form.get('expiresAt'))).toISOString() : null,
      });
      setCreating(false); setMessage(status === 'published' ? 'Notificación publicada.' : status === 'scheduled' ? 'Notificación programada.' : 'Borrador guardado.');
      await load();
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : 'No fue posible guardar la notificación.'); }
    finally { setSaving(false); }
  }

  return <>
    <PageHeader eyebrow="Comunicación" title="Notificaciones">
      <button type="button" className="primary-action" onClick={() => setCreating((value) => !value)}>{creating ? 'Cerrar formulario' : 'Nueva notificación'}</button>
    </PageHeader>
    {message && <div className="alert" role="status">{message}</div>}
    {creating && <form onSubmit={submit}><Panel><div className="operation-form">
      <label>Título ES<input name="titleEs" required maxLength={120} /></label>
      <label>Mensaje ES<textarea name="bodyEs" required maxLength={2000} /></label>
      <div className="form-grid"><label>Título EN (opcional)<input name="titleEn" maxLength={120} /></label><label>Mensaje EN (opcional)<textarea name="bodyEn" maxLength={2000} /></label></div>
      <div className="form-grid"><label>Prioridad<select name="priority"><option value="info">Informativa</option><option value="caution">Precaución</option><option value="urgent">Urgente</option></select></label>
      <label>Destinatarios<select name="audience" value={audience} onChange={(event) => setAudience(event.target.value)}><option value="all_users">Todos los usuarios</option><option value="in_progress">Visitantes en recorrido</option><option value="planned">Visitantes con ascenso planificado</option><option value="specific_visit">Grupo específico</option><option value="specific_user">Usuario específico</option></select></label></div>
      {audience === 'specific_visit' && <label>ID del ascenso o grupo<input name="audienceVisitId" type="text" required placeholder="UUID del ascenso" /></label>}
      {audience === 'specific_user' && <label>ID del usuario<input name="audienceUserId" type="text" required placeholder="UUID del usuario" /></label>}
      <label>Imagen opcional (JPG, PNG o WebP; máximo 5 MB)<input name="image" type="file" accept="image/jpeg,image/png,image/webp" /></label>
      <label>Vence (opcional)<input name="expiresAt" type="datetime-local" /></label>
      <div className="form-grid"><label>Acción<select name="status"><option value="draft">Guardar borrador</option><option value="published">Publicar ahora</option><option value="scheduled">Programar</option></select></label><label>Fecha programada<input name="scheduledAt" type="datetime-local" /></label></div>
      <p className="muted">Push externo requiere VAPID configurado en el backend. La entrega dentro de la PWA funciona sin esas claves.</p>
      <div className="form-actions"><button disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</button></div>
    </div></Panel></form>}
    <Panel>{state === 'loading' ? <LoadingState rows={5} /> : state === 'error' ? <ErrorState retry={() => void load()} /> : rows.length === 0 ? <EmptyState title="Sin notificaciones" detail="Todavía no se han creado mensajes." /> : <div className="table-scroll"><table><thead><tr><th>Título</th><th>Prioridad</th><th>Audiencia</th><th>Estado</th><th>Publicación</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td><strong>{row.title_es}</strong><br/><span className="muted">{row.body_es}</span></td><td><StatusBadge value={row.priority}/></td><td>{row.audience}</td><td><StatusBadge value={row.status}/></td><td>{formatDateTime(row.published_at ?? row.scheduled_at ?? row.created_at)}</td></tr>)}</tbody></table></div>}</Panel>
  </>;
}
