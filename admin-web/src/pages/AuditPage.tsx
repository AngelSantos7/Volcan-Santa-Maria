import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { EmptyState, ErrorState, LoadingState, PageHeader, Panel } from '../components/ui'
import { formatDateTime, toHalfOpenRange } from '../lib/date-range'
import { listAudit } from '../services/admin-service'
import type { AuditRow } from '../types'

const actionLabels: Record<string, string> = {
  sensitive_data_viewed: 'Consulta de datos sensibles', identity_document_viewed: 'Consulta de documento completo',
  user_role_changed: 'Cambio de rol', staff_permissions_changed: 'Cambio de permisos',
  staff_activated: 'Activación de gestor', staff_deactivated: 'Desactivación de gestor',
}

export function AuditPage() {
  const [rows, setRows] = useState<AuditRow[]>([])
  const [filters, setFilters] = useState({ from: '', to: '', action: '', actor: '' })
  const [state, setState] = useState<'loading' | 'success' | 'error'>('loading')
  const load = useCallback(async (current = filters) => {
    setState('loading')
    try {
      const range = current.from && current.to ? toHalfOpenRange(current.from, current.to) : null
      setRows(await listAudit({ from: range?.from, to: range?.to, action: current.action, actor: current.actor })); setState('success')
    } catch { setState('error') }
  }, [filters])
  useEffect(() => {
    let current = true
    void listAudit({}).then((result) => { if (current) { setRows(result); setState('success') } }).catch(() => { if (current) setState('error') })
    return () => { current = false }
  }, [])
  function submit(event: FormEvent) { event.preventDefault(); void load() }
  return <><PageHeader eyebrow="Administración" title="Auditoría"/><Panel><form className="filters" onSubmit={submit}><label>Desde<input type="date" value={filters.from} onChange={(event) => setFilters({ ...filters, from: event.target.value })}/></label><label>Hasta<input type="date" min={filters.from} value={filters.to} onChange={(event) => setFilters({ ...filters, to: event.target.value })}/></label><label>Acción<select value={filters.action} onChange={(event) => setFilters({ ...filters, action: event.target.value })}><option value="">Todas</option>{Object.entries(actionLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label>Usuario<input type="search" placeholder="Nombre o correo" value={filters.actor} onChange={(event) => setFilters({ ...filters, actor: event.target.value })}/></label><button type="submit">Aplicar filtros</button></form></Panel><Panel>{state === 'loading' ? <LoadingState rows={6}/> : state === 'error' ? <ErrorState retry={() => void load()}/> : rows.length === 0 ? <EmptyState title="Sin actividad" detail="No hay eventos de auditoría para estos filtros."/> : <div className="table-scroll"><table><thead><tr><th>Fecha y hora</th><th>Usuario</th><th>Acción</th><th>Objetivo</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td>{formatDateTime(row.created_at)}</td><td><strong>{row.actor_name || 'Usuario no disponible'}</strong><small className="cell-subtitle">{row.actor_email}</small></td><td>{actionLabels[row.action] ?? row.action}</td><td>{row.target_type} · {row.target_id?.slice(0, 12) ?? '—'}</td></tr>)}</tbody></table></div>}</Panel></>
}
