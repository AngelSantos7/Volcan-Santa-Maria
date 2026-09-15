import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CreateVisitForm } from './CreateVisitForm';
import { GroupVisitScreen } from './GroupVisitScreen';
import { JoinVisitForm } from './JoinVisitForm';
import { useActiveGroupVisit } from './useActiveGroupVisit';
import { VisitHistory } from './VisitHistory';

type GroupVisitsProps = {
  currentUserId: string;
};

type VisitView = 'home' | 'create' | 'join';

export function GroupVisits({ currentUserId }: GroupVisitsProps) {
  const { t } = useTranslation();
  const [view, setView] = useState<VisitView>('home');
  const {
    details,
    loading,
    error,
    openVisit,
    refreshActiveVisit,
    refreshDetails,
    clearVisit,
  } = useActiveGroupVisit(currentUserId);

  if (loading) {
    return (
      <section className="visits-loading" aria-live="polite">
        <p>{t('visits.loading')}</p>
      </section>
    );
  }

  if (details) {
    return (
      <GroupVisitScreen
        currentUserId={currentUserId}
        details={details}
        loadError={error}
        onRefresh={refreshDetails}
        onVisitClosed={() => {
          clearVisit();
          setView('home');
        }}
      />
    );
  }

  if (error) {
    return (
      <section className="visits-error" aria-labelledby="visits-error-title">
        <h2 id="visits-error-title">{t('visits.errors.loadTitle')}</h2>
        <p className="form-message error-message" role="alert">
          {error}
        </p>
        <button
          className="primary-button visit-submit"
          type="button"
          onClick={() => void refreshActiveVisit()}
        >
          {t('profile.retry')}
        </button>
      </section>
    );
  }

  if (view === 'create') {
    return (
      <CreateVisitForm onCreated={openVisit} onCancel={() => setView('home')} />
    );
  }

  if (view === 'join') {
    return (
      <JoinVisitForm onJoined={openVisit} onCancel={() => setView('home')} />
    );
  }

  return (
    <div className="visits-dashboard">
      <section className="visits-home" aria-labelledby="visits-title">
        <header className="visit-section-header centered">
          <span className="eyebrow">{t('common.brand')}</span>
          <h2 id="visits-title">{t('visits.title')}</h2>
          <p>{t('visits.subtitle')}</p>
        </header>
        <div className="visit-primary-actions">
          <button
            className="primary-button"
            type="button"
            onClick={() => setView('create')}
          >
            {t('visits.create.action')}
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={() => setView('join')}
          >
            {t('visits.join.action')}
          </button>
        </div>
      </section>
      <VisitHistory />
    </div>
  );
}
