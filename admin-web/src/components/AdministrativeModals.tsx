import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import type { CountryCode } from 'libphonenumber-js';
import {
  createAdministrativeVisit,
  findVisitorByDocument,
  getAscentMembers,
  listVisitorDirectory,
  registerAdministrativeReturn,
  registerWalkInVisitor,
} from '../services/admin-service';
import type {
  AdministrativeVisitResult,
  AscentMemberRow,
  AscentRow,
  RegisteredVisitor,
  ReturnRow,
  VisitorDirectoryRow,
} from '../types';
import { formatDateTime, guatemalaToday } from '../lib/date-range';
import { CountryField, DateField, PhoneField } from './AdminFormFields';
import {
  emptyPhone,
  formatInternationalPhone,
  type PhoneValue,
} from '../lib/admin-form-utils';
import { StatusBadge } from './ui';

function formatSex(sex: 'male' | 'female' | null) {
  if (sex === 'male') return 'Masculino';
  if (sex === 'female') return 'Femenino';
  return 'Sin registrar';
}

function Modal({
  title,
  close,
  dirty = false,
  onDiscard,
  children,
}: {
  title: string;
  close: () => void;
  dirty?: boolean;
  onDiscard?: () => void;
  children: ReactNode;
}) {
  const [confirming, setConfirming] = useState(false);
  const requestClose = () => (dirty ? setConfirming(true) : close());
  useEffect(() => {
    const blockEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') event.preventDefault();
    };
    document.addEventListener('keydown', blockEscape);
    return () => document.removeEventListener('keydown', blockEscape);
  }, []);
  return (
    <div
      className="modal-layer"
      role="dialog"
      aria-modal="true"
      aria-labelledby="operation-title"
    >
      <div className="modal-backdrop" aria-hidden="true" />
      <section
        className="operation-modal"
        onClickCapture={(event) => {
          if (
            event.target instanceof HTMLElement &&
            event.target.closest('[data-modal-close]')
          ) {
            event.preventDefault();
            event.stopPropagation();
            requestClose();
          }
        }}
      >
        <header>
          <h2 id="operation-title">{title}</h2>
          <button
            type="button"
            className="close-button"
            onClick={requestClose}
            aria-label="Cerrar"
          >
            ×
          </button>
        </header>
        {children}
      </section>
      {confirming && (
        <div
          className="discard-layer"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="discard-title"
        >
          <section className="discard-dialog">
            <h3 id="discard-title">
              Tiene información sin guardar. ¿Desea salir y descartar los
              cambios?
            </h3>
            <div className="modal-actions">
              <button
                type="button"
                className="secondary"
                onClick={() => setConfirming(false)}
              >
                Continuar editando
              </button>
              <button
                type="button"
                className="danger-button"
                onClick={() => {
                  onDiscard?.();
                  close();
                }}
              >
                Descartar cambios
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function ErrorMessage({ value }: { value: string }) {
  return value ? (
    <div className="alert error" role="alert">
      {value}
    </div>
  ) : null;
}

interface VisitorDraft {
  firstName: string;
  lastName: string;
  nationality: CountryCode;
  dateOfBirth: string;
  sex: 'male' | 'female';
  phone: PhoneValue;
  alternatePhone: PhoneValue;
  documentType: 'dpi' | 'passport' | 'other';
  documentTypeDetail: string;
  documentNumber: string;
  emergencyFirstName: string;
  emergencyLastName: string;
  emergencyRelationship: string;
  emergencyPhone: PhoneValue;
}
const blankVisitorDraft = (): VisitorDraft => ({
  firstName: '',
  lastName: '',
  nationality: 'GT',
  dateOfBirth: '',
  sex: 'male',
  phone: emptyPhone(),
  alternatePhone: emptyPhone(),
  documentType: 'dpi',
  documentTypeDetail: '',
  documentNumber: '',
  emergencyFirstName: '',
  emergencyLastName: '',
  emergencyRelationship: '',
  emergencyPhone: emptyPhone(),
});
let visitorDraftMemory: VisitorDraft | null = null;

export function VisitorRegistrationModal({
  close,
  onRegistered,
}: {
  close: () => void;
  onRegistered: (visitor: RegisteredVisitor | VisitorDirectoryRow) => void;
}) {
  const [draft, setDraftState] = useState<VisitorDraft>(
    () => visitorDraftMemory ?? blankVisitorDraft()
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [existing, setExisting] = useState<VisitorDirectoryRow | null>(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(blankVisitorDraft());
  const setDraft = (next: VisitorDraft) => {
    visitorDraftMemory = next;
    setDraftState(next);
  };
  const discard = () => {
    visitorDraftMemory = null;
  };
  const today = guatemalaToday();
  const oldest = `${Number(today.slice(0, 4)) - 120}${today.slice(4)}`;
  function changeNationality(countryCode: CountryCode) {
    const suggest = (phone: PhoneValue): PhoneValue =>
      phone.manuallySelected ? phone : { ...phone, countryCode };
    setDraft({
      ...draft,
      nationality: countryCode,
      phone: suggest(draft.phone),
      alternatePhone: suggest(draft.alternatePhone),
      emergencyPhone: suggest(draft.emergencyPhone),
    });
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setError('');
    setExisting(null);
    const phones = [draft.phone, draft.alternatePhone, draft.emergencyPhone];
    if (phones.every((phone) => !phone.nationalNumber)) {
      setError(
        'Debe ingresar al menos un número de teléfono: propio, alternativo o de emergencia.'
      );
      return;
    }
    const formatted = phones.map(formatInternationalPhone);
    if (
      phones.some((phone, index) => phone.nationalNumber && !formatted[index])
    ) {
      setError(
        'Revise los teléfonos ingresados. Use un número internacional posible para el prefijo seleccionado.'
      );
      return;
    }
    if (
      !draft.dateOfBirth ||
      draft.dateOfBirth < oldest ||
      draft.dateOfBirth > today
    ) {
      setError(
        'Ingrese una fecha de nacimiento real en formato DD/MM/AAAA dentro de un rango razonable.'
      );
      return;
    }
    if (draft.documentType === 'other' && !draft.documentTypeDetail.trim()) {
      setError('Especifique el tipo de documento.');
      return;
    }
    setSaving(true);
    try {
      const match = await findVisitorByDocument(
        draft.documentType,
        draft.documentNumber
      );
      if (match) {
        setExisting({
          ...match,
          registered_at: '',
          latest_visit_id: null,
          latest_visit_status: null,
          latest_member_status: null,
        });
        return;
      }
      const visitor = await registerWalkInVisitor({
        firstName: draft.firstName,
        lastName: draft.lastName,
        nationalityCountryCode: draft.nationality,
        dateOfBirth: draft.dateOfBirth,
        sex: draft.sex,
        phone: formatted[0] ?? '',
        alternatePhone: formatted[1] ?? '',
        documentType: draft.documentType,
        documentTypeDetail: draft.documentTypeDetail,
        documentNumber: draft.documentNumber,
        emergencyFirstName: draft.emergencyFirstName,
        emergencyLastName: draft.emergencyLastName,
        emergencyRelationship: draft.emergencyRelationship,
        emergencyPhone: formatted[2] ?? '',
      });
      discard();
      onRegistered(visitor);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'No fue posible registrar al visitante.'
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <Modal
      title="Registrar visitante"
      close={close}
      dirty={dirty}
      onDiscard={discard}
    >
      <form
        className="operation-form"
        onSubmit={submit}
        onChange={() => setExisting(null)}
      >
        <p className="form-help">
          Crea un expediente presencial sin correo, contraseña ni cuenta
          ficticia.
        </p>
        <ErrorMessage value={error} />
        {existing && (
          <div className="duplicate-notice">
            <strong>Ya existe un expediente para este documento.</strong>
            <span>{existing.full_name}</span>
            <button
              type="button"
              onClick={() => {
                discard();
                onRegistered(existing);
              }}
            >
              Usar expediente existente
            </button>
          </div>
        )}
        <div className="form-grid">
          <label>
            Nombre
            <input
              value={draft.firstName}
              onChange={(event) =>
                setDraft({ ...draft, firstName: event.target.value })
              }
              required
              maxLength={80}
            />
          </label>
          <label>
            Apellido
            <input
              value={draft.lastName}
              onChange={(event) =>
                setDraft({ ...draft, lastName: event.target.value })
              }
              required
              maxLength={80}
            />
          </label>
          <CountryField
            value={draft.nationality}
            onChange={changeNationality}
            disabled={saving}
          />
          <DateField
            label="Fecha de nacimiento"
            value={draft.dateOfBirth}
            onChange={(value) => setDraft({ ...draft, dateOfBirth: value })}
            min={oldest}
            max={today}
            disabled={saving}
          />
          <label>
            Sexo
            <select
              value={draft.sex}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  sex: event.target.value as 'male' | 'female',
                })
              }
              required
            >
              <option value="male">Masculino</option>
              <option value="female">Femenino</option>
            </select>
          </label>
          <PhoneField
            label="Teléfono propio (opcional)"
            value={draft.phone}
            onChange={(phone) => setDraft({ ...draft, phone })}
            disabled={saving}
          />
          <PhoneField
            label="Teléfono alternativo (opcional)"
            value={draft.alternatePhone}
            onChange={(alternatePhone) =>
              setDraft({ ...draft, alternatePhone })
            }
            disabled={saving}
          />
          <label>
            Tipo de documento
            <select
              value={draft.documentType}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  documentType: event.target
                    .value as VisitorDraft['documentType'],
                })
              }
              required
              disabled={saving}
            >
              <option value="dpi">DPI</option>
              <option value="passport">Pasaporte</option>
              <option value="other">Otro documento</option>
            </select>
          </label>
          {draft.documentType === 'other' && (
            <label>
              Especifique el tipo de documento
              <input
                value={draft.documentTypeDetail}
                onChange={(event) =>
                  setDraft({ ...draft, documentTypeDetail: event.target.value })
                }
                required
                maxLength={80}
              />
            </label>
          )}
          <label>
            Número de documento
            <input
              value={draft.documentNumber}
              onChange={(event) =>
                setDraft({ ...draft, documentNumber: event.target.value })
              }
              required
              maxLength={80}
            />
          </label>
        </div>
        <fieldset>
          <legend>Contacto de emergencia</legend>
          <div className="form-grid">
            <label>
              Nombre
              <input
                value={draft.emergencyFirstName}
                onChange={(event) =>
                  setDraft({ ...draft, emergencyFirstName: event.target.value })
                }
                required
                maxLength={80}
              />
            </label>
            <label>
              Apellido
              <input
                value={draft.emergencyLastName}
                onChange={(event) =>
                  setDraft({ ...draft, emergencyLastName: event.target.value })
                }
                required
                maxLength={80}
              />
            </label>
            <label>
              Parentesco
              <input
                value={draft.emergencyRelationship}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    emergencyRelationship: event.target.value,
                  })
                }
                required
                maxLength={80}
              />
            </label>
            <PhoneField
              label="Teléfono de emergencia (opcional)"
              value={draft.emergencyPhone}
              onChange={(emergencyPhone) =>
                setDraft({ ...draft, emergencyPhone })
              }
              disabled={saving}
            />
          </div>
        </fieldset>
        <div className="modal-actions">
          <button type="button" className="secondary" data-modal-close>
            Cancelar
          </button>
          <button type="submit" disabled={saving}>
            {saving ? 'Registrando…' : 'Registrar visitante'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function guatemalaNowParts() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Guatemala',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date());
  const get = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? '';
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    time: `${get('hour')}:${get('minute')}`,
  };
}
function guatemalaIso(date: string, time: string) {
  return new Date(`${date}T${time}:00-06:00`).toISOString();
}

