import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  getPrivateRequestErrorMessage,
  isRateLimitError,
} from '../features/auth/auth-errors';
import { TurnstileWidget } from '../features/auth/TurnstileWidget';
import { useAuth } from '../features/auth/useAuth';

type EmailConfirmationPageProps = {
  email: string;
  onBackHome: () => void;
};

const RESEND_COOLDOWN_SECONDS = 60;
const TURNSTILE_SITE_KEY =
  import.meta.env.VITE_TURNSTILE_SITE_KEY?.trim() || null;

export function EmailConfirmationPage({
  email,
  onBackHome,
}: EmailConfirmationPageProps) {
  const { t } = useTranslation();
  const { resendSignUpEmail } = useAuth();
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_SECONDS);
  const [resending, setResending] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaErrorKey, setCaptchaErrorKey] = useState<string | null>(null);
  const [captchaResetKey, setCaptchaResetKey] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timeout = window.setTimeout(() => {
      setCooldown((current) => Math.max(0, current - 1));
    }, 1000);
    return () => window.clearTimeout(timeout);
  }, [cooldown]);

  const handleResend = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (cooldown > 0 || resending) return;

    setStatus(null);
    setError(null);
    if (TURNSTILE_SITE_KEY && !captchaToken) {
      setCaptchaErrorKey('validation.captchaRequired');
      setCaptchaResetKey((currentKey) => currentKey + 1);
      return;
    }

    setResending(true);
    let shouldStartCooldown = false;

    try {
      await resendSignUpEmail(email, captchaToken ?? undefined);
      setStatus(t('auth.confirmationEmailResent'));
      shouldStartCooldown = true;
    } catch (resendError) {
      const publicError = getPrivateRequestErrorMessage(resendError);
      if (publicError) setError(publicError);
      else setStatus(t('auth.confirmationEmailResent'));
      shouldStartCooldown = !publicError || isRateLimitError(resendError);
    } finally {
      setResending(false);
      if (shouldStartCooldown) setCooldown(RESEND_COOLDOWN_SECONDS);
      if (TURNSTILE_SITE_KEY) {
        setCaptchaToken(null);
        setCaptchaResetKey((currentKey) => currentKey + 1);
      }
    }
  };

  return (
    <main className="auth-shell">
      <section className="auth-card" aria-labelledby="confirmation-title">
        <header className="auth-header">
          <span className="eyebrow">{t('common.brand')}</span>
          <h1 id="confirmation-title">{t('auth.accountCreatedTitle')}</h1>
          <p>{t('auth.confirmationSentTo', { email })}</p>
        </header>

        <p className="auth-guidance">
          {t('auth.confirmationRequiredForVisits')}
        </p>

        <form className="auth-form" onSubmit={handleResend} noValidate>
          {TURNSTILE_SITE_KEY && (
            <div
              className="auth-captcha"
              tabIndex={-1}
              aria-invalid={Boolean(captchaErrorKey)}
              aria-describedby={
                captchaErrorKey ? 'resend-captcha-error' : undefined
              }
            >
              <TurnstileWidget
                siteKey={TURNSTILE_SITE_KEY}
                action="resend_signup"
                resetKey={captchaResetKey}
                onTokenChange={(token) => {
                  setCaptchaToken(token);
                  if (token) setCaptchaErrorKey(null);
                }}
                onExpire={() => {
                  setCaptchaToken(null);
                  setCaptchaErrorKey('validation.captchaExpired');
                }}
                onError={() => {
                  setCaptchaToken(null);
                  setCaptchaErrorKey('validation.captchaTemporary');
                }}
              />
              {captchaErrorKey && (
                <span
                  className="field-error"
                  id="resend-captcha-error"
                  role="alert"
                >
                  {t(captchaErrorKey)}
                </span>
              )}
            </div>
          )}

          {status && (
            <p className="form-message success-message" role="status">
              {status}
            </p>
          )}
          {error && (
            <p className="form-message error-message" role="alert">
              {error}
            </p>
          )}

          <button
            className="primary-button"
            type="submit"
            disabled={resending || cooldown > 0}
          >
            {resending
              ? t('auth.resendingConfirmation')
              : cooldown > 0
                ? t('auth.resendAvailableIn', { seconds: cooldown })
                : t('auth.resendConfirmation')}
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={onBackHome}
          >
            {t('auth.backHome')}
          </button>
        </form>
      </section>
    </main>
  );
}
