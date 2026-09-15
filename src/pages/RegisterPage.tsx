import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { getAuthErrorMessage } from '../features/auth/auth-errors'
import { useAuth } from '../features/auth/useAuth'
import { normalizeSpaces } from '../lib/text'

type RegisterPageProps = {
  onShowLogin: () => void
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function RegisterPage({ onShowLogin }: RegisterPageProps) {
  const { t } = useTranslation()
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
      return t('validation.required')
    }

    if (!EMAIL_PATTERN.test(email.trim())) {
      return t('validation.invalidEmail')
    }

    if (password.length < 8) {
      return t('validation.passwordLength')
    }

    if (password !== confirmPassword) {
      return t('validation.passwordMismatch')
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
        normalizeSpaces(firstName),
        normalizeSpaces(lastName),
        email.trim(),
        password,
      )

      if (result.requiresEmailConfirmation) {
        setSuccess(
          t('auth.confirmationRequired'),
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
          <span className="eyebrow">{t('common.brand')}</span>
          <h1 id="register-title">{t('auth.registerTitle')}</h1>
          <p>{t('auth.registerSubtitle')}</p>
        </header>

        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          <label>
            {t('common.firstName')}
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
            {t('common.lastName')}
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
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={submitting}
              minLength={8}
              required
            />
          </label>

          <label>
            {t('auth.confirmPassword')}
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
            {t(
              submitting
                ? 'auth.creatingAccount'
                : 'auth.createAccountLink',
            )}
          </button>
        </form>

        <p className="auth-switch">
          {t('auth.alreadyRegistered')}{' '}
          <button type="button" onClick={onShowLogin} disabled={submitting}>
            {t('auth.loginLink')}
          </button>
        </p>
      </section>
    </main>
  )
}
