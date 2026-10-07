import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { EmptyState, ErrorState, LoadingState, PageHeader, Panel, StatusBadge } from '../components/ui';
import { formatDateTime } from '../lib/date-range';
import { listAudit, listStaff, manageStaffInvitation, setStaffAccess } from '../services/admin-service';
import type { AuditRow, StaffRow } from '../types';
import { PermissionsPage } from './PermissionsPage';
import { auditActionLabel, auditTargetLabel } from '../lib/admin-labels';

const invitationPermissions = [
  ['can_view_visitors', 'Ver Dashboard y consultar ascensos'],
  ['can_register_walk_in_visitors', 'Registrar visitantes'],
  ['can_manage_visits', 'Crear ascensos'],
  ['can_confirm_returns', 'Registrar retornos'],
  ['can_manage_notifications', 'Crear notificaciones'],
  ['can_manage_gallery', 'Gestionar galería'],
  ['can_view_identity_documents', 'Ver datos sensibles de identidad'],
  ['can_view_emergency_contacts', 'Ver contactos de emergencia'],
] as const;

export function StaffPage() {
  const [rows, setRows] = useState<StaffRow[]>([]);
  const [state, setState] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<'information' | 'permissions' | 'activity'>('information');
  const [activity, setActivity] = useState<AuditRow[]>([]);
  const [creating, setCreating] = useState(false);
  const load = useCallback(async () => {
    setState('loading');
    try { setRows(await listStaff()); setState('success'); }
    catch { setState('error'); }
  }, []);
  useEffect(() => {
    let current = true;
    void listStaff().then((items) => { if (current) { setRows(items); setState('success'); } }).catch(() => { if (current) setState('error'); });
    return () => { current = false; };
  }, []);
  const selected = rows.find((row) => row.user_id === selectedId) ?? null;

  async function toggle(row: StaffRow) {
    setMessage('');
    try { await setStaffAccess(row.user_id, !row.is_active); setMessage('El estado de acceso se actualizó y quedó auditado.'); await load(); }
    catch { setMessage('No fue posible actualizar el acceso.'); }
  }

  async function submitInvitation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await manageStaffInvitation({ action: 'invite', fullName: String(form.get('full_name') ?? '').trim(), email: String(form.get('email') ?? '').trim(), permissions: Object.fromEntries(invitationPermissions.map(([key]) => [key, form.get(key) === 'on'])) });
      setCreating(false); setMessage('Invitación enviada de forma segura.'); await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'No fue posible enviar la invitación.'); }
  }

  async function invitationAction(row: StaffRow, action: 'resend' | 'delete') {
    try { await manageStaffInvitation({ action, userId: row.user_id, email: row.email }); setMessage(action === 'resend' ? 'Invitación reenviada.' : 'Invitación pendiente eliminada.'); setSelectedId(null); await load(); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'No fue posible completar la acción.'); }
  }

  async function openActivity(row: StaffRow) {
    setSelectedId(row.user_id); setTab('activity');
    try { setActivity(await listAudit({ actor: row.full_name || row.email })); }
    catch { setActivity([]); }
  }

  return <>
    <PageHeader eyebrow="Administración" title="Gestores"><button type="button" className="primary-action" onClick={() => setCreating(true)}>+ Nuevo gestor</button></PageHeader>
    <p className="page-intro">Cree invitaciones por correo y administre acceso, permisos y actividad sin manejar contraseñas.</p>
    {message && <div className={message.startsWith('No') ? 'alert error' : 'alert success'} role="status">{message}</div>}
    {creating && <Panel title="Nuevo gestor"><form className="staff-invitation-form" onSubmit={submitInvitation}><div className="form-grid"><label>Nombre completo<input name="full_name" required maxLength={160}/></label><label>Correo<input name="email" type="email" required/></label></div><fieldset className="permission-fieldset"><legend>Permisos iniciales</legend>{invitationPermissions.map(([key,label]) => <label className="checkbox-row" key={key}><input type="checkbox" name={key}/><span>{label}</span></label>)}</fieldset><div className="form-actions"><button type="button" className="secondary" onClick={() => setCreating(false)}>Cancelar</button><button type="submit">Enviar invitación</button></div></form></Panel>}
    <Panel>{state === 'loading' ? <LoadingState rows={5}/> : state === 'error' ? <ErrorState retry={() => void load()}/> : rows.length === 0 ? <EmptyState title="Sin personal administrativo" detail="Cree la primera invitación segura."/> : <div className="table-scroll"><table><thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Estado</th><th>Última actualización</th><th><span className="sr-only">Acciones</span></th></tr></thead><tbody>{rows.map((row) => <tr key={row.user_id}><td><strong>{row.full_name || 'Sin nombre'}</strong></td><td>{row.email}</td><td>{row.role === 'admin' ? 'Administrador' : 'Gestor de visitantes'}</td><td><StatusBadge value={row.invitation_status === 'pending' ? 'pending' : row.is_active ? 'active_access' : 'inactive_access'}/></td><td>{formatDateTime(row.updated_at)}</td><td><div className="row-actions">{row.role === 'visitor_manager' && <><button type="button" className="table-action" onClick={() => { setSelectedId(row.user_id); setTab('information'); }}>Ver gestor</button>{row.invitation_status === 'pending' ? <><button type="button" className="table-action" onClick={() => void invitationAction(row,'resend')}>Reenviar invitación</button><button type="button" className="danger-link" onClick={() => void invitationAction(row,'delete')}>Eliminar invitación</button></> : <button type="button" className={row.is_active ? 'danger-link' : 'table-action'} onClick={() => void toggle(row)}>{row.is_active ? 'Desactivar' : 'Reactivar'}</button>}</>}</div></td></tr>)}</tbody></table></div>}</Panel>
    {selected && <Panel><div className="staff-detail-heading"><div><h2>{selected.full_name}</h2><span>{selected.email}</span></div><StatusBadge value={selected.invitation_status === 'pending' ? 'pending' : selected.is_active ? 'active_access' : 'inactive_access'}/></div><div className="period-tabs" role="tablist"><button type="button" className={tab === 'information' ? 'selected' : ''} onClick={() => setTab('information')}>Información</button><button type="button" className={tab === 'permissions' ? 'selected' : ''} onClick={() => setTab('permissions')}>Permisos</button><button type="button" className={tab === 'activity' ? 'selected' : ''} onClick={() => void openActivity(selected)}>Actividad</button></div>{tab === 'information' && <dl className="detail-list"><div><dt>Nombre</dt><dd>{selected.full_name}</dd></div><div><dt>Correo de acceso</dt><dd>{selected.email}</dd></div><div><dt>Estado</dt><dd>{selected.invitation_status === 'pending' ? 'Pendiente de aceptación' : selected.is_active ? 'Activo' : 'Desactivado'}</dd></div></dl>}{tab === 'permissions' && <PermissionsPage initialUserId={selected.user_id} embedded/>}{tab === 'activity' && (activity.length ? <div className="audit-activity-list">{activity.map((item) => <article key={item.id}><time>{formatDateTime(item.created_at)}</time><strong>{auditActionLabel(item.action)}</strong><span>{auditTargetLabel(item.target_type,item.metadata,item.target_id)}</span></article>)}</div> : <EmptyState title="Sin actividad reciente" detail="No se encontraron acciones auditadas para este gestor."/>)}</Panel>}
  </>;
}
