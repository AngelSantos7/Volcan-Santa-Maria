import i18n from '../../i18n';

export function getAuthErrorCode(error: unknown): string {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String(error.code)
    : '';
}

export function isRateLimitError(error: unknown): boolean {
  const code = getAuthErrorCode(error);
  return (
    code === 'over_email_send_rate_limit' ||
    code === 'over_request_rate_limit' ||
    code === 'over_sms_send_rate_limit'
  );
}

export function isExistingAccountError(error: unknown): boolean {
  const code = getAuthErrorCode(error);
  return code === 'user_already_exists' || code === 'email_exists';
}

function isTemporaryAuthError(error: unknown): boolean {
  if (error instanceof TypeError) return true;
  if (typeof error !== 'object' || error === null) return false;

  const code = getAuthErrorCode(error);
  const name = 'name' in error ? String(error.name) : '';
  const status = 'status' in error ? Number(error.status) : 0;
  return (
    code === 'request_timeout' ||
    code === 'hook_timeout' ||
    code === 'hook_timeout_after_retry' ||
    name === 'AuthRetryableFetchError' ||
    status >= 500
  );
}

export function getPrivateRequestErrorMessage(error: unknown): string | null {
  if (isRateLimitError(error)) return i18n.t('errors.rateLimit');

  const code = getAuthErrorCode(error);
  if (code === 'captcha_failed') return i18n.t('errors.captchaFailed');
  if (isTemporaryAuthError(error)) return i18n.t('errors.network');

  // Authentication failures are deliberately indistinguishable here. The
  // caller presents the same success response whether an account exists or not.
  return null;
}

export function getAuthErrorMessage(error: unknown): string {
  const code = getAuthErrorCode(error);

  switch (code) {
    case 'invalid_credentials':
      return i18n.t('errors.invalidCredentials');
    case 'email_not_confirmed':
      return i18n.t('errors.emailNotConfirmed');
    case 'user_already_exists':
    case 'email_exists':
      return i18n.t('errors.accountExistsTitle');
    case 'weak_password':
      return i18n.t('errors.weakPassword');
    case 'same_password':
      return i18n.t('errors.samePassword');
    case 'captcha_failed':
      return i18n.t('errors.captchaFailed');
    case 'over_email_send_rate_limit':
    case 'over_request_rate_limit':
    case 'over_sms_send_rate_limit':
      return i18n.t('errors.rateLimit');
    case 'signup_disabled':
      return i18n.t('errors.signupDisabled');
    case 'session_not_found':
    case 'session_expired':
    case 'flow_state_not_found':
    case 'flow_state_expired':
    case 'otp_expired':
      return i18n.t('errors.recoveryExpired');
    case 'email_address_invalid':
      return i18n.t('validation.invalidEmail');
    case 'request_timeout':
      return i18n.t('errors.network');
    default:
      return isTemporaryAuthError(error)
        ? i18n.t('errors.network')
        : i18n.t('errors.generic');
  }
}
