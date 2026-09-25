import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import {
  createAdministrativeVisit,
  findVisitorByDocument,
  getAscentMembers,
  listVisitorDirectory,
  registerAdministrativeReturn,
  registerWalkInVisitor,
} from '../services/admin-service'
import type { AscentMemberRow, AscentRow, RegisteredVisitor, ReturnRow, VisitorDirectoryRow } from '../types'
import { formatDateTime } from '../lib/date-range'

function Modal({ title, close, children }: { title: string; close: () => void; children: ReactNode }) {
  return <div className="modal-layer" role="dialog" aria-modal="true" aria-labelledby="operation-title">
    <button type="button" className="modal-backdrop" aria-label="Cerrar" onClick={close}/>
    <section className="operation-modal">
      <header><h2 id="operation-title">{title}</h2><button type="button" className="close-button" onClick={close} aria-label="Cerrar">×</button></header>
      {children}
    </section>
  </div>
}

function ErrorMessage({ value }: { value: string }) {
  return value ? <div className="alert error" role="alert">{value}</div> : null
}

export function VisitorRegistrationModal({ close, onRegistered }: {
  close: () => void
  onRegistered: (visitor: RegisteredVisitor | VisitorDirectoryRow) => void
}) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [existing, setExisting] = useState<VisitorDirectoryRow | null>(null)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setExisting(null)
    const form = new FormData(event.currentTarget)
    const documentType = String(form.get('documentType')) as 'dpi' | 'passport'
    const documentNumber = String(form.get('documentNumber')).trim()
    setSaving(true)
    try {
      const match = await findVisitorByDocument(documentType, documentNumber)
      if (match) {
        setExisting({
          visitor_id: match.visitor_id,
          full_name: match.full_name,
          nationality_country_code: match.nationality_country_code,
          registration_origin: match.registration_origin,
          registered_at: '', latest_visit_id: null, latest_visit_status: null, latest_member_status: null,
        })
        return
      }
      const visitor = await registerWalkInVisitor({
        firstName: String(form.get('firstName')),
        lastName: String(form.get('lastName')),
        nationalityCountryCode: String(form.get('nationality')).toUpperCase(),
        dateOfBirth: String(form.get('dateOfBirth')),
        phone: String(form.get('phone') ?? ''),
        alternatePhone: String(form.get('alternatePhone') ?? ''),
        documentType,
        documentNumber,
        emergencyFirstName: String(form.get('emergencyFirstName')),
        emergencyLastName: String(form.get('emergencyLastName')),
        emergencyRelationship: String(form.get('emergencyRelationship')),
        emergencyPhone: String(form.get('emergencyPhone')),
      })
      onRegistered(visitor)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No fue posible registrar al visitante.')
    } finally {
      setSaving(false)
    }
  }

  return <Modal title="Registrar visitante" close={close}>
    <form className="operation-form" onSubmit={submit}>
      <p className="form-help">Crea un expediente presencial sin correo, contraseña ni cuenta ficticia.</p>
      <ErrorMessage value={error}/>
      {existing && <div className="duplicate-notice"><strong>Ya existe un expediente para este documento.</strong><span>{existing.full_name}</span><button type="button" onClick={() => onRegistered(existing)}>Usar expediente existente</button></div>}
      <div className="form-grid">
        <label>Nombre<input name="firstName" required maxLength={80}/></label>
        <label>Apellido<input name="lastName" required maxLength={80}/></label>
        <label>Nacionalidad (código de país)<input name="nationality" required pattern="[A-Za-z]{2}" maxLength={2} placeholder="GT"/></label>
        <label>Fecha de nacimiento<input name="dateOfBirth" type="date" required max={new Date().toISOString().slice(0, 10)}/></label>
        <label>Teléfono propio (opcional)<input name="phone" type="tel" pattern="\+[1-9][0-9]{1,14}" placeholder="+50255555555"/></label>
        <label>Teléfono alternativo (opcional)<input name="alternatePhone" type="tel" pattern="\+[1-9][0-9]{1,14}" placeholder="+50255555555"/></label>
        <label>Tipo de documento<select name="documentType" required><option value="dpi">DPI</option><option value="passport">Pasaporte</option></select></label>
        <label>Número de documento<input name="documentNumber" required maxLength={80}/></label>
      </div>
      <fieldset><legend>Contacto de emergencia</legend><div className="form-grid">
        <label>Nombre<input name="emergencyFirstName" required maxLength={80}/></label>
        <label>Apellido<input name="emergencyLastName" required maxLength={80}/></label>
        <label>Parentesco<input name="emergencyRelationship" required maxLength={80}/></label>
        <label>Teléfono<input name="emergencyPhone" type="tel" required pattern="\+[1-9][0-9]{1,14}" placeholder="+50255555555"/></label>
      </div></fieldset>
      <div className="modal-actions"><button type="button" className="secondary" onClick={close}>Cancelar</button><button type="submit" disabled={saving}>{saving ? 'Registrando…' : 'Registrar visitante'}</button></div>
    </form>
  </Modal>
}

