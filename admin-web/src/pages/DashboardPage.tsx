import { useCallback, useEffect, useState } from 'react'
import { formatDateTime, formatShortDate, rangeForPeriod, toHalfOpenRange, type DateRange, type Period } from '../lib/date-range'
import { getDashboard, getOperationalDashboard } from '../services/admin-service'
import type { DashboardPoint, DashboardStats, OperationalDashboard } from '../types'
import { ErrorState, LoadingState, PageHeader, Panel } from '../components/ui'

function Kpi({ value, label, tone = 'default' }: { value: number; label: string; tone?: string }) {
  return <div className={`kpi ${tone}`}><strong>{value.toLocaleString('es-GT')}</strong><span>{label}</span></div>
}

function VisitorChart({ data }: { data: DashboardPoint[] }) {
  const max = Math.max(1, ...data.map((point) => point.visitors))
  const width = 900
  const height = 210
  const points = data.map((point, index) => {
    const x = data.length === 1 ? width / 2 : (index / Math.max(1, data.length - 1)) * width
    const y = height - (point.visitors / max) * (height - 25)
    return { ...point, x, y }
  })
  const line = points.map((point) => `${point.x},${point.y}`).join(' ')
  return <div className="chart-wrap">
    <svg className="chart" viewBox={`0 0 ${width} ${height + 35}`} role="img" aria-label="Visitantes con ingreso por fecha">
      {[0, .25, .5, .75, 1].map((ratio) => <line key={ratio} x1="0" x2={width} y1={height - ratio * (height - 25)} y2={height - ratio * (height - 25)} className="grid-line" />)}
      {points.length > 1 && <polygon points={`0,${height} ${line} ${width},${height}`} className="chart-area" />}
      <polyline points={line} className="chart-line" />
      {points.map((point, index) => <g key={point.report_date}>
        <circle cx={point.x} cy={point.y} r="5" className="chart-dot"><title>{formatShortDate(point.report_date)} · {point.visitors} visitantes</title></circle>
        {(data.length <= 10 || index % Math.ceil(data.length / 7) === 0 || index === data.length - 1) && <text x={point.x} y={height + 25} textAnchor="middle">{formatShortDate(point.report_date)}</text>}
      </g>)}
    </svg>
  </div>
}

