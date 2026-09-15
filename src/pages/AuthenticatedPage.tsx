import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getAuthErrorMessage } from '../features/auth/auth-errors';
import { useAuth } from '../features/auth/useAuth';
import { GroupVisits } from '../features/visits/GroupVisits';

type AuthenticatedPageProps = {
  onEditProfile: () => void;
};

export function AuthenticatedPage({ onEditProfile }: AuthenticatedPageProps) {
  const { t } = useTranslation();
  const { user, signOut } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const firstName =
    typeof user?.user_metadata.first_name === 'string'
      ? user.user_metadata.first_name
      : '';
  const lastName =
    typeof user?.user_metadata.last_name === 'string'
      ? user.user_metadata.last_name
      : '';
  const displayName = `${firstName} ${lastName}`.trim();

  const handleSignOut = async () => {
    setError(null);
    setSubmitting(true);

    try {
      await signOut();
    } catch (signOutError) {
      setError(getAuthErrorMessage(signOutError));
      setSubmitting(false);
    }
  };

  return (
    <main className="auth-shell visits-shell">
      <section
        className="auth-card authenticated-card visits-card"
        aria-labelledby="welcome-title"
      >
        <header className="auth-header account-header">
          <span className="eyebrow">{t('auth.activeSession')}</span>
          <h1 id="welcome-title">
            {displayName
              ? t('auth.welcome', { name: displayName })
              : t('auth.welcomeGeneric')}
          </h1>
          <p>{user?.email ?? t('common.unavailable')}</p>
        </header>

        {user && <GroupVisits currentUserId={user.id} />}

        {error && (
          <p className="form-message error-message" role="alert">
            {error}
          </p>
        )}

        <div className="account-actions account-footer-actions">
          <button
            className="primary-button"
            type="button"
            onClick={onEditProfile}
            disabled={submitting}
          >
            {t('auth.editProfile')}
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={handleSignOut}
            disabled={submitting}
          >
            {t(submitting ? 'common.signingOut' : 'common.signOut')}
          </button>
        </div>
      </section>
    </main>
  );
}
