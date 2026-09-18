import { useCallback, useEffect, useState } from 'react'
import { EmptyState, ErrorState, LoadingState, PageHeader, Panel, StatusBadge } from '../components/ui'
import { formatDateTime } from '../lib/date-range'
import { listAscents } from '../services/admin-service'
import type { AscentRow } from '../types'

export function AscentsPage() {
  const [status, setStatus] = useState('all')
  const [rows, setRows] = useState<AscentRow[]>([])
  const [state, setState] = useState<'loading' | 'success' | 'error'>('loading')
  const load = useCallback(async () => {
    setState('loading')
    try { setRows(await listAscents(status)); setState('success') } catch { setState('error') }
  }, [status])
  useEffect(() => {
    let current = true
    void listAscents(status).then((result) => { if (current) { setRows(result); setState('success') } }).catch(() => { if (current) setState('error') })
    return () => { current = false }
  }, [status])
  return <><PageHeader eyebrow="Operación" title="Ascensos"><select aria-label="Filtrar ascensos" value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">Todos</option><option value="scheduled">Programados</option><option value="in_progress">En curso</option><option value="completed">Finalizados</option></select></PageHeader><Panel>{state === 'loading' ? <LoadingState rows={6}/> : state === 'error' ? <ErrorState retry={() => void load()}/> : rows.length === 0 ? <EmptyState title="Sin ascensos" detail="No hay ascensos en este estado."/> : <div className="table-scroll"><table><thead><tr><th>Código</th><th>Organizador</th><th>Tipo</th><th>Participantes</th><th>Inicio planificado</th><th>Inicio real</th><th>Retorno estimado</th><th>Estado</th></tr></thead><tbody>{rows.map((row) => <tr key={row.visit_id}><td><strong>{row.join_code}</strong></td><td>{row.organizer_name}</td><td>{row.visit_type === 'day_hike' ? 'Día' : 'Campamento'}</td><td>{row.participant_count}</td><td>{formatDateTime(row.planned_start_at)}</td><td>{formatDateTime(row.started_at)}</td><td>{formatDateTime(row.expected_return_at)}</td><td><StatusBadge value={row.visit_status}/></td></tr>)}</tbody></table></div>}</Panel></>
}