export function DashboardPage({ onOpenAscent }: { onOpenAscent: (joinCode: string) => void }) {
  const [period, setPeriod] = useState<Period>('today')
  const [range, setRange] = useState<DateRange>(() => rangeForPeriod('today'))
  const [customFrom, setCustomFrom] = useState(range.fromDate)
  const [customTo, setCustomTo] = useState(range.toDate)
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [series, setSeries] = useState<DashboardPoint[]>([])
  const [operational, setOperational] = useState<OperationalDashboard | null>(null)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)

  const load = useCallback(async (selectedRange: DateRange) => {
    setLoading(true); setFailed(false)
    try {
      const [result, operation] = await Promise.all([getDashboard(selectedRange.from, selectedRange.to), getOperationalDashboard()])
      setStats(result.stats); setSeries(result.series); setOperational(operation)
    } catch { setFailed(true) } finally { setLoading(false) }
  }, [])

  useEffect(() => {
    let current = true
    void Promise.all([getDashboard(range.from, range.to), getOperationalDashboard()]).then(([result, operation]) => {
      if (!current) return
      setStats(result.stats); setSeries(result.series); setOperational(operation); setFailed(false)
    }).catch(() => { if (current) setFailed(true) }).finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  }, [range])

  function choosePeriod(next: Period) {
    setPeriod(next)
    if (next !== 'custom') { setLoading(true); setRange(rangeForPeriod(next)) }
  }

  function applyCustom() {
    if (!customFrom || !customTo || customFrom > customTo) return
    setLoading(true)
    setRange(toHalfOpenRange(customFrom, customTo))
  }

  return <>
    <PageHeader eyebrow="Control de visitantes" title="Dashboard">
      <div className="period-tabs" role="group" aria-label="Período">
        {(['today', 'week', 'month', 'custom'] as Period[]).map((value) => <button type="button" key={value} className={period === value ? 'selected' : ''} onClick={() => choosePeriod(value)}>{({ today: 'Hoy', week: 'Semana', month: 'Mes', custom: 'Rango' })[value]}</button>)}
      </div>
    </PageHeader>
    {period === 'custom' && <Panel className="range-panel"><div className="filters compact"><label>Desde<input type="date" value={customFrom} onChange={(event) => setCustomFrom(event.target.value)} /></label><label>Hasta<input type="date" min={customFrom} value={customTo} onChange={(event) => setCustomTo(event.target.value)} /></label><button type="button" onClick={applyCustom}>Aplicar</button></div></Panel>}
    {failed ? <ErrorState retry={() => void load(range)} /> : loading || !stats || !operational ? <LoadingState rows={6} /> : <>
      <section className="metric-section operational-summary"><div className="section-title"><span>Operación en tiempo real</span><small>Estado actual</small></div><div className="kpi-grid five"><Kpi value={operational.people_on_route} label={`Personas en recorrido · ${operational.adults_on_route} adultos · ${operational.minors_on_route} menores`} tone="mint"/><Kpi value={operational.active_ascents} label="Ascensos activos"/><Kpi value={operational.pending_return_ascents} label="Retornos pendientes"/><Kpi value={operational.overdue_ascents} label="Retornos atrasados" tone={operational.overdue_ascents ? 'warning' : 'default'}/><Kpi value={operational.planned_today} label="Planificados hoy"/></div></section>
      {operational.attention.length > 0 && <Panel title="Requiere atención" className="attention-list">{operational.attention.map((item) => <article className="attention-card" key={item.visit_id}><div><span className="attention-icon">!</span><div><strong>Grupo {item.join_code}</strong><p>Retorno esperado: {formatDateTime(item.expected_return_at)} · Atraso: {item.minutes_late} min · {item.pending_people} personas pendientes</p></div></div><button type="button" className="table-action" onClick={() => onOpenAscent(item.join_code)}>Ver ascenso</button></article>)}</Panel>}
      <section className="metric-section"><div className="section-title"><span>Visitantes</span><small>{range.fromDate} — {range.toDate}</small></div><div className="kpi-grid four"><Kpi value={stats.adults_count} label="Adultos"/><Kpi value={stats.minors_count} label="Menores"/><Kpi value={stats.total_visitors} label="Total visitantes" tone="mint"/><Kpi value={stats.currently_on_route} label="Actualmente en recorrido" tone="mint"/></div><div className="micro-metrics"><span><b>{stats.visitors_registered}</b> cuentas registradas</span><span><b>{stats.entries_registered}</b> ingresos</span><span><b>{stats.exits_registered}</b> egresos</span></div></section>
      <section className="metric-section"><div className="section-title"><span>Ascensos</span><small>Una salida puede incluir varios visitantes</small></div><div className="kpi-grid three"><Kpi value={stats.ascents_total} label="Total del período"/><Kpi value={stats.ascents_group} label="Grupales"/><Kpi value={stats.ascents_individual} label="Individuales"/></div><div className="micro-metrics"><span><b>{stats.ascents_started}</b> iniciados</span><span><b>{stats.ascents_scheduled}</b> programados</span><span><b>{stats.ascents_completed}</b> completados</span><span><b>{stats.early_returns}</b> retornos anticipados</span></div></section>
      {stats.pending_returns > 0 && <div className="attention-card"><div><span className="attention-icon">!</span><div><strong>Retornos pendientes</strong><p>Hay personas en visitas activas cuya hora estimada ya fue superada.</p></div></div><b>{stats.pending_returns}</b></div>}
      <Panel title="Visitantes por fecha"><VisitorChart data={series}/></Panel>
      <Panel title="Resumen diario"><div className="table-scroll"><table><thead><tr><th>Fecha</th><th>Visitantes</th><th>Ascensos</th><th>Egresos</th><th>Retornos anticipados</th></tr></thead><tbody>{series.map((point) => <tr key={point.report_date}><td>{formatShortDate(point.report_date)}</td><td>{point.visitors}</td><td>{point.ascents}</td><td>{point.exits}</td><td>{point.early_returns}</td></tr>)}</tbody></table></div></Panel>
    </>}
  </>
}
