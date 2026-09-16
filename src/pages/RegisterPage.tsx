import {
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { useTranslation } from 'react-i18next';
import {
  getAuthErrorMessage,
  getPrivateRequestErrorMessage,
  isExistingAccountError,
} from '../features/auth/auth-errors';
import {
  normalizeEmail,
  normalizePersonName,
  validateRegistration,
  validateRegistrationField,
  type RegistrationErrors,
  type RegistrationField,
  type RegistrationValues,
} from '../features/auth/registration-validation';
import { TurnstileWidget } from '../features/auth/TurnstileWidget';
import { useAuth } from '../features/auth/useAuth';

type RegisterPageProps = {
  onShowLogin: () => void;
  onAccountCreated: () => void;
  onEmailConfirmationRequired: (email: string) => void;
};

const INITIAL_VALUES: RegistrationValues = {
  firstName: '',
  lastName: '',
  email: '',
  password: '',
  confirmPassword: '',
};

const TURNSTILE_SITE_KEY =
  import.meta.env.VITE_TURNSTILE_SITE_KEY?.trim() || null;

function focusField(form: HTMLFormElement | null, field: RegistrationField) {
  const target = form?.querySelector<HTMLElement>(`[data-field="${field}"]`);
  if (!target) return;

  target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  target.focus({ preventScroll: true });
}

function preventImplicitSubmit(event: ReactKeyboardEvent<HTMLFormElement>) {
  if (event.key === 'Enter' && event.target instanceof HTMLInputElement) {
    event.preventDefault();
  }
}

export function RegisterPage({
  onShowLogin,
  onAccountCreated,
  onEmailConfirmationRequired,
}: RegisterPageProps) {
  const { t } = useTranslation();
  const { signUp, requestPasswordReset } = useAuth();
  const formRef = useRef<HTMLFormElement>(null);
  const [values, setValues] = useState<RegistrationValues>(INITIAL_VALUES);
  const [errors, setErrors] = useState<RegistrationErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [accountExists, setAccountExists] = useState(false);
  const [resetRequestSent, setResetRequestSent] = useState(false);
  const [requestingReset, setRequestingReset] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaResetKey, setCaptchaResetKey] = useState(0);

  const setField = (field: keyof RegistrationValues, value: string) => {
    const nextValues = { ...values, [field]: value };
    setValues(nextValues);
    setSubmitError(null);
    setAccountExists(false);
    setResetRequestSent(false);

    setErrors((currentErrors) => {
      const fieldsToCheck: RegistrationField[] =
        field === 'password' ? ['password', 'confirmPassword'] : [field];
      const nextErrors = { ...currentErrors };

      for (const currentField of fieldsToCheck) {
        if (!Object.hasOwn(currentErrors, currentField)) continue;

        const fieldError = validateRegistrationField(
          currentField,
          nextValues,
          Boolean(TURNSTILE_SITE_KEY),
          captchaToken
        );
        if (fieldError) nextErrors[currentField] = fieldError;
        else delete nextErrors[currentField];
      }

      return nextErrors;
    });
  };

  const normalizeField = (field: 'firstName' | 'lastName' | 'email') => {
    const normalized =
      field === 'email'
        ? normalizeEmail(values[field])
        : normalizePersonName(values[field]);
    setField(field, normalized);
  };

  const handleCaptchaToken = (token: string | null) => {
    setCaptchaToken(token);
    if (!token) return;

    setErrors((currentErrors) => {
      if (!currentErrors.captcha) return currentErrors;
      const nextErrors = { ...currentErrors };
      delete nextErrors.captcha;
      return nextErrors;
    });
  };

  const handleCaptchaIssue = (messageKey: string) => {
    setCaptchaToken(null);
    if (!submitAttempted) return;

    setErrors((currentErrors) => ({
      ...currentErrors,
      captcha: messageKey,
    }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitAttempted(true);
    setSubmitError(null);
    setAccountExists(false);
    setResetRequestSent(false);

    const validationErrors = validateRegistration(
      values,
      Boolean(TURNSTILE_SITE_KEY),
      captchaToken
    );
    setErrors(validationErrors);

    const firstInvalidField = Object.keys(validationErrors)[0] as
      RegistrationField | undefined;
    if (firstInvalidField) {
      if (firstInvalidField === 'captcha' && TURNSTILE_SITE_KEY) {
        setCaptchaResetKey((currentKey) => currentKey + 1);
      }
      requestAnimationFrame(() =>
        focusField(formRef.current, firstInvalidField)
      );
      return;
    }

    const normalizedFirstName = normalizePersonName(values.firstName);
    const normalizedLastName = normalizePersonName(values.lastName);
    const normalizedEmail = normalizeEmail(values.email);
    setValues((currentValues) => ({
      ...currentValues,
      firstName: normalizedFirstName,
      lastName: normalizedLastName,
      email: normalizedEmail,
    }));
    setSubmitting(true);

    try {
      const result = await signUp({
        firstName: normalizedFirstName,
        lastName: normalizedLastName,
        email: normalizedEmail,
        password: values.password,
        captchaToken: captchaToken ?? undefined,
      });

      onAccountCreated();
      if (result.requiresEmailConfirmation) {
        onEmailConfirmationRequired(result.email);
      }
    } catch (signUpError) {
      if (isExistingAccountError(signUpError)) {
        setAccountExists(true);
      } else {
        setSubmitError(getAuthErrorMessage(signUpError));
      }
      if (TURNSTILE_SITE_KEY) {
        setCaptchaToken(null);
        setCaptchaResetKey((currentKey) => currentKey + 1);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handlePasswordReset = async () => {
    const normalizedEmail = normalizeEmail(values.email);
    if (!normalizedEmail) return;

    setRequestingReset(true);
    setSubmitError(null);

    try {
      await requestPasswordReset(normalizedEmail);
      setResetRequestSent(true);
    } catch (requestError) {
      const publicError = getPrivateRequestErrorMessage(requestError);
      if (publicError) setSubmitError(publicError);
      else setResetRequestSent(true);
    } finally {
      setRequestingReset(false);
    }
  };

  const errorCount = Object.keys(errors).length;

  return (
    <main className="auth-shell">
      <section className="auth-card" aria-labelledby="register-title">
        <header className="auth-header">
          <span className="eyebrow">{t('common.brand')}</span>
          <h1 id="register-title">{t('auth.registerTitle')}</h1>
          <p>{t('auth.registerSubtitle')}</p>
        </header>

        <form
          className="auth-form"
          onSubmit={handleSubmit}
          onKeyDown={preventImplicitSubmit}
          noValidate
          ref={formRef}
        >
          {submitAttempted && errorCount > 0 && (
            <p className="form-message error-message" role="alert">
              {t('validation.completeRequiredFields')}
            </p>
          )}

          <label>
            {t('common.firstName')}
            <input
              type="text"
              name="firstName"
              data-field="firstName"
              autoComplete="given-name"
              value={values.firstName}
              onChange={(event) => setField('firstName', event.target.value)}
              onBlur={() => normalizeField('firstName')}
              disabled={submitting}
              aria-invalid={Boolean(errors.firstName)}
              aria-describedby={
                errors.firstName ? 'first-name-error' : undefined
              }
              maxLength={100}
              required
            />
            {errors.firstName && (
              <span className="field-error" id="first-name-error" role="alert">
                {t(errors.firstName)}
              </span>
            )}
          </label>

          <label>
            {t('common.lastName')}
            <input
              type="text"
              name="lastName"
              data-field="lastName"
              autoComplete="family-name"
              value={values.lastName}
              onChange={(event) => setField('lastName', event.target.value)}
              onBlur={() => normalizeField('lastName')}
              disabled={submitting}
              aria-invalid={Boolean(errors.lastName)}
              aria-describedby={errors.lastName ? 'last-name-error' : undefined}
              maxLength={100}
              required
            />
            {errors.lastName && (
              <span className="field-error" id="last-name-error" role="alert">
                {t(errors.lastName)}
              </span>
            )}
          </label>

          <label>
            {t('common.email')}
            <input
              type="email"
              name="email"
              data-field="email"
              autoComplete="email"
              inputMode="email"
              value={values.email}
              onChange={(event) => setField('email', event.target.value)}
              onBlur={() => normalizeField('email')}
              disabled={submitting}
              aria-invalid={Boolean(errors.email)}
              aria-describedby={
                errors.email ? 'register-email-error' : undefined
              }
              maxLength={254}
              required
            />
            {errors.email && (
              <span
                className="field-error"
                id="register-email-error"
                role="alert"
              >
                {t(errors.email)}
              </span>
            )}
          </label>

          <label>
            {t('common.password')}
            <input
              type="password"
              name="password"
              data-field="password"
              autoComplete="new-password"
              value={values.password}
              onChange={(event) => setField('password', event.target.value)}
              disabled={submitting}
              aria-invalid={Boolean(errors.password)}
              aria-describedby={
                errors.password ? 'register-password-error' : undefined
              }
              minLength={8}
              required
            />
            {errors.password && (
              <span
                className="field-error"
                id="register-password-error"
                role="alert"
              >
                {t(errors.password)}
              </span>
            )}
          </label>

          <label>
            {t('auth.confirmPassword')}
            <input
              type="password"
              name="confirmPassword"
              data-field="confirmPassword"
              autoComplete="new-password"
              value={values.confirmPassword}
              onChange={(event) =>
                setField('confirmPassword', event.target.value)
              }
              disabled={submitting}
              aria-invalid={Boolean(errors.confirmPassword)}
              aria-describedby={
                errors.confirmPassword
                  ? 'register-confirm-password-error'
                  : undefined
              }
              minLength={8}
              required
            />
            {errors.confirmPassword && (
              <span
                className="field-error"
                id="register-confirm-password-error"
                role="alert"
              >
                {t(errors.confirmPassword)}
              </span>
            )}
          </label>

          {TURNSTILE_SITE_KEY && (
            <div
              className="auth-captcha"
              data-field="captcha"
              tabIndex={-1}
              aria-invalid={Boolean(errors.captcha)}
              aria-describedby={errors.captcha ? 'captcha-error' : undefined}
            >
              <TurnstileWidget
                siteKey={TURNSTILE_SITE_KEY}
                action="signup"
                resetKey={captchaResetKey}
                onTokenChange={handleCaptchaToken}
                onExpire={() => handleCaptchaIssue('validation.captchaExpired')}
                onError={() =>
                  handleCaptchaIssue('validation.captchaTemporary')
                }
              />
              {errors.captcha && (
                <span className="field-error" id="captcha-error" role="alert">
                  {t(errors.captcha)}
                </span>
              )}
            </div>
          )}

          {submitError && (
            <p className="form-message error-message" role="alert">
              {submitError}
            </p>
          )}

          {accountExists && (
            <div className="existing-account-message" role="alert">
              <strong>{t('errors.accountExistsTitle')}</strong>
              <p>{t('errors.accountExistsDescription')}</p>
              <div className="existing-account-actions">
                <button
                  className="secondary-button"
                  type="button"
                  onClick={onShowLogin}
                  disabled={submitting || requestingReset}
                >
                  {t('auth.loginLink')}
                </button>
                <button
                  className="text-button"
                  type="button"
                  onClick={() => void handlePasswordReset()}
                  disabled={submitting || requestingReset || resetRequestSent}
                >
                  {t(
                    requestingReset
                      ? 'auth.sendingPasswordReset'
                      : 'auth.resetPasswordAction'
                  )}
                </button>
              </div>
              {resetRequestSent && (
                <p className="existing-account-reset-sent" role="status">
                  {t('auth.passwordResetRequestSent')}
                </p>
              )}
            </div>
          )}

          <button
            className="primary-button"
            type="submit"
            disabled={submitting}
          >
            {t(submitting ? 'auth.creatingAccount' : 'auth.createAccountLink')}
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
  );
}
