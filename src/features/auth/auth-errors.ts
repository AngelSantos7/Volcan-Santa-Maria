import i18n from '../../i18n'

export function getAuthErrorMessage(error: unknown): string {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String(error.code)
      : ''

  switch (code) {
    case 'invalid_credentials':
      return i18n.t('errors.invalidCredentials')
    case 'email_not_confirmed':
      return i18n.t('errors.emailNotConfirmed')
    case 'user_already_exists':
    case 'email_exists':
      return i18n.t('errors.accountCreation')
    case 'weak_password':
      return i18n.t('errors.weakPassword')
    case 'over_email_send_rate_limit':
    case 'over_request_rate_limit':
      return i18n.t('errors.rateLimit')
    case 'signup_disabled':
      return i18n.t('errors.signupDisabled')
    default:
      return error instanceof TypeError
        ? i18n.t('errors.network')
        : i18n.t('errors.generic')
  }
}
