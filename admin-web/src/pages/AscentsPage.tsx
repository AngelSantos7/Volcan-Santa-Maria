import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from 'react';
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
  const [search, setSearch] = useState('');
  const [activeSearch, setActiveSearch] = useState('');
  const canManage =
    session.role === 'admin' || Boolean(session.permissions.can_manage_visits);
  const canConfirmReturns =
    session.role === 'admin' ||
    Boolean(session.permissions.can_confirm_returns);
  const operationalStatus = (row: AscentRow) => {
    if (row.visit_status !== 'forming') return row.visit_status;
    if (!row.planned_start_at) return 'in_preparation';
    const planned = new Date(row.planned_start_at);
    const today = new Date();
    return planned.toDateString() === today.toDateString()
      ? 'scheduled_today'
      : planned > today
        ? 'scheduled_future'
        : 'in_preparation';
  };
  const visibleRows = useMemo(
    () =>
      rows
        .filter((row) => {
          const current = operationalStatus(row);
          if (status === 'all') return true;
          if (status === 'forming') return current === 'in_preparation';
          if (status === 'scheduled')
            return (
              current === 'scheduled_today' || current === 'scheduled_future'
            );
          return current === status;
        })
        .toSorted((first, second) => {
          const rank = (row: AscentRow) => {
            const current = operationalStatus(row);
            if (
              current === 'in_progress' &&
              row.expected_return_at &&
              Date.parse(row.expected_return_at) < Date.now()
            )
              return 0;
            return (
              (
                {
                  in_progress: 1,
                  in_preparation: 3,
                  scheduled_today: 4,
                  scheduled_future: 5,
                  completed: 6,
                  cancelled: 7,
                } as Record<string, number>
              )[current] ?? 8
            );
          };
          const difference = rank(first) - rank(second);
          if (difference) return difference;
          const date = (row: AscentRow) =>
            Date.parse(
              row.visit_status === 'in_progress'
                ? (row.expected_return_at ?? '')
                : (row.planned_start_at ?? row.completed_at ?? '')
            ) || 0;
          return date(first) - date(second);
        }),
    [rows, status]
  );
  const load = useCallback(async (query = '') => {
    setState('loading');
    try {
      setRows(await listAscents('all', query));
      setState('success');
    } catch {
      setState('error');
    }
  }, []);
  useEffect(() => {
    let current = true;
    void listAscents('all')
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
  }, []);
  async function start(row: AscentRow) {
    setMessage('');
    try {
      await startAdministrativeVisit(row.visit_id);
      setMessage(`Ascenso ${row.join_code} iniciado.`);
      await load(activeSearch);
    } catch (reason) {
      setMessage(
        reason instanceof Error
          ? reason.message
          : 'No fue posible iniciar el ascenso.'
      );
    }
  }
  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = search.trim();
    setActiveSearch(query);
    void load(query);
  }
  return (
    <>
      <PageHeader eyebrow="Operación" title="Ascensos">
        <select
          aria-label="Filtrar ascensos"
          value={status}
          onChange={(event) => {
            setStatus(event.target.value);
          }}
        >
          <option value="all">Todos</option>
          <option value="forming">En preparación</option>
          <option value="scheduled">Planificados</option>
          <option value="in_progress">En recorrido</option>
          <option value="completed">Completados</option>
          <option value="cancelled">Cancelados</option>
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
      <Panel className="ascent-search-panel">
        <form className="ascent-search" onSubmit={submitSearch}>
          <label>
            Buscar ascenso o menor
            <input
              type="search"
              value={search}
              placeholder="Código, organizador o nombre del menor"
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <button type="submit">Buscar</button>
          {activeSearch && (
            <button
              type="button"
              className="secondary"
              onClick={() => {
                setSearch('');
                setActiveSearch('');
                void load();
              }}
            >
              Limpiar
            </button>
          )}
        </form>
      </Panel>
      <Panel>
        {state === 'loading' ? (
          <LoadingState rows={6} />
        ) : state === 'error' ? (
          <ErrorState retry={() => void load()} />
        ) : visibleRows.length === 0 ? (
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
                {visibleRows.map((row) => (
                  <tr key={row.visit_id}>
                    <td>
                      <strong>{row.join_code}</strong>
                    </td>
                    <td>
                      {row.organizer_name}
                      {row.minor_matches.map((minor) => (
                        <small
                          className="minor-search-match"
                          key={minor.full_name}
                        >
                          {minor.full_name} · Menor a cargo de{' '}
                          {minor.responsible_name}
                        </small>
                      ))}
                    </td>
                    <td>
                      {row.visit_type === 'day_hike' ? 'Día' : 'Campamento'}
                    </td>
                    <td>
                      <strong>{row.participant_count}</strong>
                      <small className="participant-breakdown">
                        {row.adult_count} adulto
                        {row.adult_count === 1 ? '' : 's'} · {row.minor_count}{' '}
                        menor{row.minor_count === 1 ? '' : 'es'}
                      </small>
                    </td>
                    <td>{formatDateTime(row.planned_start_at)}</td>
                    <td>{formatDateTime(row.started_at)}</td>
                    <td>{formatDateTime(row.expected_return_at)}</td>
                    <td>
                      <StatusBadge value={operationalStatus(row)} />
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
            void listAscents('all')
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
            void load(activeSearch);
          }}
        />
      )}
    </>
  );
}
