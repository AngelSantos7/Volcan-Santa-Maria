import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  Panel,
  StatusBadge,
  Avatar,
} from '../components/ui';
import { formatDateTime, toHalfOpenRange } from '../lib/date-range';
import {
  getSensitiveDetails,
  getVisitorSummary,
  searchVisitors,
} from '../services/admin-service';
import type {
  AdminSession,
  SensitiveDetails,
  VisitorRow,
  VisitorSummary,
} from '../types';
import { VisitorRegistrationModal } from '../components/AdministrativeModals';

function maskPhone(phone?: string | null) {
  if (!phone) return '••••••••';
  return `${phone.slice(0, 4)} •••• ••${phone.slice(-2)}`;
}

function maskDocument(value?: string | null) {
  if (!value) return '••••••••••';
  return `•••••••••${value.slice(-4)}`;
}

function VisitorDrawer({
  visitor,
  session,
  close,
}: {
  visitor: VisitorRow;
  session: AdminSession;
  close: () => void;
}) {
  const [summary, setSummary] = useState<VisitorSummary | null>(null);
  const [sensitive, setSensitive] = useState<SensitiveDetails | null>(null);
  const [documentsShown, setDocumentsShown] = useState(false);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    void getVisitorSummary(visitor.user_id, visitor.visit_id)
      .then(setSummary)
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));
  }, [visitor]);

  async function revealSensitive(includeDocuments: boolean) {
    try {
      const result = await getSensitiveDetails(
        visitor.user_id,
        includeDocuments
      );
      setSensitive((current) => ({ ...(current ?? result), ...result }));
      if (includeDocuments) setDocumentsShown(true);
    } catch {
      setFailed(true);
    }
  }

  const canSensitive =
    session.role === 'admin' || session.permissions.can_view_sensitive_data;
  const canDocuments =
    session.role === 'admin' || session.permissions.can_view_identity_documents;
  return (
    <div
      className="drawer-layer"
      role="dialog"
      aria-modal="true"
      aria-labelledby="visitor-title"
    >
      <button
        type="button"
        className="drawer-backdrop"
        aria-label="Cerrar expediente"
        onClick={close}
      />
      <aside className="drawer">
        <div className="drawer-header">
          <div>
            <p className="eyebrow">Expediente del visitante</p>
            <h2 id="visitor-title">{visitor.full_name}</h2>
          </div>
          <button
            type="button"
            className="close-button"
            onClick={close}
            aria-label="Cerrar"
          >
            ×
          </button>
        </div>
        {loading ? (
          <LoadingState rows={6} />
        ) : failed || !summary ? (
          <ErrorState />
        ) : (
          <div className="drawer-body">
            <div className="profile-heading">
              <Avatar
                name={visitor.full_name}
                preset={visitor.avatar_preset}
                path={visitor.avatar_path}
              />
              <div>
                <strong>{visitor.full_name}</strong>
                <span>
                  {summary.nationality_country_code ??
                    'Nacionalidad no registrada'}
                </span>
              </div>
              <StatusBadge value={summary.member_status} />
            </div>
            <div className="provenance-row">
              {summary.registration_origin === 'administrative' && (
                <span className="provenance-badge">
                  Registrado por administración
                </span>
              )}
              {summary.creation_origin === 'administrative' && (
                <span className="provenance-badge">
                  Creado por administración
                </span>
              )}
              {summary.finalized_by_administration && (
                <span className="provenance-badge">
                  Finalizado por administración
                </span>
              )}
            </div>
            <section className="detail-section">
              <h3>Información personal</h3>
              <dl className="detail-grid">
                <div>
                  <dt>Fecha de nacimiento</dt>
                  <dd>{sensitive?.date_of_birth ?? '•• / •• / ••••'}</dd>
                </div>
                <div>
                  <dt>Teléfono</dt>
                  <dd>
                    {sensitive
                      ? (sensitive.phone ?? 'No registrado')
                      : maskPhone()}
                  </dd>
                </div>
              </dl>
              {!sensitive && canSensitive && (
                <button
                  type="button"
                  className="text-button"
                  onClick={() => void revealSensitive(false)}
                >
                  Mostrar datos sensibles
                </button>
              )}
              {!canSensitive && (
                <p className="permission-note">
                  Su perfil no permite ver datos sensibles.
                </p>
              )}
            </section>
            <section className="detail-section">
              <h3>Documento de identidad</h3>
              <dl className="detail-grid">
                <div>
                  <dt>Tipo</dt>
                  <dd>
                    {documentsShown
                      ? (sensitive?.document_type?.toUpperCase() ??
                        'No registrado')
                      : 'Documento'}
                  </dd>
                </div>
                <div>
                  <dt>Número</dt>
                  <dd>
                    {documentsShown
                      ? (sensitive?.document_number ?? 'No registrado')
                      : maskDocument()}
                  </dd>
                </div>
              </dl>
              {!documentsShown && canSensitive && canDocuments && (
                <button
                  type="button"
                  className="text-button"
                  onClick={() => void revealSensitive(true)}
                >
                  Mostrar documento completo
                </button>
              )}
              {!canDocuments && (
                <p className="permission-note">
                  No cuenta con permiso para documentos completos.
                </p>
              )}
            </section>
            <section className="detail-section">
              <h3>Contacto de emergencia</h3>
              {sensitive ? (
                sensitive.emergency_contact ? (
                  <dl className="detail-grid">
                    <div>
                      <dt>Nombre</dt>
                      <dd>
                        {sensitive.emergency_contact.first_name}{' '}
                        {sensitive.emergency_contact.last_name}
                      </dd>
                    </div>
                    <div>
                      <dt>Relación</dt>
                      <dd>{sensitive.emergency_contact.relationship}</dd>
                    </div>
                    <div>
                      <dt>Teléfono</dt>
                      <dd>{sensitive.emergency_contact.phone}</dd>
                    </div>
                  </dl>
                ) : (
                  <p className="muted">No registrado.</p>
                )
              ) : (
                <p className="masked-line">Contacto •••••••• · {maskPhone()}</p>
              )}
            </section>
            <section className="detail-section">
              <h3>Ascenso actual</h3>
              <dl className="detail-grid">
                <div>
                  <dt>Código</dt>
                  <dd>{summary.join_code}</dd>
                </div>
                <div>
                  <dt>Grupo</dt>
                  <dd>
                    {summary.participant_count} participante
                    {summary.participant_count === 1 ? '' : 's'}
                  </dd>
                </div>
                <div>
                  <dt>Tipo</dt>
                  <dd>
                    {summary.visit_type === 'day_hike'
                      ? 'Ascenso del día'
                      : 'Expedición con campamento'}
                  </dd>
                </div>
                <div>
                  <dt>Inicio planificado</dt>
                  <dd>{formatDateTime(summary.planned_start_at)}</dd>
                </div>
                <div>
                  <dt>Inicio real</dt>
                  <dd>{formatDateTime(summary.started_at)}</dd>
                </div>
                <div>
                  <dt>Retorno estimado</dt>
                  <dd>{formatDateTime(summary.expected_return_at)}</dd>
                </div>
              </dl>
            </section>
            <section className="detail-section">
              <h3>Historial relevante</h3>
              {summary.history.length === 0 ? (
                <p className="muted">Sin historial.</p>
              ) : (
                <div className="history-list">
                  {summary.history.slice(0, 6).map((item) => (
                    <div key={String(item.visit_id)}>
                      <StatusBadge value={String(item.member_status)} />
                      <span>
                        {String(item.join_code)} ·{' '}
                        {formatDateTime(
                          item.started_at ?? item.planned_start_at
                        )}
                      </span>
                      {item.creation_origin === 'administrative' && (
                        <span className="provenance-badge">
                          Creado por administración
                        </span>
                      )}
                      {item.finalized_by_administration && (
                        <span className="provenance-badge">
                          Finalizado por administración
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </aside>
    </div>
  );
}

export function VisitorsPage({ session }: { session: AdminSession }) {
  const canView =
    session.role === 'admin' || Boolean(session.permissions.can_view_visitors);
  const [rows, setRows] = useState<VisitorRow[]>([]);
  const [loading, setLoading] = useState(canView);
  const [failed, setFailed] = useState(false);
  const [selected, setSelected] = useState<VisitorRow | null>(null);
  const [registering, setRegistering] = useState(false);
  const [notice, setNotice] = useState('');
  const [filters, setFilters] = useState({
    search: '',
    status: 'all',
    from: '',
    to: '',
  });

  const load = useCallback(
    async (current = filters) => {
      setLoading(true);
      setFailed(false);
      try {
        const dates =
          current.from && current.to
            ? toHalfOpenRange(current.from, current.to)
            : null;
        setRows(
          await searchVisitors({
            search: current.search,
            status: current.status,
            from: dates?.from,
            to: dates?.to,
          })
        );
      } catch {
        setFailed(true);
      } finally {
        setLoading(false);
      }
    },
    [filters]
  );

  useEffect(() => {
    if (!canView) {
      return;
    }
    let current = true;
    void searchVisitors({ status: 'all' })
      .then((result) => {
        if (current) setRows(result);
      })
      .catch(() => {
        if (current) setFailed(true);
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [canView]);

  function submit(event: FormEvent) {
    event.preventDefault();
    void load();
  }
  return (
    <>
      <PageHeader eyebrow="Operación" title="Visitantes">
        {(session.role === 'admin' ||
          session.permissions.can_register_walk_in_visitors) && (
          <button
            type="button"
            className="primary-action"
            onClick={() => setRegistering(true)}
          >
            Registrar visitante
          </button>
        )}
      </PageHeader>
      {notice && (
        <div className="alert success" role="status">
          {notice}
        </div>
      )}
      {canView ? (
        <>
          <Panel>
            <form className="filters" onSubmit={submit}>
              <label>
                Buscar por nombre
                <input
                  type="search"
                  placeholder="Nombre o apellido"
                  value={filters.search}
                  onChange={(event) =>
                    setFilters({ ...filters, search: event.target.value })
                  }
                />
              </label>
              <label>
                Estado
                <select
                  value={filters.status}
                  onChange={(event) =>
                    setFilters({ ...filters, status: event.target.value })
                  }
                >
                  <option value="all">Todos</option>
                  <option value="active">En recorrido</option>
                  <option value="returning_early">Retorno anticipado</option>
                  <option value="returned_early">Retornó antes</option>
                  <option value="completed">Completado</option>
                </select>
              </label>
              <label>
                Desde
                <input
                  type="date"
                  value={filters.from}
                  onChange={(event) =>
                    setFilters({ ...filters, from: event.target.value })
                  }
                />
              </label>
              <label>
                Hasta
                <input
                  type="date"
                  min={filters.from}
                  value={filters.to}
                  onChange={(event) =>
                    setFilters({ ...filters, to: event.target.value })
                  }
                />
              </label>
              <button type="submit">Aplicar filtros</button>
            </form>
          </Panel>
          <Panel>
            {loading ? (
              <LoadingState rows={6} />
            ) : failed ? (
              <ErrorState retry={() => void load()} />
            ) : rows.length === 0 ? (
              <EmptyState
                title="Sin visitantes"
                detail="No hay registros que coincidan con estos filtros."
              />
            ) : (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Visitante</th>
                      <th>Nacionalidad</th>
                      <th>Modalidad</th>
                      <th>Estado</th>
                      <th>Inicio</th>
                      <th>Retorno estimado</th>
                      <th>
                        <span className="sr-only">Acción</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={`${row.visit_id}-${row.user_id}`}>
                        <td>
                          <div className="person-cell">
                            <Avatar
                              name={row.full_name}
                              preset={row.avatar_preset}
                              path={row.avatar_path}
                            />
                            <strong>{row.full_name}</strong>
                          </div>
                        </td>
                        <td>{row.nationality_country_code ?? '—'}</td>
                        <td>
                          {row.group_type === 'group'
                            ? `Grupo · ${row.participant_count}`
                            : 'Individual'}
                        </td>
                        <td>
                          <StatusBadge value={row.member_status} />
                        </td>
                        <td>
                          {formatDateTime(
                            row.started_at ?? row.planned_start_at
                          )}
                        </td>
                        <td>{formatDateTime(row.expected_return_at)}</td>
                        <td>
                          <button
                            type="button"
                            className="table-action"
                            onClick={() => setSelected(row)}
                          >
                            Ver expediente
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </>
      ) : (
        <Panel>
          <EmptyState
            title="Registro presencial habilitado"
            detail="Puede registrar visitantes. Su perfil no incluye permiso para consultar expedientes existentes."
          />
        </Panel>
      )}
      {selected && (
        <VisitorDrawer
          visitor={selected}
          session={session}
          close={() => setSelected(null)}
        />
      )}
      {registering && (
        <VisitorRegistrationModal
          close={() => setRegistering(false)}
          onRegistered={(visitor) => {
            setRegistering(false);
            const name =
              'full_name' in visitor
                ? visitor.full_name
                : `${visitor.first_name} ${visitor.last_name}`;
            setNotice('Visitante registrado correctamente.');
            const nextFilters = { ...filters, search: name, status: 'all' };
            setFilters(nextFilters);
            void load(nextFilters);
          }}
        />
      )}
    </>
  );
}
