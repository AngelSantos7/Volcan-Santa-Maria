import { useEffect, useRef, type ReactNode } from 'react';
import type { AdminSession } from '../types';
import { Icon } from './ui';

export type PageId =
  | 'dashboard'
  | 'visitors'
  | 'ascents'
  | 'reports'
  | 'notifications'
  | 'staff'
  | 'audit'
  | 'gallery';

const mainNav: Array<[PageId, string, string]> = [
  ['dashboard', 'Dashboard', 'dashboard'],
  ['ascents', 'Ascensos', 'ascent'],
  ['visitors', 'Visitantes', 'visitors'],
  ['reports', 'Reportes', 'dashboard'],
  ['notifications', 'Notificaciones', 'audit'],
  ['gallery', 'Galería', 'ascent'],
];

const adminNav: Array<[PageId, string, string]> = [
  ['staff', 'Gestores', 'staff'],
  ['audit', 'Auditoría', 'audit'],
];

export function AdminShell({
  session,
  page,
  setPage,
  signOut,
  changePassword,
  children,
}: {
  session: AdminSession;
  page: PageId;
  setPage: (page: PageId) => void;
  signOut: () => void;
  changePassword: () => void;
  children: ReactNode;
}) {
  const accountRef = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !accountRef.current?.contains(event.target)) accountRef.current?.removeAttribute('open');
    };
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, []);
  const isAdmin = session.role === 'admin';
  const canManageNotifications =
    isAdmin || Boolean(session.permissions.can_manage_notifications);
  const canManageGallery =
    isAdmin || Boolean(session.permissions.can_manage_gallery);
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
          {mainNav.filter(([id]) =>
            (id !== 'notifications' || canManageNotifications) &&
            (id !== 'gallery' || canManageGallery)
          ).map(([id, label, icon]) => (
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
        <details ref={accountRef} className="sidebar-account" onKeyDown={(event) => {
          if (event.key === 'Escape') { accountRef.current?.removeAttribute('open'); accountRef.current?.querySelector('summary')?.focus(); }
        }}>
          <summary className="sidebar-user" aria-label={`Mi cuenta: ${name}`}>
            <div className="user-dot">{name[0]?.toUpperCase()}</div>
            <div className="sidebar-user-name"><strong>{name}</strong><span>{isAdmin ? 'Administrador' : 'Gestor de visitantes'}</span></div>
            <span className="account-chevron" aria-hidden="true">⌄</span>
          </summary>
          <div className="sidebar-account-menu">
            <strong>Mi cuenta</strong><span>{name}</span><small>{session.email}</small>
            <button type="button" onClick={() => { accountRef.current?.removeAttribute('open'); changePassword(); }}>Cambiar contraseña</button>
            <button type="button" onClick={signOut}><Icon name="logout" />Cerrar sesión</button>
          </div>
        </details>
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
