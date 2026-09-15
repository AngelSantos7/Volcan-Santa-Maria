import { useState, type FormEvent } from 'react'
import { getAuthErrorMessage } from '../features/auth/auth-errors'
import { useAuth } from '../features/auth/useAuth'

type LoginPageProps = {
  onShowRegister: () => void
}

export function LoginPage({ onShowRegister }: LoginPageProps) {
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)

    if (!email.trim() || !password) {
      setError('Completa todos los campos.')
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
          <span className="eyebrow">Volcán Santa María</span>
          <h1 id="login-title">Iniciar sesión</h1>
          <p>Ingresa con tu correo electrónico para continuar.</p>
        </header>

        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          <label>
            Correo electrónico
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
            Contraseña
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
            {submitting ? 'Ingresando…' : 'Ingresar'}
          </button>
        </form>

        <p className="auth-switch">
          ¿Aún no tienes una cuenta?{' '}
          <button type="button" onClick={onShowRegister} disabled={submitting}>
            Crear cuenta
          </button>
        </p>
      </section>
    </main>
  )
}