export function AscentCreationModal({ close, onCreated }: { close: () => void; onCreated: () => void }) {
  const [visitors, setVisitors] = useState<VisitorDirectoryRow[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [organizer, setOrganizer] = useState('')
  const [registering, setRegistering] = useState(false)
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [hasGuide, setHasGuide] = useState(false)
  const [startMode, setStartMode] = useState<'now' | 'scheduled'>('now')

  async function load() {
    try { setVisitors(await listVisitorDirectory(search)) } catch (reason) { setError(reason instanceof Error ? reason.message : 'No fue posible cargar visitantes.') }
  }
  useEffect(() => {
    let current = true
    void listVisitorDirectory().then((rows) => { if (current) setVisitors(rows) })
      .catch((reason: unknown) => { if (current) setError(reason instanceof Error ? reason.message : 'No fue posible cargar visitantes.') })
    return () => { current = false }
  }, [])
  const selectedVisitors = useMemo(() => visitors.filter((visitor) => selected.includes(visitor.visitor_id)), [selected, visitors])

  function toggle(visitorId: string) {
    setSelected((current) => current.includes(visitorId) ? current.filter((id) => id !== visitorId) : [...current, visitorId])
    if (!organizer) setOrganizer(visitorId)
    else if (organizer === visitorId && selected.includes(visitorId)) setOrganizer('')
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError('')
    if (selected.length === 0 || !organizer) { setError('Seleccione al menos un visitante y un organizador.'); return }
    const form = new FormData(event.currentTarget); setSaving(true)
    try {
      await createAdministrativeVisit({
        visitorIds: selected, organizerId: organizer,
        visitType: String(form.get('visitType')) as 'day_hike' | 'expedition_camping',
        startMode,
        plannedStartAt: startMode === 'scheduled' ? new Date(String(form.get('plannedStartAt'))).toISOString() : undefined,
        expectedReturnAt: new Date(String(form.get('expectedReturnAt'))).toISOString(),
        hasLocalGuide: hasGuide, guideName: String(form.get('guideName') ?? ''),
      })
      onCreated()
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'No fue posible crear el ascenso.') }
    finally { setSaving(false) }
  }

  if (registering) return <VisitorRegistrationModal close={() => setRegistering(false)} onRegistered={(visitor) => {
    setRegistering(false); void listVisitorDirectory().then((rows) => { setVisitors(rows); setSelected((current) => [...new Set([...current, visitor.visitor_id])]); setOrganizer((current) => current || visitor.visitor_id) })
  }}/>

  return <Modal title="Crear ascenso" close={close}><form className="operation-form" onSubmit={submit}>
    <ErrorMessage value={error}/>
    <div className="visitor-picker-header"><label>Buscar visitante<input value={search} onChange={(event) => setSearch(event.target.value)}/></label><button type="button" className="secondary" onClick={() => void load()}>Buscar</button><button type="button" onClick={() => setRegistering(true)}>Registrar nuevo</button></div>
    <div className="visitor-picker" aria-label="Visitantes disponibles">{visitors.map((visitor) => <label key={visitor.visitor_id} className={selected.includes(visitor.visitor_id) ? 'selected' : ''}><input type="checkbox" checked={selected.includes(visitor.visitor_id)} onChange={() => toggle(visitor.visitor_id)}/><span><strong>{visitor.full_name}</strong><small>{visitor.registration_origin === 'administrative' ? 'Registrado por administración' : 'Cuenta PWA'}</small></span></label>)}</div>
    {selectedVisitors.length > 0 && <fieldset><legend>Organizador o responsable</legend><div className="organizer-list">{selectedVisitors.map((visitor) => <label key={visitor.visitor_id}><input type="radio" name="organizer" checked={organizer === visitor.visitor_id} onChange={() => setOrganizer(visitor.visitor_id)}/>{visitor.full_name}</label>)}</div></fieldset>}
    <div className="form-grid">
      <label>Tipo<select name="visitType"><option value="day_hike">Ascenso de un día</option><option value="expedition_camping">Expedición y campamento</option></select></label>
      <label>Inicio<select value={startMode} onChange={(event) => setStartMode(event.target.value as 'now' | 'scheduled')}><option value="now">Ascender ahora</option><option value="scheduled">Planificar ascenso</option></select></label>
      {startMode === 'scheduled' && <label>Fecha y hora de inicio<input name="plannedStartAt" type="datetime-local" required/></label>}
      <label>Retorno estimado<input name="expectedReturnAt" type="datetime-local" required/></label>
      <label className="checkbox-field"><input type="checkbox" checked={hasGuide} onChange={(event) => setHasGuide(event.target.checked)}/>Viaja con guía local</label>
      {hasGuide && <label>Nombre del guía<input name="guideName" required maxLength={120}/></label>}
    </div>
    <div className="modal-actions"><button type="button" className="secondary" onClick={close}>Cancelar</button><button type="submit" disabled={saving}>{saving ? 'Creando…' : `Crear ascenso (${selected.length})`}</button></div>
  </form></Modal>
}

