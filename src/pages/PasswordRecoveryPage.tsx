import { useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { getAuthErrorMessage } from '../features/auth/auth-errors';
import { MIN_PASSWORD_LENGTH } from '../features/auth/registration-validation';
import { useAuth } from '../features/auth/useAuth';

type PasswordRecoveryPageProps = {
  onPasswordUpdated: () => void;
};

type PasswordErrors = {
  password?: string;
  confirmPassword?: string;
};

function focusFirstInvalid(form: HTMLFormElement | null) {
  const target = form?.querySelector<HTMLElement>('[aria-invalid="true"]');
  if (!target) return;

  target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  target.focus({ preventScroll: true });
}

export function PasswordRecoveryPage({
  onPasswordUpdated,
}: PasswordRecoveryPageProps) {
  const { t } = useTranslation();
  const { updatePassword, completePasswordRecovery, signOut } = useAuth();
  const formRef = useRef<HTMLFormElement>(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<PasswordErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const validate = (): PasswordErrors => {
    const errors: PasswordErrors = {};
    if (!password) errors.password = 'validation.passwordRequired';
    else if (password.length < MIN_PASSWORD_LENGTH) {
      errors.password = 'validation.passwordLength';
    }

    if (!confirmPassword) {
      errors.confirmPassword = 'validation.confirmPasswordRequired';
    } else if (password !== confirmPassword) {
      errors.confirmPassword = 'validation.passwordMismatch';
    }
    return errors;
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const errors = validate();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      requestAnimationFrame(() => focusFirstInvalid(formRef.current));
      return;
    }

    setSubmitting(true);
    try {
      await updatePassword(password);
      await signOut();
      completePasswordRecovery();
      onPasswordUpdated();
    } catch (updateError) {
      setError(getAuthErrorMessage(updateError));
    } finally {
      setSubmitting(false);
    }
  };

  const handlePasswordChange = (value: string) => {
    setPassword(value);
    setError(null);
    setFieldErrors((currentErrors) => {
      const nextErrors = { ...currentErrors };
      if (value.length >= MIN_PASSWORD_LENGTH) delete nextErrors.password;
      if (currentErrors.confirmPassword && value === confirmPassword) {
        delete nextErrors.confirmPassword;
      }
      return nextErrors;
    });
  };

  const handleConfirmationChange = (value: string) => {
    setConfirmPassword(value);
    setError(null);
    setFieldErrors((currentErrors) => {
      if (!currentErrors.confirmPassword || !value || value !== password) {
        return currentErrors;
      }
      const nextErrors = { ...currentErrors };
      delete nextErrors.confirmPassword;
      return nextErrors;
    });
  };

  const hasFieldErrors = Object.keys(fieldErrors).length > 0;

  return (
    <main className="auth-shell">
      <section className="auth-card" aria-labelledby="new-password-title">
        <header className="auth-header">
          <span className="eyebrow">{t('common.brand')}</span>
          <h1 id="new-password-title">{t('auth.newPasswordTitle')}</h1>
          <p>{t('auth.newPasswordSubtitle')}</p>
        </header>

        <form
          className="auth-form"
          onSubmit={handleSubmit}
          noValidate
          ref={formRef}
        >
          {hasFieldErrors && (
            <p className="form-message error-message" role="alert">
              {t('validation.completeRequiredFields')}
            </p>
          )}

          <label>
            {t('auth.newPassword')}
            <input
              type="password"
              name="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => handlePasswordChange(event.target.value)}
              disabled={submitting}
              aria-invalid={Boolean(fieldErrors.password)}
              aria-describedby={
                fieldErrors.password ? 'new-password-error' : undefined
              }
              minLength={MIN_PASSWORD_LENGTH}
              autoFocus
              required
            />
            {fieldErrors.password && (
              <span
                className="field-error"
                id="new-password-error"
                role="alert"
              >
                {t(fieldErrors.password)}
              </span>
            )}
          </label>

          <label>
            {t('auth.confirmNewPassword')}
            <input
              type="password"
              name="confirmPassword"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => handleConfirmationChange(event.target.value)}
              disabled={submitting}
              aria-invalid={Boolean(fieldErrors.confirmPassword)}
              aria-describedby={
                fieldErrors.confirmPassword
                  ? 'confirm-new-password-error'
                  : undefined
              }
              minLength={MIN_PASSWORD_LENGTH}
              required
            />
            {fieldErrors.confirmPassword && (
              <span
                className="field-error"
                id="confirm-new-password-error"
                role="alert"
              >
                {t(fieldErrors.confirmPassword)}
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
            {t(submitting ? 'auth.updatingPassword' : 'auth.updatePassword')}
          </button>
        </form>
      </section>
    </main>
  );
}
