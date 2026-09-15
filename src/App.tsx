import { useState } from 'react'
import { useAuth } from './features/auth/useAuth'
import { AuthenticatedPage } from './pages/AuthenticatedPage'
import { LoginPage } from './pages/LoginPage'
import { RegisterPage } from './pages/RegisterPage'
import './App.css'

function App() {
  const { session, loading } = useAuth()
  const [authView, setAuthView] = useState<'login' | 'register'>('login')

  if (loading) {
    return (
      <main className="auth-shell">
        <p className="loading-message" role="status">
          Verificando sesión…
        </p>
      </main>
    )
  }

  if (session) return <AuthenticatedPage />

  return authView === 'login' ? (
    <LoginPage onShowRegister={() => setAuthView('register')} />
  ) : (
    <RegisterPage onShowLogin={() => setAuthView('login')} />
  )
}

export default App