export function AscentDetailsModal({ ascent, canConfirmReturns, close, onChanged }: {
  ascent: AscentRow
  canConfirmReturns: boolean
  close: () => void
  onChanged: () => void
}) {
  const [members, setMembers] = useState<AscentMemberRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [returnRow, setReturnRow] = useState<ReturnRow | null>(null)
  function load() {
    setLoading(true)
    void getAscentMembers(ascent.visit_id).then(setMembers)
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'No fue posible cargar el detalle.'))
      .finally(() => setLoading(false))
  }
  useEffect(() => {
    let current = true
    void getAscentMembers(ascent.visit_id).then((rows) => { if (current) setMembers(rows) })
      .catch((reason: unknown) => { if (current) setError(reason instanceof Error ? reason.message : 'No fue posible cargar el detalle.') })
      .finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  }, [ascent.visit_id])

  if (returnRow) return <AdministrativeReturnModal row={returnRow} close={() => setReturnRow(null)} onConfirmed={() => {
    setReturnRow(null); load(); onChanged()
  }}/>

  return <Modal title={`Detalle del ascenso ${ascent.join_code}`} close={close}>
    <div className="operation-form">
      <div className="return-summary"><div><span>Organizador</span><strong>{ascent.organizer_name}</strong></div><div><span>Estado</span><strong>{ascent.visit_status === 'in_progress' ? 'En curso' : ascent.visit_status}</strong></div><div><span>Retorno estimado</span><strong>{formatDateTime(ascent.expected_return_at)}</strong></div></div>
      <div className="provenance-row">{ascent.creation_origin === 'administrative' && <span className="provenance-badge">Creado por administración</span>}{ascent.finalized_by_administration && <span className="provenance-badge">Finalizado por administración</span>}</div>
      <ErrorMessage value={error}/>
      {loading ? <p className="muted">Cargando participantes…</p> : <div className="member-list">{members.map((member) => <div key={member.user_id}>
        <div><strong>{member.visitor_name}</strong><span>{member.member_role === 'leader' ? 'Organizador' : 'Integrante'} · {member.member_status}</span></div>
        <div className="provenance-row">{member.finalized_by_administration && <span className="provenance-badge">Finalizado por administración</span>}{member.checked_out_at && <span className="muted">{formatDateTime(member.checked_out_at)}</span>}</div>
        {canConfirmReturns && ascent.visit_status === 'in_progress' && ['active', 'returning_early'].includes(member.member_status) && <button type="button" className="table-action" onClick={() => setReturnRow({
          visit_id: ascent.visit_id, user_id: member.user_id, visitor_name: member.visitor_name,
          join_code: ascent.join_code, member_status: member.member_status, started_at: ascent.started_at,
          expected_return_at: ascent.expected_return_at, return_started_at: null, checked_out_at: member.checked_out_at,
          attention_state: 'on_route', participant_count: ascent.participant_count,
          creation_origin: ascent.creation_origin, finalized_by_administration: member.finalized_by_administration,
        })}>Registrar retorno administrativo</button>}
      </div>)}</div>}
      <div className="modal-actions"><button type="button" className="secondary" onClick={close}>Cerrar</button></div>
    </div>
  </Modal>
}

