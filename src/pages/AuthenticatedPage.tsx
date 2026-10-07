import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AnnouncementBanner } from '../features/announcements/AnnouncementBanner';
import { LanguageSwitcher } from '../components/LanguageSwitcher';
import { UserMenu } from '../components/UserMenu';
import { getAuthErrorMessage } from '../features/auth/auth-errors';
import { useAuth } from '../features/auth/useAuth';
import { GroupVisits } from '../features/visits/GroupVisits';
import { getShortName } from '../features/profile/avatar-utils';
import type { TouristProfileData } from '../features/profile/profile-types';
import { NotificationCenter } from '../features/notifications/NotificationCenter';
import { LegalLinks } from '../features/legal/LegalDocuments';

type AuthenticatedPageProps = {
  profile: TouristProfileData;
  onEditProfile: () => void;
};

export function AuthenticatedPage({
  profile,
  onEditProfile,
}: AuthenticatedPageProps) {
  const { t } = useTranslation();
  const { user, signOut } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [legalOpen, setLegalOpen] = useState(false);
  const email = user?.email ?? '';
  const displayName = getShortName(profile.firstName, profile.lastName, email);
  const fullName =
    `${profile.firstName} ${profile.lastName}`.trim() || displayName;

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
        <div className="authenticated-toolbar">
          <NotificationCenter />
          <LanguageSwitcher />
          <UserMenu
            identity={profile}
            email={email}
            disabled={submitting}
            onEditProfile={onEditProfile}
            onOpenLegal={() => setLegalOpen(true)}
            onSignOut={() => void handleSignOut()}
          />
        </div>
        <header className="auth-header account-header">
          <span className="eyebrow">{t('auth.activeSession')}</span>
          <h1 id="welcome-title">
            {displayName
              ? t('auth.welcome', { name: displayName })
              : t('auth.welcomeGeneric')}
          </h1>
          <p>{email || t('common.unavailable')}</p>
        </header>

        <AnnouncementBanner placement="login" />

        {user && (
          <GroupVisits currentUserId={user.id} currentUserName={fullName} />
        )}

        {error && (
          <p className="form-message error-message" role="alert">
            {error}
          </p>
        )}
        {legalOpen && (
          <div className="legal-dialog-backdrop" role="presentation">
            <section className="legal-dialog legal-center" role="dialog" aria-modal="true" aria-label={t('legal.menu')}>
              <h2>{t('legal.menu')}</h2>
              <p>{t('legal.centerIntro')}</p>
              <LegalLinks />
              <button className="primary-button" type="button" onClick={() => setLegalOpen(false)}>
                {t('common.close')}
              </button>
            </section>
          </div>
        )}
      </section>
    </main>
  );
}
