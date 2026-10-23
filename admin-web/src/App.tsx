import { PasswordField } from './components/PasswordField';
import { AccountPassword, PasswordResetRequest } from './components/AccountPassword';
import { useEffect, useState, type FormEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import { AdminShell, type PageId } from './components/AdminShell';
import { DashboardPage } from './pages/DashboardPage';
import { VisitorsPage } from './pages/VisitorsPage';
import { AscentsPage } from './pages/AscentsPage';
import { StaffPage } from './pages/StaffPage';
import { AuditPage } from './pages/AuditPage';
import { ReportsPage } from './pages/ReportsPage';
import { NotificationsPage } from './pages/NotificationsPage';
import { GalleryPage } from './pages/GalleryPage';
import { getAdminSession } from './services/admin-service';
import { supabase } from './lib/supabase';
import type { AdminSession } from './types';

type AccessState = 'loading' | 'signed-out' | 'allowed' | 'forbidden' | 'error';

function Login({
  signIn,
  error,
  onRecover,
}: {
  signIn: (event: FormEvent<HTMLFormElement>) => void;
  error: string;
  onRecover: () => void;
}) {
  return (
    <main className="login-page">
      <section className="login-card" aria-labelledby="login-title">
        <div className="brand-mark">VS</div>
        <p className="eyebrow">Volcán Santa María</p>
        <h1 id="login-title">Gestor de Visitantes</h1>
        <p className="muted">Control administrativo de ingreso y egreso</p>
        <form onSubmit={signIn}>
          <label htmlFor="email">Correo electrónico</label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
          />
          <label htmlFor="password">Contraseña</label>
          <PasswordField
            id="password"
            name="password"
            autoComplete="current-password"
            required
          />
          {error && (
            <div className="alert error" role="alert">
              {error}
            </div>
          )}
          <button type="submit">Iniciar sesión</button>
          <button type="button" className="login-recovery-link" onClick={onRecover}>¿Olvidó su contraseña?</button>
        </form>
      </section>
      <p className="small-screen-note login-note">
        Para una mejor experiencia utilice una computadora.
      </p>
    </main>
  );
}

function AccessMessage({
  title,
  detail,
  signOut,
}: {
  title: string;
  detail: string;
  signOut: () => void;
}) {
  return (
    <main className="access-page">
      <section className="access-card">
        <div className="brand-mark">VS</div>
        <p className="eyebrow">Acceso administrativo</p>
        <h1>{title}</h1>
        <p>{detail}</p>
        <button type="button" onClick={signOut}>
          Cerrar sesión
        </button>
      </section>
    </main>
  );
}

export default function App() {
  const [requestingReset, setRequestingReset] = useState(false);
  const [passwordMode, setPasswordMode] = useState<'change' | 'recovery' | null>(null);
  const [access, setAccess] = useState<AccessState>('loading');
  const [session, setSession] = useState<Session | null>(null);
  const [adminSession, setAdminSession] = useState<AdminSession | null>(null);
  const [page, setPage] = useState<PageId>('dashboard');
  const [ascentSearch, setAscentSearch] = useState('');
  const [error, setError] = useState('');

  async function checkAccess(nextSession: Session | null) {
    setSession(nextSession);
    if (!nextSession) {
      setAdminSession(null);
      setAccess('signed-out');
      return;
    }
    setAccess('loading');
    try {
      const profile = await getAdminSession();
      setAdminSession(profile);
      setAccess(
        profile.role === 'admin' ||
          (profile.role === 'visitor_manager' && profile.is_active)
          ? 'allowed'
          : 'forbidden'
      );
    } catch {
      setAccess('error');
    }
  }

  useEffect(() => {
    void supabase.auth
      .getSession()
      .then(({ data }) => checkAccess(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (_event === 'PASSWORD_RECOVERY') setPasswordMode('recovery');
      if (_event === 'SIGNED_OUT') setPasswordMode(null);
      window.setTimeout(() => { void checkAccess(nextSession); }, 0);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setAccess('loading');
    const form = new FormData(event.currentTarget);
    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email: String(form.get('email') ?? ''),
      password: String(form.get('password') ?? ''),
    });
    if (authError) {
      setError('No fue posible iniciar sesión. Verifique sus credenciales.');
      setAccess('signed-out');
      return;
    }
    await checkAccess(data.session);
  }

  function signOut() {
    void supabase.auth.signOut();
  }
  if (requestingReset) return <PasswordResetRequest close={() => setRequestingReset(false)} />;
  if (session && (passwordMode || adminSession?.invitation_status === 'pending')) return <AccountPassword
    invitation={adminSession?.invitation_status === 'pending'}
    recovery={passwordMode === 'recovery'}
    close={adminSession?.invitation_status === 'pending' ? undefined : () => setPasswordMode(null)}
    onSaved={async () => {
      setPasswordMode(null);
      window.history.replaceState({}, '', window.location.pathname);
      await checkAccess(session);
    }} />;
  if (access === 'loading')
    return (
      <main className="access-page">
        <div className="loader" />
        <p>Verificando acceso seguro…</p>
      </main>
    );
  if (access === 'signed-out') return <Login signIn={signIn} error={error} onRecover={() => setRequestingReset(true)} />;
  if (access === 'forbidden')
    return (
      <AccessMessage
        title="Acceso no autorizado"
        detail="No tiene permisos para acceder al Gestor de Visitantes."
        signOut={signOut}
      />
    );
  if (access === 'error' || !session || !adminSession)
    return (
      <AccessMessage
        title="No se pudo verificar el acceso"
        detail="Intente cerrar sesión e ingresar nuevamente."
        signOut={signOut}
      />
    );

  const isAdmin = adminSession.role === 'admin';
  const canView =
    isAdmin || Boolean(adminSession.permissions.can_view_visitors);
  const canVisitors =
    canView || Boolean(adminSession.permissions.can_register_walk_in_visitors);
  const canAscents =
    canView || Boolean(adminSession.permissions.can_manage_visits);
  const canReports =
    isAdmin || Boolean(adminSession.permissions.can_export_reports);
  const canNotifications =
    isAdmin || Boolean(adminSession.permissions.can_manage_notifications);
  const canGallery =
    isAdmin || Boolean(adminSession.permissions.can_manage_gallery);
  let content;
  if (page === 'dashboard')
    content = canView ? (
      <DashboardPage onOpenAscent={(joinCode) => { setAscentSearch(joinCode); setPage('ascents'); }} />
    ) : (
      <AccessMessage
        title="Permiso requerido"
        detail="Solicite el permiso para ver visitantes."
        signOut={signOut}
      />
    );
  else if (page === 'visitors')
    content = canVisitors ? (
      <VisitorsPage session={adminSession} />
    ) : (
      <AccessMessage
        title="Permiso requerido"
        detail="Solicite permiso para consultar o registrar visitantes."
        signOut={signOut}
      />
    );
  else if (page === 'ascents')
    content = canAscents ? (
      <AscentsPage session={adminSession} initialSearch={ascentSearch} />
    ) : (
      <AccessMessage
        title="Permiso requerido"
        detail="No tiene acceso a los ascensos."
        signOut={signOut}
      />
    );
  else if (page === 'reports')
    content = canReports ? (
      <ReportsPage />
    ) : (
      <AccessMessage
        title="Permiso requerido"
        detail="No tiene autorización para generar reportes."
        signOut={signOut}
      />
    );
  else if (page === 'notifications')
    content = canNotifications ? (
      <NotificationsPage />
    ) : (
      <AccessMessage title="Permiso requerido" detail="No tiene autorización para gestionar notificaciones." signOut={signOut} />
    );
  else if (page === 'gallery')
    content = canGallery ? <GalleryPage /> : (
      <AccessMessage title="Permiso requerido" detail="No tiene autorización para gestionar la galería." signOut={signOut} />
    );
  else if (!isAdmin)
    content = (
      <AccessMessage
        title="Solo administradores"
        detail="Esta sección requiere el rol Administrador."
        signOut={signOut}
      />
    );
  else if (page === 'staff') content = <StaffPage />;
  else content = <AuditPage />;

  return (
    <AdminShell
      session={adminSession}
      page={page}
      setPage={(next) => {
        if (next !== 'ascents') setAscentSearch('');
        setPage(next);
      }}
      signOut={signOut}
      changePassword={() => setPasswordMode('change')}
    >
      {content}
    </AdminShell>
  );
}