export function AdministrativeReturnModal({ row, close, onConfirmed }: { row: ReturnRow; close: () => void; onConfirmed: () => void }) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [retrospective, setRetrospective] = useState(false)
  const [wholeGroup, setWholeGroup] = useState(false)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget); setSaving(true); setError('')
    try {
      await registerAdministrativeReturn({ visitId: row.visit_id, visitorId: row.user_id, group: wholeGroup,
        reason: String(form.get('reason')), notes: String(form.get('notes') ?? ''),
        effectiveReturnAt: retrospective ? new Date(String(form.get('effectiveReturnAt'))).toISOString() : undefined })
      onConfirmed()
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'No fue posible registrar el retorno.') }
    finally { setSaving(false) }
  }
  return <Modal title="Registrar retorno administrativo" close={close}><form className="operation-form" onSubmit={submit}>
    <div className="return-summary"><div><span>Visitante</span><strong>{row.visitor_name}</strong></div><div><span>Grupo</span><strong>{row.join_code}</strong></div><div><span>Estado actual</span><strong>En recorrido</strong></div></div>
    <ErrorMessage value={error}/>
    <label>Motivo del registro<select name="reason" required><option value="phone_battery">Teléfono sin batería</option><option value="no_connection">Sin conexión</option><option value="forgot_to_finish">Olvidó finalizar el ascenso</option><option value="confirmed_in_person">Retorno confirmado presencialmente</option><option value="other">Otro motivo</option></select></label>
    <label>Observaciones (opcional)<textarea name="notes" maxLength={1000}/></label>
    <label className="checkbox-field"><input type="checkbox" checked={retrospective} onChange={(event) => setRetrospective(event.target.checked)}/>El retorno ocurrió anteriormente</label>
    {retrospective && <label>Fecha y hora efectiva del retorno<input name="effectiveReturnAt" type="datetime-local" required max={new Date().toISOString().slice(0, 16)}/></label>}
    {row.participant_count > 1 && <label className="checkbox-field group-confirm"><input type="checkbox" checked={wholeGroup} onChange={(event) => setWholeGroup(event.target.checked)}/><span><strong>Confirmar retorno de todo el grupo</strong><small>Use esta opción únicamente si se verificó el regreso de todos los integrantes.</small></span></label>}
    <p className="confirmation-note">Al confirmar declara que el retorno fue verificado. Superar la hora estimada no confirma automáticamente el regreso.</p>
    <div className="modal-actions"><button type="button" className="secondary" onClick={close}>Cancelar</button><button type="submit" disabled={saving}>{saving ? 'Confirmando…' : 'Confirmar retorno'}</button></div>
  </form></Modal>
}
