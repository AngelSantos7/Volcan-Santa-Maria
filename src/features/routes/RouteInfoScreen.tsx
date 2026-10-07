import { lazy, Suspense, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getAppLanguage } from '../../i18n';
import { WeatherPanel } from '../weather/WeatherPanel';
import { CheckpointMediaGallery } from './components/CheckpointMediaGallery';
import { RouteRecommendations } from './components/RouteRecommendations';
import {
  getCachedSummitRouteContent,
  getSummitRouteContent,
} from './route-service';
import type {
  RouteContent,
  RouteTab,
} from './route-types';

type RouteInfoScreenProps = {
  initialTab?: RouteTab;
  onBack: () => void;
};

const routeTabs: RouteTab[] = [
  'recommendations',
  'map',
  'weather',
  'gallery',
  'donations',
];
const PAYPAL_DONATION_URL =
  import.meta.env.VITE_PAYPAL_DONATION_URL?.trim() || null;
const RouteMap = lazy(() =>
  import('./components/RouteMap').then((module) => ({
    default: module.RouteMap,
  }))
);

export function RouteInfoScreen({
  initialTab = 'recommendations',
  onBack,
}: RouteInfoScreenProps) {
  const { t, i18n } = useTranslation();
  const [activeTab, setActiveTab] = useState<RouteTab>(initialTab);
  const [content, setContent] = useState<RouteContent | null>(() =>
    getCachedSummitRouteContent()
  );
  const [loading, setLoading] = useState(content === null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [failedPhotoIds, setFailedPhotoIds] = useState<Set<string>>(
    () => new Set()
  );
  const language = getAppLanguage(i18n.resolvedLanguage);

  useEffect(() => {
    let active = true;
    void getSummitRouteContent()
      .then((nextContent) => {
        if (!active) return;
        setContent(nextContent);
        setLoadFailed(false);
      })
      .catch(() => {
        if (active) setLoadFailed(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const routeName = content
    ? language === 'es'
      ? content.nameEs
      : content.nameEn
    : t('visits.summitRoute');
  const hideFailedMedia = (mediaId: string) => {
    setFailedPhotoIds((currentIds) => new Set(currentIds).add(mediaId));
  };
  const visibleMedia = content
    ? content.media.filter((media) => !failedPhotoIds.has(media.id))
    : [];

  return (
    <section className="route-screen" aria-labelledby="route-screen-title">
      <button className="text-button" type="button" onClick={onBack}>
        {t('visits.back')}
      </button>

      <header className="visit-section-header route-screen-header">
        <span className="eyebrow">{t('routes.eyebrow')}</span>
        <h2 id="route-screen-title">
          {t('routes.title', { route: routeName })}
        </h2>
      </header>

      <div
        className="route-tabs"
        role="tablist"
        aria-label={t('routes.tabsLabel')}
      >
        {routeTabs.map((tab) => (
          <button
            id={`route-tab-${tab}`}
            key={tab}
            type="button"
            role="tab"
            aria-selected={activeTab === tab}
            aria-controls={`route-panel-${tab}`}
            onClick={() => setActiveTab(tab)}
          >
            {t(`routes.tabs.${tab}`)}
          </button>
        ))}
      </div>

      {loading && !content && (
        <p className="route-feedback" role="status">
          {t('routes.loading')}
        </p>
      )}
      {loadFailed && !content && (
        <div className="route-feedback" role="alert">
          <p>{t('routes.loadError')}</p>
          <button
            className="secondary-button"
            type="button"
            onClick={() => window.location.reload()}
          >
            {t('profile.retry')}
          </button>
        </div>
      )}
      {loadFailed && content && (
        <p className="route-offline-note" role="status">
          {t('routes.cachedData')}
        </p>
      )}

      {content && activeTab === 'recommendations' && (
        <div
          className="route-tab-panel"
          id="route-panel-recommendations"
          role="tabpanel"
          aria-labelledby="route-tab-recommendations"
        >
          <RouteRecommendations />
        </div>
      )}

      {content && activeTab === 'map' && (
        <div
          className="route-tab-panel route-map-panel"
          id="route-panel-map"
          role="tabpanel"
          aria-labelledby="route-tab-map"
        >
          <Suspense
            fallback={
              <p className="route-map-module-loading" role="status">
                {t('routes.map.loading')}
              </p>
            }
          >
            <RouteMap route={content} />
          </Suspense>
        </div>
      )}

      {content && activeTab === 'weather' && (
        <div
          className="route-tab-panel"
          id="route-panel-weather"
          role="tabpanel"
          aria-labelledby="route-tab-weather"
        >
          <WeatherPanel />
        </div>
      )}

      {content && activeTab === 'gallery' && (
        <div
          className="route-tab-panel route-gallery-panel"
          id="route-panel-gallery"
          role="tabpanel"
          aria-labelledby="route-tab-gallery"
        >
          {content.mediaLoadFailed && (
            <p className="route-media-error" role="status">
              {t('routes.photosLoadError')}
            </p>
          )}
          {visibleMedia.length > 0 ? (
            <section
              className="route-general-media"
              aria-labelledby="route-general-media-title"
            >
              <h3 id="route-general-media-title">
                {t('routes.gallery.title')}
              </h3>
              <CheckpointMediaGallery
                media={visibleMedia.toSorted(
                  (first, second) => first.sortOrder - second.sortOrder
                )}
                fallbackAlt={routeName}
                language={language}
                onMediaError={hideFailedMedia}
              />
            </section>
          ) : (
            <p className="route-empty-state">{t('routes.gallery.empty')}</p>
          )}
        </div>
      )}

      {content && activeTab === 'donations' && (
        <div
          className="route-tab-panel"
          id="route-panel-donations"
          role="tabpanel"
          aria-labelledby="route-tab-donations"
        >
          <section className="donations-card">
            <span className="eyebrow">{t('routes.donations.title')}</span>
            <h3>{t('routes.donations.heading')}</h3>
            <p>{t('routes.donations.body')}</p>
            <strong>{t('legal.entity')}</strong>
            {PAYPAL_DONATION_URL ? (
              <a
                className="primary-button"
                href={PAYPAL_DONATION_URL}
                target="_blank"
                rel="noreferrer"
              >
                {t('routes.donations.button')}
              </a>
            ) : (
              <button className="primary-button" type="button" disabled>
                {t('routes.donations.button')} ·{' '}
                {t('routes.donations.comingSoon')}
              </button>
            )}
            <small>{t('routes.donations.free')}</small>
          </section>
        </div>
      )}
    </section>
  );
}
