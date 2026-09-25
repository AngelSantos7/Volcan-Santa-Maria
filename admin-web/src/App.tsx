import { useEffect, useState, type FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { AdminShell, type PageId } from './components/AdminShell'
import { DashboardPage } from './pages/DashboardPage'
import { VisitorsPage } from './pages/VisitorsPage'
import { AscentsPage } from './pages/AscentsPage'
import { ReturnsPage } from './pages/ReturnsPage'
import { StaffPage } from './pages/StaffPage'
import { PermissionsPage } from './pages/PermissionsPage'
import { AuditPage } from './pages/AuditPage'
import { getAdminSession } from './services/admin-service'
import { supabase } from './lib/supabase'
import type { AdminSession } from './types'

type AccessState = 'loading' | 'signed-out' | 'allowed' | 'forbidden' | 'error'

function Login({ signIn, error }: { signIn: (event: FormEvent<HTMLFormElement>) => void; error: string }) {
  return <main className="login-page"><section className="login-card" aria-labelledby="login-title"><div className="brand-mark">VS</div><p className="eyebrow">Volcán Santa María</p><h1 id="login-title">Gestor de Visitantes</h1><p className="muted">Control administrativo de ingreso y egreso</p><form onSubmit={signIn}><label htmlFor="email">Correo electrónico</label><input id="email" name="email" type="email" autoComplete="email" required/><label htmlFor="password">Contraseña</label><input id="password" name="password" type="password" autoComplete="current-password" required/>{error && <div className="alert error" role="alert">{error}</div>}<button type="submit">Iniciar sesión</button></form></section><p className="small-screen-note login-note">Para una mejor experiencia utilice una computadora.</p></main>
}

function AccessMessage({ title, detail, signOut }: { title: string; detail: string; signOut: () => void }) {
  return <main className="access-page"><section className="access-card"><div className="brand-mark">VS</div><p className="eyebrow">Acceso administrativo</p><h1>{title}</h1><p>{detail}</p><button type="button" onClick={signOut}>Cerrar sesión</button></section></main>
}

export default function App() {
  const [access, setAccess] = useState<AccessState>('loading')
  const [session, setSession] = useState<Session | null>(null)
  const [adminSession, setAdminSession] = useState<AdminSession | null>(null)
  const [page, setPage] = useState<PageId>('dashboard')
  const [permissionUserId, setPermissionUserId] = useState<string | null>(null)
  const [error, setError] = useState('')

  async function checkAccess(nextSession: Session | null) {
    setSession(nextSession)
    if (!nextSession) { setAdminSession(null); setAccess('signed-out'); return }
    setAccess('loading')
    try {
      const profile = await getAdminSession()
      setAdminSession(profile)
      setAccess((profile.role === 'admin' || (profile.role === 'visitor_manager' && profile.is_active)) ? 'allowed' : 'forbidden')
    } catch { setAccess('error') }
  }

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => checkAccess(data.session))
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => { void checkAccess(nextSession) })
    return () => data.subscription.unsubscribe()
  }, [])

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setAccess('loading')
    const form = new FormData(event.currentTarget)
    const { data, error: authError } = await supabase.auth.signInWithPassword({ email: String(form.get('email') ?? ''), password: String(form.get('password') ?? '') })
    if (authError) { setError('No fue posible iniciar sesión. Verifique sus credenciales.'); setAccess('signed-out'); return }
    await checkAccess(data.session)
  }

  function signOut() { void supabase.auth.signOut() }
  if (access === 'loading') return <main className="access-page"><div className="loader"/><p>Verificando acceso seguro…</p></main>
  if (access === 'signed-out') return <Login signIn={signIn} error={error}/>
  if (access === 'forbidden') return <AccessMessage title="Acceso no autorizado" detail="No tiene permisos para acceder al Gestor de Visitantes." signOut={signOut}/>
  if (access === 'error' || !session || !adminSession) return <AccessMessage title="No se pudo verificar el acceso" detail="Intente cerrar sesión e ingresar nuevamente." signOut={signOut}/>

  const isAdmin = adminSession.role === 'admin'
  const canView = isAdmin || Boolean(adminSession.permissions.can_view_visitors)
  const canVisitors = canView || Boolean(adminSession.permissions.can_register_walk_in_visitors)
  const canAscents = canView || Boolean(adminSession.permissions.can_manage_visits)
  const canReturns = canView || Boolean(adminSession.permissions.can_confirm_returns)
  let content
  if (page === 'dashboard') content = canView ? <DashboardPage/> : <AccessMessage title="Permiso requerido" detail="Solicite el permiso para ver visitantes." signOut={signOut}/>
  else if (page === 'visitors') content = canVisitors ? <VisitorsPage session={adminSession}/> : <AccessMessage title="Permiso requerido" detail="Solicite permiso para consultar o registrar visitantes." signOut={signOut}/>
  else if (page === 'ascents') content = canAscents ? <AscentsPage session={adminSession}/> : <AccessMessage title="Permiso requerido" detail="No tiene acceso a los ascensos." signOut={signOut}/>
  else if (page === 'returns') content = canReturns ? <ReturnsPage session={adminSession}/> : <AccessMessage title="Permiso requerido" detail="No tiene acceso al control de retornos." signOut={signOut}/>
  else if (!isAdmin) content = <AccessMessage title="Solo administradores" detail="Esta sección requiere el rol Administrador." signOut={signOut}/>
  else if (page === 'staff') content = <StaffPage managePermissions={(userId) => { setPermissionUserId(userId); setPage('permissions') }}/>
  else if (page === 'permissions') content = <PermissionsPage initialUserId={permissionUserId}/>
  else content = <AuditPage/>

  return <AdminShell session={adminSession} page={page} setPage={(next) => { setPermissionUserId(null); setPage(next) }} signOut={signOut}>{content}</AdminShell>
}
