import { useState } from 'react';
import { ErrorState, LoadingState, PageHeader, Panel } from '../components/ui';
import {
  rangeForPeriod,
  toHalfOpenRange,
  type DateRange,
  type Period,
} from '../lib/date-range';
import { generateVisitorReport } from '../services/admin-service';
import type { VisitorReportData } from '../types';

export function ReportsPage() {
  const [period, setPeriod] = useState<Period>('today');
  const [range, setRange] = useState<DateRange>(() => rangeForPeriod('today'));
  const [customFrom, setCustomFrom] = useState(range.fromDate);
  const [customTo, setCustomTo] = useState(range.toDate);
  const [reportType, setReportType] = useState<'summary' | 'detailed'>(
    'summary'
  );
  const [data, setData] = useState<VisitorReportData | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle');
  function choosePeriod(next: Period) {
    setPeriod(next);
    setData(null);
    if (next !== 'custom') setRange(rangeForPeriod(next));
  }
  function applyCustom() {
    if (customFrom && customTo && customFrom <= customTo) {
      setRange(toHalfOpenRange(customFrom, customTo));
      setData(null);
    }
  }
  async function generate() {
    setState('loading');
    try {
      setData(await generateVisitorReport(range.from, range.to, reportType));
      setState('idle');
    } catch {
      setState('error');
    }
  }
  return (
    <>
      <PageHeader eyebrow="Información institucional" title="Reportes">
        <div className="period-tabs" role="group" aria-label="Período">
          {(['today', 'week', 'month', 'custom'] as Period[]).map((value) => (
            <button
              type="button"
              key={value}
              className={period === value ? 'selected' : ''}
              onClick={() => choosePeriod(value)}
            >
              {
                {
                  today: 'Hoy',
                  week: 'Semana',
                  month: 'Mes',
                  custom: 'Rango personalizado',
                }[value]
              }
            </button>
          ))}
        </div>
      </PageHeader>
      {period === 'custom' && (
        <Panel className="range-panel">
          <div className="filters compact">
            <label>
              Desde
              <input
                type="date"
                value={customFrom}
                onChange={(event) => setCustomFrom(event.target.value)}
              />
            </label>
            <label>
              Hasta
              <input
                type="date"
                min={customFrom}
                value={customTo}
                onChange={(event) => setCustomTo(event.target.value)}
              />
            </label>
            <button type="button" onClick={applyCustom}>
              Aplicar
            </button>
          </div>
        </Panel>
      )}
      <Panel title="Generar reporte">
        <div className="report-controls">
          <label>
            Tipo de reporte
            <select
              value={reportType}
              onChange={(event) => {
                setReportType(event.target.value as 'summary' | 'detailed');
                setData(null);
              }}
            >
              <option value="summary">Reporte resumido</option>
              <option value="detailed">Reporte detallado</option>
            </select>
          </label>
          <div>
            <span>Período seleccionado</span>
            <strong>
              {range.fromDate} - {range.toDate}
            </strong>
          </div>
          <button
            type="button"
            onClick={() => void generate()}
            disabled={state === 'loading'}
          >
            {state === 'loading' ? 'Generando…' : 'Generar reporte'}
          </button>
        </div>
      </Panel>
      {state === 'error' && <ErrorState retry={() => void generate()} />}{' '}
      {state === 'loading' && <LoadingState rows={4} />}{' '}
      {data && (
        <Panel title="Vista previa de cifras">
          <div className="report-summary-grid">
            <div>
              <strong>{data.summary.visitors_registered}</strong>
              <span>Visitantes registrados</span>
            </div>
            <div>
              <strong>{data.summary.entries_registered}</strong>
              <span>Ingresos</span>
            </div>
            <div>
              <strong>{data.summary.exits_registered}</strong>
              <span>Egresos</span>
            </div>
            <div>
              <strong>{data.summary.currently_on_route}</strong>
              <span>En recorrido</span>
            </div>
            <div>
              <strong>{data.summary.ascents_started}</strong>
              <span>Ascensos iniciados</span>
            </div>
            <div>
              <strong>{data.summary.ascents_completed}</strong>
              <span>Ascensos completados</span>
            </div>
          </div>
          <div className="form-actions">
            <button
              type="button"
              onClick={() =>
                void import('../lib/report-pdf').then(
                  ({ saveVisitorReportPdf }) =>
                    saveVisitorReportPdf(data, range.fromDate, range.toDate)
                )
              }
            >
              Exportar PDF
            </button>
          </div>
        </Panel>
      )}
    </>
  );
}
