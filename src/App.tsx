import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LanguageSwitcher } from './components/LanguageSwitcher'
import { useAuth } from './features/auth/useAuth'
import { ProfileGate } from './features/profile/ProfileGate'
import { LoginPage } from './pages/LoginPage'
import { RegisterPage } from './pages/RegisterPage'
import './App.css'

function App() {
  const { t } = useTranslation()
  const { session, loading } = useAuth()
  const [authView, setAuthView] = useState<'login' | 'register'>('login')

  let content

  if (loading) {
    content = (
      <main className="auth-shell">
        <p className="loading-message" role="status">
          {t('auth.checkingSession')}
        </p>
      </main>
    )
  } else if (session) {
    content = <ProfileGate key={session.user.id} />
  } else {
    content =
      authView === 'login' ? (
        <LoginPage onShowRegister={() => setAuthView('register')} />
      ) : (
        <RegisterPage onShowLogin={() => setAuthView('login')} />
      )
  }

  return (
    <>
      <LanguageSwitcher />
      {content}
    </>
  )
}

export default App
