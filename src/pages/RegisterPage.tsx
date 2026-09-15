import { useState, type FormEvent } from 'react'
import { getAuthErrorMessage } from '../features/auth/auth-errors'
import { useAuth } from '../features/auth/useAuth'

type RegisterPageProps = {
  onShowLogin: () => void
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function RegisterPage({ onShowLogin }: RegisterPageProps) {
  const { signUp } = useAuth()
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const validate = (): string | null => {
    if (
      !firstName.trim() ||
      !lastName.trim() ||
      !email.trim() ||
      !password ||
      !confirmPassword
    ) {
      return 'Completa todos los campos.'
    }

    if (!EMAIL_PATTERN.test(email.trim())) {
      return 'Ingresa un correo electrónico válido.'
    }

    if (password.length < 8) {
      return 'La contraseña debe tener al menos 8 caracteres.'
    }

    if (password !== confirmPassword) {
      return 'Las contraseñas no coinciden.'
    }

    return null
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setSuccess(null)

    const validationError = validate()
    if (validationError) {
      setError(validationError)
      return
    }

    setSubmitting(true)

    try {
      const result = await signUp(
        firstName.trim(),
        lastName.trim(),
        email.trim(),
        password,
      )

      if (result.requiresEmailConfirmation) {
        setSuccess(
          'Cuenta creada. Revisa tu correo y confirma la cuenta antes de iniciar sesión.',
        )
        setPassword('')
        setConfirmPassword('')
      }
    } catch (signUpError) {
      setError(getAuthErrorMessage(signUpError))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-card" aria-labelledby="register-title">
        <header className="auth-header">
          <span className="eyebrow">Volcán Santa María</span>
          <h1 id="register-title">Crear cuenta</h1>
          <p>Regístrate para comenzar tu experiencia.</p>
        </header>

        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          <label>
            Nombre
            <input
              type="text"
              name="firstName"
              autoComplete="given-name"
              value={firstName}
              onChange={(event) => setFirstName(event.target.value)}
              disabled={submitting}
              required
            />
          </label>

          <label>
            Apellido
            <input
              type="text"
              name="lastName"
              autoComplete="family-name"
              value={lastName}
              onChange={(event) => setLastName(event.target.value)}
              disabled={submitting}
              required
            />
          </label>

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
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={submitting}
              minLength={8}
              required
            />
          </label>

          <label>
            Confirmar contraseña
            <input
              type="password"
              name="confirmPassword"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              disabled={submitting}
              minLength={8}
              required
            />
          </label>

          {error && (
            <p className="form-message error-message" role="alert">
              {error}
            </p>
          )}

          {success && (
            <p className="form-message success-message" role="status">
              {success}
            </p>
          )}

          <button className="primary-button" type="submit" disabled={submitting}>
            {submitting ? 'Creando cuenta…' : 'Crear cuenta'}
          </button>
        </form>

        <p className="auth-switch">
          ¿Ya tienes una cuenta?{' '}
          <button type="button" onClick={onShowLogin} disabled={submitting}>
            Iniciar sesión
          </button>
        </p>
      </section>
    </main>
  )
}
