import i18n from '../../i18n';

export function getVisitErrorMessage(error: unknown): string {
  const errorText =
    typeof error === 'object' && error !== null
      ? ['code', 'message', 'details', 'hint']
          .flatMap((key) =>
            key in error ? [String(Reflect.get(error, key))] : []
          )
          .join(' ')
          .toLowerCase()
      : String(error ?? '').toLowerCase();

  if (
    errorText.includes('email_not_verified') ||
    errorText.includes('email not verified') ||
    errorText.includes('email not confirmed')
  ) {
    return i18n.t('visits.errors.emailVerificationRequired');
  }

  if (errorText.includes('already belong')) {
    return i18n.t('visits.errors.alreadyActive');
  }

  if (errorText.includes('code not found')) {
    return i18n.t('visits.errors.codeNotFound');
  }

  if (errorText.includes('no longer accepting')) {
    return i18n.t('visits.errors.notAccepting');
  }

  if (errorText.includes('complete your tourist profile')) {
    return i18n.t('visits.errors.profileRequired');
  }

  if (errorText.includes('access') && errorText.includes('denied')) {
    return i18n.t('visits.errors.accessDenied');
  }

  if (errorText.includes('expected return')) {
    return i18n.t('visits.validation.futureReturn');
  }

  return error instanceof TypeError
    ? i18n.t('errors.network')
    : i18n.t('visits.errors.generic');
}
