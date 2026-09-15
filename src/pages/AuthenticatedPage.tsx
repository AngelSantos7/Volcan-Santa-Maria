import { useState } from 'react'
import { getAuthErrorMessage } from '../features/auth/auth-errors'
import { useAuth } from '../features/auth/useAuth'

export function AuthenticatedPage() {
  const { user, signOut } = useAuth()
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const firstName =
    typeof user?.user_metadata.first_name === 'string'
      ? user.user_metadata.first_name
      : ''
  const lastName =
    typeof user?.user_metadata.last_name === 'string'
      ? user.user_metadata.last_name
      : ''
  const displayName = `${firstName} ${lastName}`.trim()

  const handleSignOut = async () => {
    setError(null)
    setSubmitting(true)

    try {
      await signOut()
    } catch (signOutError) {
      setError(getAuthErrorMessage(signOutError))
      setSubmitting(false)
    }
  }

  return (
    <main className="auth-shell">
      <section
        className="auth-card authenticated-card"
        aria-labelledby="welcome-title"
      >
        <div className="status-mark" aria-hidden="true">
          ✓
        </div>
        <header className="auth-header">
          <span className="eyebrow">Sesión activa</span>
          <h1 id="welcome-title">
            ¡Bienvenido{displayName ? `, ${displayName}` : ''}!
          </h1>
          <p>Tu cuenta está autenticada correctamente.</p>
        </header>

        <div className="account-detail">
          <span>Correo electrónico</span>
          <strong>{user?.email ?? 'No disponible'}</strong>
        </div>

        {error && (
          <p className="form-message error-message" role="alert">
            {error}
          </p>
        )}

        <button
          className="secondary-button"
          type="button"
          onClick={handleSignOut}
          disabled={submitting}
        >
          {submitting ? 'Cerrando sesión…' : 'Cerrar sesión'}
        </button>
      </section>
    </main>
  )
}
