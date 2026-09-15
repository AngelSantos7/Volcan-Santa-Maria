import i18n from '../../i18n';

export function getVisitErrorMessage(error: unknown): string {
  const message =
    typeof error === 'object' && error !== null && 'message' in error
      ? String(error.message).toLowerCase()
      : '';

  if (message.includes('already belong')) {
    return i18n.t('visits.errors.alreadyActive');
  }

  if (message.includes('code not found')) {
    return i18n.t('visits.errors.codeNotFound');
  }

  if (message.includes('no longer accepting')) {
    return i18n.t('visits.errors.notAccepting');
  }

  if (message.includes('complete your tourist profile')) {
    return i18n.t('visits.errors.profileRequired');
  }

  if (message.includes('access') && message.includes('denied')) {
    return i18n.t('visits.errors.accessDenied');
  }

  if (message.includes('expected return')) {
    return i18n.t('visits.validation.futureReturn');
  }

  return error instanceof TypeError
    ? i18n.t('errors.network')
    : i18n.t('visits.errors.generic');
}
