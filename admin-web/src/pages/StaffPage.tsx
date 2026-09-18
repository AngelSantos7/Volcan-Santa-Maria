import { useCallback, useEffect, useState } from 'react'
import { EmptyState, ErrorState, LoadingState, PageHeader, Panel, StatusBadge } from '../components/ui'
import { formatDateTime } from '../lib/date-range'
import { listStaff, setStaffAccess } from '../services/admin-service'
import type { StaffRow } from '../types'

export function StaffPage({ managePermissions }: { managePermissions: (userId: string) => void }) {
  const [rows, setRows] = useState<StaffRow[]>([])
  const [state, setState] = useState<'loading' | 'success' | 'error'>('loading')
  const [message, setMessage] = useState('')
  const load = useCallback(async () => {
    setState('loading')
    try { setRows(await listStaff()); setState('success') } catch { setState('error') }
  }, [])
  useEffect(() => {
    let current = true
    void listStaff().then((result) => { if (current) { setRows(result); setState('success') } }).catch(() => { if (current) setState('error') })
    return () => { current = false }
  }, [])
  async function toggle(row: StaffRow) {
    setMessage('')
    try { await setStaffAccess(row.user_id, !row.is_active); setMessage('El estado de acceso se actualizó y quedó auditado.'); await load() }
    catch { setMessage('No fue posible actualizar el acceso.') }
  }
  return <><PageHeader eyebrow="Administración" title="Gestores"/><p className="page-intro">Las cuentas se crean por los canales seguros existentes. Desde aquí solo se administra el acceso del personal ya asignado.</p>{message && <div className={message.startsWith('No') ? 'alert error' : 'alert success'} role="status">{message}</div>}<Panel>{state === 'loading' ? <LoadingState rows={5}/> : state === 'error' ? <ErrorState retry={() => void load()}/> : rows.length === 0 ? <EmptyState title="Sin personal administrativo" detail="Asigne el rol mediante el mecanismo administrativo protegido."/> : <div className="table-scroll"><table><thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Estado</th><th>Última actualización</th><th><span className="sr-only">Acciones</span></th></tr></thead><tbody>{rows.map((row) => <tr key={row.user_id}><td><strong>{row.full_name || 'Sin nombre'}</strong></td><td>{row.email}</td><td>{row.role === 'admin' ? 'Administrador' : 'Gestor de visitantes'}</td><td><StatusBadge value={row.is_active ? 'active_access' : 'inactive_access'}/></td><td>{formatDateTime(row.updated_at)}</td><td><div className="row-actions">{row.role === 'visitor_manager' && <><button type="button" className="table-action" onClick={() => managePermissions(row.user_id)}>Gestionar permisos</button><button type="button" className={row.is_active ? 'danger-link' : 'table-action'} onClick={() => void toggle(row)}>{row.is_active ? 'Desactivar' : 'Activar'}</button></>}</div></td></tr>)}</tbody></table></div>}</Panel></>
}
