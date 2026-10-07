import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  Panel,
} from '../components/ui';
import {
  getStaffPermissions,
  listStaff,
  updateStaffPermissions,
} from '../services/admin-service';
import type { PermissionKey, StaffPermissionRecord, StaffRow } from '../types';

const permissionLabels: Array<[PermissionKey, string, string]> = [
  ['can_view_visitors', 'Consultar ascensos', 'Acceso a listados operativos.'],
  ['can_register_walk_in_visitors', 'Registrar visitantes', 'Permite el registro administrativo de visitantes.'],
  ['can_manage_visits', 'Crear ascensos', 'Permite crear, iniciar y administrar ascensos.'],
  ['can_confirm_returns', 'Registrar retornos', 'Permite registrar retornos de adultos y sus menores.'],
  ['can_manage_notifications', 'Crear notificaciones', 'Permite crear, programar y publicar mensajes.'],
  ['can_manage_gallery', 'Gestionar galería', 'Permite subir, ordenar, activar y retirar fotografías.'],
  ['can_view_identity_documents', 'Ver datos sensibles de identidad', 'DPI/CUI o pasaporte. Desactivado por defecto.'],
  ['can_view_emergency_contacts', 'Ver contactos de emergencia', 'Solo durante un ascenso activo, pendiente o atrasado.'],
];

export function PermissionsPage({
  initialUserId,
  embedded = false,
}: {
  initialUserId?: string | null;
  embedded?: boolean;
}) {
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [selectedId, setSelectedId] = useState(initialUserId ?? '');
  const [record, setRecord] = useState<StaffPermissionRecord | null>(null);
  const [state, setState] = useState<'loading' | 'success' | 'error'>(
    'loading'
  );
  const [message, setMessage] = useState('');

  const loadRecord = useCallback(async (userId: string) => {
    if (!userId) {
      setRecord(null);
      setState('success');
      return;
    }
    setState('loading');
    try {
      setRecord(await getStaffPermissions(userId));
      setState('success');
    } catch {
      setState('error');
    }
  }, []);

  useEffect(() => {
    void listStaff()
      .then((rows) => {
        const managers = rows.filter((row) => row.role === 'visitor_manager');
        setStaff(managers);
        const selected = initialUserId ?? managers[0]?.user_id ?? '';
        setSelectedId(selected);
        return loadRecord(selected);
      })
      .catch(() => setState('error'));
  }, [initialUserId, loadRecord]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!record) return;
    setMessage('');
    try {
      const values = Object.fromEntries(
        permissionLabels.map(([key]) => [key, record[key]])
      );
      await updateStaffPermissions(record.user_id, values);
      setMessage(
        'Permisos guardados. El cambio quedó registrado en auditoría.'
      );
      await loadRecord(record.user_id);
    } catch {
      setMessage('No fue posible guardar los permisos.');
    }
  }

  return (
    <>
      {!embedded && <PageHeader eyebrow="Administración" title="Permisos">
        <label className="staff-picker">
          <span>Gestor</span>
          <select
            value={selectedId}
            onChange={(event) => {
              setSelectedId(event.target.value);
              void loadRecord(event.target.value);
            }}
          >
            <option value="">Seleccione</option>
            {staff.map((person) => (
              <option value={person.user_id} key={person.user_id}>
                {person.full_name || person.email}
              </option>
            ))}
          </select>
        </label>
      </PageHeader>}
      {message && (
        <div
          className={message.startsWith('No') ? 'alert error' : 'alert success'}
          role="status"
        >
          {message}
        </div>
      )}
      {state === 'loading' ? (
        <LoadingState rows={7} />
      ) : state === 'error' ? (
        <ErrorState retry={() => void loadRecord(selectedId)} />
      ) : !record ? (
        <EmptyState
          title="Seleccione un gestor"
          detail="Elija una cuenta para revisar sus permisos individuales."
        />
      ) : (
        <form onSubmit={save}>
          <Panel>
            <div className="permission-user">
              <div>
                <strong>{record.full_name}</strong>
                <span>{record.email}</span>
              </div>
              <span className={record.is_active ? 'access-on' : 'access-off'}>
                {record.is_active ? 'Acceso activo' : 'Acceso desactivado'}
              </span>
            </div>
            <div className="permission-list">
              {permissionLabels.map(([key, label, detail]) => (
                <label className="permission-row" key={key}>
                  <input
                    type="checkbox"
                    checked={record[key]}
                    onChange={(event) =>
                      setRecord({ ...record, [key]: event.target.checked })
                    }
                  />
                  <span>
                    <strong>{label}</strong>
                    <small>{detail}</small>
                  </span>
                </label>
              ))}
            </div>
            <div className="form-actions">
              <button type="submit">Guardar permisos</button>
            </div>
          </Panel>
        </form>
      )}
    </>
  );
}
