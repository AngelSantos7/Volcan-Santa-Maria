import { useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  getAuthErrorMessage,
  getPrivateRequestErrorMessage,
} from '../features/auth/auth-errors';
import { normalizeEmail } from '../features/auth/registration-validation';
import { useAuth } from '../features/auth/useAuth';

type LoginPageProps = {
  onShowRegister: () => void;
};

type LoginErrors = {
  email?: string;
  password?: string;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

function focusFirstInvalid(form: HTMLFormElement | null) {
  const target = form?.querySelector<HTMLElement>('[aria-invalid="true"]');
  if (!target) return;

  target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  target.focus({ preventScroll: true });
}

export function LoginPage({ onShowRegister }: LoginPageProps) {
  const { t } = useTranslation();
  const { signIn, requestPasswordReset } = useAuth();
  const formRef = useRef<HTMLFormElement>(null);
  const [view, setView] = useState<'login' | 'forgot-password'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<LoginErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [resetRequestSent, setResetRequestSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const setEmailValue = (value: string) => {
    setEmail(value);
    setError(null);
    setFieldErrors((currentErrors) => {
      if (!currentErrors.email) return currentErrors;
      const nextErrors = { ...currentErrors };
      const normalized = normalizeEmail(value);
      if (normalized && EMAIL_PATTERN.test(normalized)) delete nextErrors.email;
      return nextErrors;
    });
  };

  const setPasswordValue = (value: string) => {
    setPassword(value);
    setError(null);
    if (!value || !fieldErrors.password) return;
    setFieldErrors((currentErrors) => {
      const nextErrors = { ...currentErrors };
      delete nextErrors.password;
      return nextErrors;
    });
  };

  const validateEmail = (): LoginErrors => {
    const normalized = normalizeEmail(email);
    if (!normalized) return { email: 'validation.emailRequired' };
    if (!EMAIL_PATTERN.test(normalized)) {
      return { email: 'validation.invalidEmail' };
    }
    return {};
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const errors = validateEmail();
    if (!password) errors.password = 'validation.passwordRequired';
    setFieldErrors(errors);

    if (Object.keys(errors).length > 0) {
      requestAnimationFrame(() => focusFirstInvalid(formRef.current));
      return;
    }

    const normalizedEmail = normalizeEmail(email);
    setEmail(normalizedEmail);
    setSubmitting(true);

    try {
      await signIn(normalizedEmail, password);
    } catch (signInError) {
      setError(getAuthErrorMessage(signInError));
    } finally {
      setSubmitting(false);
    }
  };

  const handlePasswordResetRequest = async (
    event: FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();
    setError(null);

    const errors = validateEmail();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      requestAnimationFrame(() => focusFirstInvalid(formRef.current));
      return;
    }

    const normalizedEmail = normalizeEmail(email);
    setEmail(normalizedEmail);
    setSubmitting(true);

    try {
      await requestPasswordReset(normalizedEmail);
      setResetRequestSent(true);
    } catch (requestError) {
      const publicError = getPrivateRequestErrorMessage(requestError);
      if (publicError) setError(publicError);
      else setResetRequestSent(true);
    } finally {
      setSubmitting(false);
    }
  };

  const showForgotPassword = () => {
    setView('forgot-password');
    setPassword('');
    setFieldErrors({});
    setError(null);
    setResetRequestSent(false);
  };

  const showLogin = () => {
    setView('login');
    setFieldErrors({});
    setError(null);
    setResetRequestSent(false);
  };

  if (view === 'forgot-password') {
    return (
      <main className="auth-shell">
        <section className="auth-card" aria-labelledby="forgot-password-title">
          <header className="auth-header">
            <span className="eyebrow">{t('common.brand')}</span>
            <h1 id="forgot-password-title">{t('auth.forgotPasswordTitle')}</h1>
            <p>{t('auth.forgotPasswordSubtitle')}</p>
          </header>

          {resetRequestSent ? (
            <div className="auth-result" role="status">
              <p className="form-message success-message">
                {t('auth.passwordResetRequestSent')}
              </p>
              <button
                className="secondary-button"
                type="button"
                onClick={showLogin}
              >
                {t('auth.backToLogin')}
              </button>
            </div>
          ) : (
            <form
              className="auth-form"
              onSubmit={handlePasswordResetRequest}
              noValidate
              ref={formRef}
            >
              {Object.keys(fieldErrors).length > 0 && (
                <p className="form-message error-message" role="alert">
                  {t('validation.completeRequiredFields')}
                </p>
              )}

              <label>
                {t('common.email')}
                <input
                  type="email"
                  name="email"
                  autoComplete="email"
                  inputMode="email"
                  value={email}
                  onChange={(event) => setEmailValue(event.target.value)}
                  onBlur={() => setEmailValue(normalizeEmail(email))}
                  disabled={submitting}
                  aria-invalid={Boolean(fieldErrors.email)}
                  aria-describedby={
                    fieldErrors.email ? 'forgot-email-error' : undefined
                  }
                  maxLength={254}
                  autoFocus
                  required
                />
                {fieldErrors.email && (
                  <span
                    className="field-error"
                    id="forgot-email-error"
                    role="alert"
                  >
                    {t(fieldErrors.email)}
                  </span>
                )}
              </label>

              {error && (
                <p className="form-message error-message" role="alert">
                  {error}
                </p>
              )}

              <button
                className="primary-button"
                type="submit"
                disabled={submitting}
              >
                {t(
                  submitting
                    ? 'auth.sendingPasswordReset'
                    : 'auth.sendPasswordReset'
                )}
              </button>
              <button
                className="secondary-button"
                type="button"
                onClick={showLogin}
                disabled={submitting}
              >
                {t('auth.backToLogin')}
              </button>
            </form>
          )}
        </section>
      </main>
    );
  }

  const fieldErrorCount = Object.keys(fieldErrors).length;

  return (
    <main className="auth-shell">
      <section className="auth-card" aria-labelledby="login-title">
        <header className="auth-header">
          <span className="eyebrow">{t('common.brand')}</span>
          <h1 id="login-title">{t('auth.loginTitle')}</h1>
          <p>{t('auth.loginSubtitle')}</p>
        </header>

        <form
          className="auth-form"
          onSubmit={handleSubmit}
          noValidate
          ref={formRef}
        >
          {fieldErrorCount > 0 && (
            <p className="form-message error-message" role="alert">
              {t('validation.completeRequiredFields')}
            </p>
          )}

          <label>
            {t('common.email')}
            <input
              type="email"
              name="email"
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={(event) => setEmailValue(event.target.value)}
              onBlur={() => setEmailValue(normalizeEmail(email))}
              disabled={submitting}
              aria-invalid={Boolean(fieldErrors.email)}
              aria-describedby={
                fieldErrors.email ? 'login-email-error' : undefined
              }
              maxLength={254}
              required
            />
            {fieldErrors.email && (
              <span className="field-error" id="login-email-error" role="alert">
                {t(fieldErrors.email)}
              </span>
            )}
          </label>

          <label>
            {t('common.password')}
            <input
              type="password"
              name="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPasswordValue(event.target.value)}
              disabled={submitting}
              aria-invalid={Boolean(fieldErrors.password)}
              aria-describedby={
                fieldErrors.password ? 'login-password-error' : undefined
              }
              required
            />
            {fieldErrors.password && (
              <span
                className="field-error"
                id="login-password-error"
                role="alert"
              >
                {t(fieldErrors.password)}
              </span>
            )}
          </label>

          <button
            className="auth-text-button"
            type="button"
            onClick={showForgotPassword}
            disabled={submitting}
          >
            {t('auth.forgotPassword')}
          </button>

          {error && (
            <p className="form-message error-message" role="alert">
              {error}
            </p>
          )}

          <button
            className="primary-button"
            type="submit"
            disabled={submitting}
          >
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
  );
}
