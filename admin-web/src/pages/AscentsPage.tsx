import { useCallback, useEffect, useState } from 'react';
import {
  AscentCreationModal,
  AscentDetailsModal,
} from '../components/AdministrativeModals';
import {
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  Panel,
  StatusBadge,
} from '../components/ui';
import { formatDateTime } from '../lib/date-range';
import {
  listAscents,
  startAdministrativeVisit,
} from '../services/admin-service';
import type { AdminSession, AscentRow } from '../types';

export function AscentsPage({ session }: { session: AdminSession }) {
  const [status, setStatus] = useState('all');
  const [rows, setRows] = useState<AscentRow[]>([]);
  const [state, setState] = useState<'loading' | 'success' | 'error'>(
    'loading'
  );
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<AscentRow | null>(null);
  const [message, setMessage] = useState('');
  const canManage =
    session.role === 'admin' || Boolean(session.permissions.can_manage_visits);
  const canConfirmReturns =
    session.role === 'admin' ||
    Boolean(session.permissions.can_confirm_returns);
  const load = useCallback(async () => {
    setState('loading');
    try {
      setRows(await listAscents(status));
      setState('success');
    } catch {
      setState('error');
    }
  }, [status]);
  useEffect(() => {
    let current = true;
    void listAscents(status)
      .then((result) => {
        if (current) {
          setRows(result);
          setState('success');
        }
      })
      .catch(() => {
        if (current) setState('error');
      });
    return () => {
      current = false;
    };
  }, [status]);
  async function start(row: AscentRow) {
    setMessage('');
    try {
      await startAdministrativeVisit(row.visit_id);
      setMessage(`Ascenso ${row.join_code} iniciado.`);
      await load();
    } catch (reason) {
      setMessage(
        reason instanceof Error
          ? reason.message
          : 'No fue posible iniciar el ascenso.'
      );
    }
  }
  return (
    <>
      <PageHeader eyebrow="Operación" title="Ascensos">
        <select
          aria-label="Filtrar ascensos"
          value={status}
          onChange={(event) => {
            setState('loading');
            setStatus(event.target.value);
          }}
        >
          <option value="all">Todos</option>
          <option value="scheduled">Programados</option>
          <option value="in_progress">En curso</option>
          <option value="completed">Finalizados</option>
        </select>
        {canManage && (
          <button
            type="button"
            className="primary-action"
            onClick={() => setCreating(true)}
          >
            Crear ascenso
          </button>
        )}
      </PageHeader>
      {message && (
        <div className="alert success" role="status">
          {message}
        </div>
      )}
      <Panel>
        {state === 'loading' ? (
          <LoadingState rows={6} />
        ) : state === 'error' ? (
          <ErrorState retry={() => void load()} />
        ) : rows.length === 0 ? (
          <EmptyState
            title="Sin ascensos"
            detail="No hay ascensos en este estado."
          />
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Organizador</th>
                  <th>Tipo</th>
                  <th>Participantes</th>
                  <th>Inicio planificado</th>
                  <th>Inicio real</th>
                  <th>Retorno estimado</th>
                  <th>Estado</th>
                  <th>Origen / finalización</th>
                  <th>
                    <span className="sr-only">Acción</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.visit_id}>
                    <td>
                      <strong>{row.join_code}</strong>
                    </td>
                    <td>{row.organizer_name}</td>
                    <td>
                      {row.visit_type === 'day_hike' ? 'Día' : 'Campamento'}
                    </td>
                    <td>{row.participant_count}</td>
                    <td>{formatDateTime(row.planned_start_at)}</td>
                    <td>{formatDateTime(row.started_at)}</td>
                    <td>{formatDateTime(row.expected_return_at)}</td>
                    <td>
                      <StatusBadge value={row.visit_status} />
                    </td>
                    <td>
                      <div className="provenance-row">
                        {row.creation_origin === 'administrative' && (
                          <span className="provenance-badge">
                            Creado por administración
                          </span>
                        )}
                        {row.finalized_by_administration && (
                          <span className="provenance-badge">
                            Finalizado por administración
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      <div className="row-actions">
                        <button
                          type="button"
                          className="table-action"
                          onClick={() => setSelected(row)}
                        >
                          Ver detalle
                        </button>
                        {canManage &&
                          row.creation_origin === 'administrative' &&
                          row.visit_status === 'forming' && (
                            <button
                              type="button"
                              className="table-action"
                              onClick={() => void start(row)}
                            >
                              Iniciar ascenso
                            </button>
                          )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      {creating && (
        <AscentCreationModal
          close={() => setCreating(false)}
          onCreated={(result) => {
            setCreating(false);
            setMessage(
              `Ascenso creado correctamente. Código: ${result.join_code}. Participantes: ${result.participant_count}. Creado por administración.`
            );
            void listAscents(status)
              .then((nextRows) => {
                setRows(nextRows);
                setSelected(
                  nextRows.find((row) => row.visit_id === result.visit_id) ??
                    null
                );
                setState('success');
              })
              .catch(() => setState('error'));
          }}
        />
      )}
      {selected && (
        <AscentDetailsModal
          ascent={selected}
          canConfirmReturns={canConfirmReturns}
          close={() => setSelected(null)}
          onChanged={() => {
            setMessage('Retorno administrativo registrado.');
            void load();
          }}
        />
      )}
    </>
  );
}
