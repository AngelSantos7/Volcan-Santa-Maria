import type { ReactNode } from 'react';
import type { AdminSession } from '../types';
import { Icon } from './ui';

export type PageId =
  | 'dashboard'
  | 'visitors'
  | 'ascents'
  | 'returns'
  | 'reports'
  | 'notifications'
  | 'staff'
  | 'permissions'
  | 'audit';

const mainNav: Array<[PageId, string, string]> = [
  ['dashboard', 'Dashboard', 'dashboard'],
  ['visitors', 'Visitantes', 'visitors'],
  ['ascents', 'Ascensos', 'ascent'],
  ['returns', 'Control de retornos', 'returns'],
  ['reports', 'Reportes', 'dashboard'],
  ['notifications', 'Notificaciones', 'audit'],
];

const adminNav: Array<[PageId, string, string]> = [
  ['staff', 'Gestores', 'staff'],
  ['permissions', 'Permisos', 'permissions'],
  ['audit', 'Auditoría', 'audit'],
];

export function AdminShell({
  session,
  page,
  setPage,
  signOut,
  children,
}: {
  session: AdminSession;
  page: PageId;
  setPage: (page: PageId) => void;
  signOut: () => void;
  children: ReactNode;
}) {
  const isAdmin = session.role === 'admin';
  const canManageNotifications =
    isAdmin || Boolean(session.permissions.can_manage_notifications);
  const name =
    [session.first_name, session.last_name].filter(Boolean).join(' ') ||
    session.email ||
    'Personal';
  return (
    <div className="admin-app">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-mark">VS</div>
          <div>
            <strong>Gestor de Visitantes</strong>
            <span>Volcán Santa María</span>
          </div>
        </div>
        <nav aria-label="Navegación principal">
          <p className="nav-label">Operación</p>
          {mainNav.filter(([id]) => id !== 'notifications' || canManageNotifications).map(([id, label, icon]) => (
            <button
              type="button"
              key={id}
              className={page === id ? 'active' : ''}
              onClick={() => setPage(id)}
            >
              <Icon name={icon} />
              {label}
            </button>
          ))}
          {isAdmin && (
            <>
              <p className="nav-label admin-label">Administración</p>
              {adminNav.map(([id, label, icon]) => (
                <button
                  type="button"
                  key={id}
                  className={page === id ? 'active' : ''}
                  onClick={() => setPage(id)}
                >
                  <Icon name={icon} />
                  {label}
                </button>
              ))}
            </>
          )}
        </nav>
        <div className="sidebar-user">
          <div className="user-dot">{name[0]?.toUpperCase()}</div>
          <div>
            <strong>{name}</strong>
            <span>{isAdmin ? 'Administrador' : 'Gestor de visitantes'}</span>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="Cerrar sesión"
            onClick={signOut}
          >
            <Icon name="logout" />
          </button>
        </div>
      </aside>
      <div className="workspace">
        <div className="small-screen-note">
          Para una mejor experiencia utilice una computadora.
        </div>
        <div className="topbar">
          <span>Alcaldía · Control de visitantes</span>
          <span className="system-state">
            <i /> Sistema conectado
          </span>
        </div>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}
