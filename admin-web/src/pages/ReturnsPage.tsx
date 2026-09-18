import { useCallback, useEffect, useMemo, useState } from 'react'
import { EmptyState, ErrorState, LoadingState, PageHeader, Panel, StatusBadge } from '../components/ui'
import { formatDateTime } from '../lib/date-range'
import { listReturns } from '../services/admin-service'
import type { ReturnRow } from '../types'

export function ReturnsPage() {
  const [rows, setRows] = useState<ReturnRow[]>([])
  const [filter, setFilter] = useState('all')
  const [state, setState] = useState<'loading' | 'success' | 'error'>('loading')
  const load = useCallback(async () => {
    setState('loading')
    try { setRows(await listReturns()); setState('success') } catch { setState('error') }
  }, [])
  useEffect(() => {
    let current = true
    void listReturns().then((result) => { if (current) { setRows(result); setState('success') } }).catch(() => { if (current) setState('error') })
    return () => { current = false }
  }, [])
  const filtered = useMemo(() => rows.filter((row) => filter === 'all' || row.attention_state === filter), [rows, filter])
  return <><PageHeader eyebrow="Operación" title="Control de retornos"><select aria-label="Filtrar retornos" value={filter} onChange={(event) => setFilter(event.target.value)}><option value="all">Todos en recorrido</option><option value="due_soon">Próximos a retornar</option><option value="overdue">Hora estimada superada</option><option value="early_return">Retorno anticipado</option></select></PageHeader><Panel>{state === 'loading' ? <LoadingState rows={6}/> : state === 'error' ? <ErrorState retry={() => void load()}/> : filtered.length === 0 ? <EmptyState title="Sin retornos pendientes" detail="No hay personas en esta categoría."/> : <div className="table-scroll"><table><thead><tr><th>Visitante</th><th>Ascenso</th><th>Inicio</th><th>Retorno estimado</th><th>Estado operativo</th><th>Confirmación</th></tr></thead><tbody>{filtered.map((row) => <tr key={`${row.visit_id}-${row.user_id}`}><td><strong>{row.visitor_name}</strong></td><td>{row.join_code}</td><td>{formatDateTime(row.started_at)}</td><td>{formatDateTime(row.expected_return_at)}</td><td><StatusBadge value={row.attention_state}/></td><td>{row.checked_out_at ? formatDateTime(row.checked_out_at) : 'Pendiente'}</td></tr>)}</tbody></table></div>}</Panel></>
}
