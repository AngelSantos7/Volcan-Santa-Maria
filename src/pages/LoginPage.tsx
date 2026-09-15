import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { getAuthErrorMessage } from '../features/auth/auth-errors'
import { useAuth } from '../features/auth/useAuth'

type LoginPageProps = {
  onShowRegister: () => void
}

export function LoginPage({ onShowRegister }: LoginPageProps) {
  const { t } = useTranslation()
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)

    if (!email.trim() || !password) {
      setError(t('validation.required'))
      return
    }

    setSubmitting(true)

    try {
      await signIn(email.trim(), password)
    } catch (signInError) {
      setError(getAuthErrorMessage(signInError))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-card" aria-labelledby="login-title">
        <header className="auth-header">
          <span className="eyebrow">{t('common.brand')}</span>
          <h1 id="login-title">{t('auth.loginTitle')}</h1>
          <p>{t('auth.loginSubtitle')}</p>
        </header>

        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          <label>
            {t('common.email')}
            <input
              type="email"
              name="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={submitting}
              required
            />
          </label>

          <label>
            {t('common.password')}
            <input
              type="password"
              name="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={submitting}
              required
            />
          </label>

          {error && (
            <p className="form-message error-message" role="alert">
              {error}
            </p>
          )}

          <button className="primary-button" type="submit" disabled={submitting}>
            {t(submitting ? 'auth.loggingIn' : 'auth.loginSubmit')}
          </button>
        </form>

        <p className="auth-switch">
          {t('auth.noAccount')}{' '}
          <button type="button" onClick={onShowRegister} disabled={submitting}>
            {t('auth.createAccountLink')}
          </button>
        </p>
      </section>
    </main>
  )
}
