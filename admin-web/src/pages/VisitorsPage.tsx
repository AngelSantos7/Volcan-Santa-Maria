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
import { formatDateTime } from '../lib/date-range';
import { countryName, departmentName } from '../lib/admin-form-utils';
import { adminLabel } from '../lib/admin-labels';
import {
  getIdentityDetails,
  getOperationalContacts,
  getVisitorSummary,
  listVisitorDirectory,
} from '../services/admin-service';
import type {
  AdminSession,
  IdentityDetails,
  OperationalContactDetails,
  VisitorDirectoryRow,
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

function directoryVisitor(row: VisitorDirectoryRow): VisitorRow {
  return {
    user_id: row.visitor_id,
    visit_id: row.latest_visit_id ?? '',
    full_name: row.full_name,
    nationality_country_code: row.nationality_country_code,
    department_code: row.department_code,
    sex: row.sex,
    registration_origin: row.registration_origin,
    ascent_count: row.ascent_count,
    last_ascent_at: row.last_ascent_at,
    avatar_kind: null,
    avatar_path: null,
    avatar_preset: null,
    group_type: 'individual',
    member_status: row.latest_member_status ?? 'no_active_ascent',
    visit_status: row.latest_visit_status ?? 'no_active_ascent',
    planned_start_at: row.last_ascent_at,
    started_at: row.last_ascent_at,
    expected_return_at: null,
    participant_count: 1,
    total_count: 1,
  };
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
  const [identity, setIdentity] = useState<IdentityDetails | null>(null);
  const [contacts, setContacts] = useState<OperationalContactDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [accessError, setAccessError] = useState('');

  useEffect(() => {
    void getVisitorSummary(visitor.user_id, visitor.visit_id)
      .then(setSummary)
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));
  }, [visitor]);

  async function revealIdentity() {
    try {
      setAccessError('');
      setIdentity(await getIdentityDetails(visitor.user_id));
    } catch {
      setAccessError('No fue posible consultar los datos de identidad con sus permisos actuales.');
    }
  }

  async function revealContacts() {
    try {
      setAccessError('');
      setContacts(await getOperationalContacts(visitor.user_id));
    } catch {
      setAccessError('Los teléfonos solo están disponibles durante un ascenso activo, pendiente o atrasado.');
    }
  }

  const canDocuments =
    session.role === 'admin' || session.permissions.can_view_identity_documents;
  const canContacts =
    session.role === 'admin' || session.permissions.can_view_emergency_contacts;
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
            {accessError && <div className="alert error" role="alert">{accessError}</div>}
            <div className="profile-heading">
              <Avatar
                name={visitor.full_name}
                preset={visitor.avatar_preset}
                path={visitor.avatar_path}
              />
              <div>
                <strong>{visitor.full_name}</strong>
                <span>
                  {countryName(summary.nationality_country_code)}
                  {visitor.nationality_country_code === 'GT' && visitor.department_code
                    ? ` · ${departmentName(visitor.department_code)}`
                    : ''}
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
                  <dt>Nacionalidad</dt>
                  <dd>{countryName(visitor.nationality_country_code)}</dd>
                </div>
                {visitor.nationality_country_code === 'GT' && (
                  <div>
                    <dt>Departamento</dt>
                    <dd>{departmentName(visitor.department_code)}</dd>
                  </div>
                )}
                <div>
                  <dt>Sexo</dt>
                  <dd>{visitor.sex === 'female' ? 'Femenino' : visitor.sex === 'male' ? 'Masculino' : 'No registrado'}</dd>
                </div>
                <div>
                  <dt>Fecha de nacimiento</dt>
                  <dd>{identity?.date_of_birth ?? '•• / •• / ••••'}</dd>
                </div>
              </dl>
              {!identity && canDocuments && (
                <button
                  type="button"
                  className="text-button"
                  onClick={() => void revealIdentity()}
                >
                  Mostrar identidad
                </button>
              )}
              {!canDocuments && (
                <p className="permission-note">
                  Su perfil no permite ver datos de identidad.
                </p>
              )}
            </section>
            <section className="detail-section">
              <h3>Documento de identidad</h3>
              <dl className="detail-grid">
                <div>
                  <dt>Tipo</dt>
                  <dd>
                    {identity
                      ? (identity.document_type?.toUpperCase() ??
                        'No registrado')
                      : 'Documento'}
                  </dd>
                </div>
                <div>
                  <dt>Número</dt>
                  <dd>
                    {identity
                      ? (identity.document_number ?? 'No registrado')
                      : maskDocument()}
                  </dd>
                </div>
              </dl>
              {!identity && canDocuments && (
                <button
                  type="button"
                  className="text-button"
                  onClick={() => void revealIdentity()}
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
              <h3>Teléfonos para emergencia operativa</h3>
              {contacts ? (
                <>
                  <dl className="detail-grid">
                    <div><dt>Teléfono personal</dt><dd>{contacts.phone ?? 'No registrado'}</dd></div>
                    <div><dt>Teléfono alternativo</dt><dd>{contacts.alternate_phone ?? 'No registrado'}</dd></div>
                  </dl>
                  {contacts.emergency_contact ? (
                  <dl className="detail-grid">
                    <div>
                      <dt>Nombre</dt>
                      <dd>
                        {contacts.emergency_contact.first_name}{' '}
                        {contacts.emergency_contact.last_name}
                      </dd>
                    </div>
                    <div>
                      <dt>Relación</dt>
                      <dd>{adminLabel(contacts.emergency_contact.relationship)}</dd>
                    </div>
                    <div>
                      <dt>Teléfono</dt>
                      <dd>{contacts.emergency_contact.phone}</dd>
                    </div>
                  </dl>
                  ) : <p className="muted">Contacto de emergencia no registrado.</p>}
                </>
              ) : (
                <>
                  <p className="masked-line">Contacto •••••••• · {maskPhone()}</p>
                  {canContacts ? <button type="button" className="text-button" onClick={() => void revealContacts()}>Consultar durante la operación</button> : <p className="permission-note">No cuenta con permiso para contactos de emergencia.</p>}
                </>
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
                    <article key={item.visit_id}>
                      <div className="history-ascent-heading">
                        <StatusBadge value={item.member_status} />
                        <span>
                          {item.join_code} ·{' '}
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
                      {item.minors.length > 0 && (
                        <div className="history-minors">
                          <strong>
                            {item.minors.length} menor
                            {item.minors.length === 1 ? '' : 'es'} acompañado
                            {item.minors.length === 1 ? '' : 's'}
                          </strong>
                          {item.minors.map((minor) => (
                            <span key={minor.id}>
                              {minor.full_name} · {minor.age} años ·{' '}
                              {adminLabel(minor.relationship)}
                            </span>
                          ))}
                        </div>
                      )}
                    </article>
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
  });

  const load = useCallback(
    async (current = filters) => {
      setLoading(true);
      setFailed(false);
      try {
        setRows((await listVisitorDirectory(current.search)).map(directoryVisitor));
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
    void listVisitorDirectory()
      .then((result) => {
        if (current) setRows(result.map(directoryVisitor));
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
              <button type="submit">Buscar</button>
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
                      <th>Procedencia</th>
                      <th>Ascensos</th>
                      <th>Último ascenso</th>
                      <th>Estado actual</th>
                      <th>
                        <span className="sr-only">Acción</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.user_id}>
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
                        <td>
                          {countryName(row.nationality_country_code)}
                          {row.nationality_country_code === 'GT' && row.department_code
                            ? ` · ${departmentName(row.department_code)}`
                            : ''}
                        </td>
                        <td>{row.ascent_count ?? 0}</td>
                        <td>{formatDateTime(row.last_ascent_at)}</td>
                        <td>
                          <StatusBadge
                            value={
                              row.visit_status === 'in_progress' || row.visit_status === 'pending_returns'
                                ? row.member_status
                                : 'no_active_ascent'
                            }
                          />
                        </td>
                        <td>
                          <button
                            type="button"
                            className="table-action"
                            onClick={() => setSelected(row)}
                            disabled={!row.visit_id}
                          >
                            {row.visit_id ? 'Ver visitante' : 'Sin ascensos'}
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
            const nextFilters = { ...filters, search: name };
            setFilters(nextFilters);
            void load(nextFilters);
          }}
        />
      )}
    </>
  );
}