export function AscentCreationModal({
  close,
  onCreated,
}: {
  close: () => void;
  onCreated: (result: AdministrativeVisitResult) => void;
}) {
  const [visitors, setVisitors] = useState<VisitorDirectoryRow[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [organizer, setOrganizer] = useState('');
  const [registering, setRegistering] = useState(false);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [hasGuide, setHasGuide] = useState(false);
  const [startMode, setStartMode] = useState<'now' | 'scheduled'>('now');
  const [plannedDate, setPlannedDate] = useState('');
  const [plannedTime, setPlannedTime] = useState('');
  const [returnDate, setReturnDate] = useState('');
  const [returnTime, setReturnTime] = useState('');
  const now = guatemalaNowParts();
  const dirty =
    selected.length > 0 ||
    Boolean(
      search ||
      plannedDate ||
      plannedTime ||
      returnDate ||
      returnTime ||
      hasGuide
    );
  async function load() {
    try {
      setVisitors(await listVisitorDirectory(search));
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'No fue posible cargar visitantes.'
      );
    }
  }
  useEffect(() => {
    let current = true;
    void listVisitorDirectory()
      .then((rows) => {
        if (current) setVisitors(rows);
      })
      .catch(() => {
        if (current) setError('No fue posible cargar visitantes.');
      });
    return () => {
      current = false;
    };
  }, []);
  const selectedVisitors = useMemo(
    () => visitors.filter((visitor) => selected.includes(visitor.visitor_id)),
    [selected, visitors]
  );
  function toggle(visitorId: string) {
    setSelected((current) =>
      current.includes(visitorId)
        ? current.filter((id) => id !== visitorId)
        : [...current, visitorId]
    );
    if (!organizer) setOrganizer(visitorId);
    else if (organizer === visitorId && selected.includes(visitorId))
      setOrganizer('');
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setError('');
    if (!selected.length || !organizer) {
      setError('Seleccione al menos un visitante y un organizador.');
      return;
    }
    if (
      !returnDate ||
      !returnTime ||
      (startMode === 'scheduled' && (!plannedDate || !plannedTime))
    ) {
      setError('Complete las fechas y horas del ascenso.');
      return;
    }
    const form = new FormData(event.currentTarget);
    setSaving(true);
    try {
      const result = await createAdministrativeVisit({
        visitorIds: selected,
        organizerId: organizer,
        visitType: String(form.get('visitType')) as
          'day_hike' | 'expedition_camping',
        startMode,
        plannedStartAt:
          startMode === 'scheduled'
            ? guatemalaIso(plannedDate, plannedTime)
            : undefined,
        expectedReturnAt: guatemalaIso(returnDate, returnTime),
        hasLocalGuide: hasGuide,
        guideName: String(form.get('guideName') ?? ''),
      });
      onCreated(result);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'No fue posible crear el ascenso.'
      );
    } finally {
      setSaving(false);
    }
  }
  if (registering)
    return (
      <VisitorRegistrationModal
        close={() => setRegistering(false)}
        onRegistered={(visitor) => {
          setRegistering(false);
          setNotice('Visitante registrado correctamente.');
          void listVisitorDirectory().then((rows) => {
            setVisitors(rows);
            setSelected((current) => [
              ...new Set([...current, visitor.visitor_id]),
            ]);
            setOrganizer((current) => current || visitor.visitor_id);
          });
        }}
      />
    );
  return (
    <Modal title="Crear ascenso" close={close} dirty={dirty}>
      <form className="operation-form" onSubmit={submit}>
        <ErrorMessage value={error} />
        {notice && (
          <div className="alert success" role="status">
            {notice}
          </div>
        )}
        <div className="visitor-picker-header">
          <label>
            Buscar visitante
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <button
            type="button"
            className="secondary"
            onClick={() => void load()}
          >
            Buscar
          </button>
          <button type="button" onClick={() => setRegistering(true)}>
            Registrar nuevo
          </button>
        </div>
        <div className="visitor-picker" aria-label="Visitantes disponibles">
          {visitors.map((visitor) => (
            <label
              key={visitor.visitor_id}
              className={
                selected.includes(visitor.visitor_id) ? 'selected' : ''
              }
            >
              <input
                type="checkbox"
                checked={selected.includes(visitor.visitor_id)}
                onChange={() => toggle(visitor.visitor_id)}
              />
              <span>
                <strong>{visitor.full_name}</strong>
                <small>
                  {visitor.registration_origin === 'administrative'
                    ? 'Registrado por administración'
                    : 'Cuenta PWA'}
                </small>
              </span>
            </label>
          ))}
        </div>
        {selectedVisitors.length > 0 && (
          <fieldset>
            <legend>Organizador o responsable</legend>
            <div className="organizer-list">
              {selectedVisitors.map((visitor) => (
                <label key={visitor.visitor_id}>
                  <input
                    type="radio"
                    checked={organizer === visitor.visitor_id}
                    onChange={() => setOrganizer(visitor.visitor_id)}
                  />
                  {visitor.full_name}
                </label>
              ))}
            </div>
          </fieldset>
        )}
        <div className="form-grid">
          <label>
            Tipo
            <select name="visitType">
              <option value="day_hike">Ascenso de un día</option>
              <option value="expedition_camping">
                Expedición y campamento
              </option>
            </select>
          </label>
          <label>
            Inicio
            <select
              value={startMode}
              onChange={(event) =>
                setStartMode(event.target.value as 'now' | 'scheduled')
              }
            >
              <option value="now">Ascender ahora</option>
              <option value="scheduled">Planificar ascenso</option>
            </select>
          </label>
        </div>
        <fieldset>
          <legend>
            {startMode === 'now' ? 'Inicio real' : 'Programación'}
          </legend>
          <div className="form-grid datetime-grid">
            {startMode === 'now' ? (
              <>
                <DateField
                  label="Fecha de inicio"
                  value={now.date}
                  onChange={() => undefined}
                  disabled
                />
                <label>
                  Hora de inicio
                  <input type="time" value={now.time} disabled />
                </label>
              </>
            ) : (
              <>
                <DateField
                  label="Fecha planificada de inicio"
                  value={plannedDate}
                  onChange={setPlannedDate}
                  min={guatemalaToday()}
                />
                <label>
                  Hora planificada de inicio
                  <input
                    type="time"
                    value={plannedTime}
                    onChange={(event) => setPlannedTime(event.target.value)}
                    required
                  />
                </label>
              </>
            )}
            <DateField
              label="Fecha estimada de retorno"
              value={returnDate}
              onChange={setReturnDate}
              min={
                startMode === 'scheduled'
                  ? plannedDate || guatemalaToday()
                  : guatemalaToday()
              }
            />
            <label>
              Hora estimada de retorno
              <input
                type="time"
                value={returnTime}
                onChange={(event) => setReturnTime(event.target.value)}
                required
              />
            </label>
          </div>
        </fieldset>
        <div className="form-grid">
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={hasGuide}
              onChange={(event) => setHasGuide(event.target.checked)}
            />
            Viaja con guía local
          </label>
          {hasGuide && (
            <label>
              Nombre del guía
              <input name="guideName" required maxLength={120} />
            </label>
          )}
        </div>
        <div className="modal-actions">
          <button type="button" className="secondary" data-modal-close>
            Cancelar
          </button>
          <button type="submit" disabled={saving}>
            {saving ? 'Creando…' : `Crear ascenso (${selected.length})`}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function AscentDetailsModal({
  ascent,
  canConfirmReturns,
  close,
  onChanged,
}: {
  ascent: AscentRow;
  canConfirmReturns: boolean;
  close: () => void;
  onChanged: () => void;
}) {
  const [members, setMembers] = useState<AscentMemberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [returnRow, setReturnRow] = useState<ReturnRow | null>(null);

  function load() {
    setLoading(true);
    setError('');
    void getAscentMembers(ascent.visit_id)
      .then(setMembers)
      .catch((reason: unknown) =>
        setError(
          reason instanceof Error
            ? reason.message
            : 'No fue posible cargar el detalle.'
        )
      )
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    let current = true;
    void getAscentMembers(ascent.visit_id)
      .then((rows) => {
        if (current) setMembers(rows);
      })
      .catch((reason: unknown) => {
        if (current)
          setError(
            reason instanceof Error
              ? reason.message
              : 'No fue posible cargar el detalle.'
          );
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [ascent.visit_id]);

  if (returnRow) {
    return (
      <AdministrativeReturnModal
        row={returnRow}
        close={() => setReturnRow(null)}
        onConfirmed={() => {
          setReturnRow(null);
          load();
          onChanged();
        }}
      />
    );
  }

  const adults = members.filter((member) => !member.is_minor);
  const minors = members.filter((member) => member.is_minor);
  const minorsFor = (adultId: string) =>
    minors.filter((minor) => minor.responsible_member_id === adultId);

  return (
    <Modal title={`Detalle del ascenso ${ascent.join_code}`} close={close}>
      <div className="operation-form">
        <div className="return-summary">
          <div>
            <span>Organizador</span>
            <strong>{ascent.organizer_name}</strong>
          </div>
          <div>
            <span>Estado</span>
            <strong>
              {ascent.visit_status === 'in_progress'
                ? 'En curso'
                : ascent.visit_status}
            </strong>
          </div>
          <div>
            <span>Retorno estimado</span>
            <strong>{formatDateTime(ascent.expected_return_at)}</strong>
          </div>
        </div>
        <div className="provenance-row">
          {ascent.creation_origin === 'administrative' && (
            <span className="provenance-badge">Creado por administración</span>
          )}
          {ascent.finalized_by_administration && (
            <span className="provenance-badge">
              Finalizado por administración
            </span>
          )}
        </div>
        <div
          className="participant-summary"
          aria-label="Resumen de participantes"
        >
          <div>
            <strong>{ascent.participant_count}</strong>
            <span>Visitantes</span>
          </div>
          <div>
            <strong>{ascent.adult_count}</strong>
            <span>Adultos</span>
          </div>
          <div>
            <strong>{ascent.minor_count}</strong>
            <span>Menores</span>
          </div>
        </div>
        <ErrorMessage value={error} />
        {loading ? (
          <p className="muted">Cargando participantes…</p>
        ) : (
          <div className="member-list">
            {adults.map((member) => {
              const relatedMinors = minorsFor(member.user_id);
              return (
                <article className="adult-member-card" key={member.user_id}>
                  <div className="adult-member-main">
                    <div>
                      <strong>{member.visitor_name}</strong>
                      <span>
                        {member.member_role === 'leader'
                          ? 'Organizador'
                          : 'Integrante'}
                      </span>
                    </div>
                    <StatusBadge value={member.member_status} />
                    <div className="provenance-row">
                      {member.finalized_by_administration && (
                        <span className="provenance-badge">
                          Finalizado por administración
                        </span>
                      )}
                      {member.checked_out_at && (
                        <span className="muted">
                          Retorno: {formatDateTime(member.checked_out_at)}
                        </span>
                      )}
                    </div>
                    {canConfirmReturns &&
                      ascent.visit_status === 'in_progress' &&
                      ['active', 'returning_early'].includes(
                        member.member_status
                      ) && (
                        <button
                          type="button"
                          className="table-action"
                          onClick={() =>
                            setReturnRow({
                              visit_id: ascent.visit_id,
                              user_id: member.user_id,
                              visitor_name: member.visitor_name,
                              join_code: ascent.join_code,
                              member_status: member.member_status,
                              started_at: ascent.started_at,
                              expected_return_at: ascent.expected_return_at,
                              return_started_at: null,
                              checked_out_at: member.checked_out_at,
                              attention_state: 'on_route',
                              participant_count: ascent.participant_count,
                              minors: relatedMinors.flatMap((minor) =>
                                minor.age !== null &&
                                minor.sex !== null &&
                                minor.relationship !== null
                                  ? [
                                      {
                                        id: minor.user_id,
                                        full_name: minor.visitor_name,
                                        age: minor.age,
                                        sex: minor.sex,
                                        relationship: minor.relationship,
                                        member_status: minor.member_status,
                                        checked_out_at: minor.checked_out_at,
                                      },
                                    ]
                                  : []
                              ),
                              creation_origin: ascent.creation_origin,
                              finalized_by_administration:
                                member.finalized_by_administration,
                            })
                          }
                        >
                          Registrar retorno administrativo
                        </button>
                      )}
                  </div>
                  {relatedMinors.length > 0 && (
                    <div className="minor-member-list">
                      <span className="minor-group-label">
                        {relatedMinors.length} menor
                        {relatedMinors.length === 1 ? '' : 'es'} a cargo
                      </span>
                      {relatedMinors.map((minor) => (
                        <div className="minor-member-card" key={minor.user_id}>
                          <div>
                            <span className="minor-badge">Menor</span>
                            <strong>{minor.visitor_name}</strong>
                            <span>
                              {minor.age} años · {formatSex(minor.sex)} ·{' '}
                              {minor.relationship}
                            </span>
                            <span>Responsable: {member.visitor_name}</span>
                            {minor.checked_out_at && (
                              <span>
                                Retorno: {formatDateTime(minor.checked_out_at)}
                              </span>
                            )}
                          </div>
                          <StatusBadge value={minor.member_status} />
                        </div>
                      ))}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
        <div className="modal-actions">
          <button type="button" className="secondary" data-modal-close>
            Cerrar
          </button>
        </div>
      </div>
    </Modal>
  );
}

export function AdministrativeReturnModal({
  row,
  close,
  onConfirmed,
}: {
  row: ReturnRow;
  close: () => void;
  onConfirmed: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [retrospective, setRetrospective] = useState(false);
  const [wholeGroup, setWholeGroup] = useState(false);
  const [reason, setReason] = useState('confirmed_in_person');
  const [confirmed, setConfirmed] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const form = new FormData(event.currentTarget);
    if (!confirmed) {
      setError('Debe confirmar que la persona efectivamente regresó.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await registerAdministrativeReturn({
        visitId: row.visit_id,
        visitorId: row.user_id,
        group: wholeGroup,
        reason,
        reasonDetail: String(form.get('reasonDetail') ?? '').trim(),
        notes: String(form.get('notes') ?? ''),
        effectiveReturnAt: retrospective
          ? new Date(String(form.get('effectiveReturnAt'))).toISOString()
          : undefined,
      });
      onConfirmed();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'No fue posible registrar el retorno.'
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <Modal
      title="Registrar retorno administrativo"
      close={close}
      dirty={
        confirmed ||
        retrospective ||
        wholeGroup ||
        reason !== 'confirmed_in_person'
      }
    >
      <form className="operation-form" onSubmit={submit}>
        <div className="return-summary">
          <div>
            <span>Visitante</span>
            <strong>{row.visitor_name}</strong>
          </div>
          <div>
            <span>Grupo</span>
            <strong>{row.join_code}</strong>
          </div>
          <div>
            <span>Estado actual</span>
            <strong>En recorrido</strong>
          </div>
        </div>
        {row.minors.length > 0 && (
          <div className="minor-return-notice" role="note">
            <strong>
              {row.visitor_name} tiene {row.minors.length} menor
              {row.minors.length === 1 ? '' : 'es'} a cargo.
            </strong>
            <span>
              {row.minors.length === 1
                ? 'El retorno del menor también será registrado automáticamente.'
                : 'Sus retornos también serán registrados automáticamente.'}
            </span>
            <ul>
              {row.minors.map((minor) => (
                <li key={minor.id}>
                  {minor.full_name} · {minor.age} años · {minor.relationship}
                </li>
              ))}
            </ul>
          </div>
        )}
        <ErrorMessage value={error} />
        <label>
          Motivo del registro
          <select
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            required
          >
            <option value="confirmed_in_person">
              Retorno verificado presencialmente
            </option>
            <option value="phone_battery">Teléfono sin batería</option>
            <option value="no_connection">Sin conexión a Internet</option>
            <option value="forgot_to_finish">
              El visitante olvidó finalizar el ascenso
            </option>
            <option value="early_return">Retorno anticipado</option>
            <option value="other">Otro motivo</option>
          </select>
        </label>
        {reason === 'other' && (
          <label>
            Especifique el motivo
            <input name="reasonDetail" required maxLength={200} />
          </label>
        )}
        <label>
          Observaciones (opcional)
          <textarea name="notes" maxLength={1000} />
        </label>
        <label className="checkbox-field">
          <input
            type="checkbox"
            checked={retrospective}
            onChange={(event) => setRetrospective(event.target.checked)}
          />
          El retorno ocurrió anteriormente
        </label>
        {retrospective && (
          <label>
            Fecha y hora efectiva del retorno
            <input
              name="effectiveReturnAt"
              type="datetime-local"
              required
              max={new Date().toISOString().slice(0, 16)}
            />
          </label>
        )}
        {row.participant_count > 1 && (
          <label className="checkbox-field group-confirm">
            <input
              type="checkbox"
              checked={wholeGroup}
              onChange={(event) => setWholeGroup(event.target.checked)}
            />
            <span>
              <strong>Confirmar retorno de todo el grupo</strong>
              <small>
                Únicamente si se verificó el regreso de todos los integrantes.
              </small>
            </span>
          </label>
        )}
        <label className="checkbox-field confirmation-check">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
            required
          />
          <span>
            <strong>Confirmo que la persona efectivamente regresó.</strong>
            <small>
              Un teléfono apagado, la falta de conexión o la hora vencida no son
              evidencia suficiente.
            </small>
          </span>
        </label>
        <div className="modal-actions">
          <button type="button" className="secondary" data-modal-close>
            Cancelar
          </button>
          <button type="submit" disabled={saving || !confirmed}>
            {saving ? 'Confirmando…' : 'Confirmar retorno'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
