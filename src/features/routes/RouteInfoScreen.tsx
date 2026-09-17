import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
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
  RouteCheckpointType,
  RouteContent,
  RouteMedia,
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
  'references',
];
const RouteMap = lazy(() =>
  import('./components/RouteMap').then((module) => ({
    default: module.RouteMap,
  }))
);

function sortedMedia(media: RouteMedia[], checkpointId: string | null) {
  return media
    .filter((item) => item.checkpointId === checkpointId)
    .toSorted(
      (first, second) =>
        Number(second.isCover) - Number(first.isCover) ||
        first.sortOrder - second.sortOrder
    );
}

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
  const numberFormatter = useMemo(
    () => new Intl.NumberFormat(language === 'es' ? 'es-GT' : 'en'),
    [language]
  );

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

      {content && activeTab === 'references' && (
        <div
          className="route-tab-panel"
          id="route-panel-references"
          role="tabpanel"
          aria-labelledby="route-tab-references"
        >
          {content.mediaLoadFailed && (
            <p className="route-media-error" role="status">
              {t('routes.photosLoadError')}
            </p>
          )}
          {sortedMedia(visibleMedia, null).length > 0 && (
            <section
              className="route-general-media"
              aria-labelledby="route-general-media-title"
            >
              <h3 id="route-general-media-title">{t('routes.routePhotos')}</h3>
              <CheckpointMediaGallery
                media={sortedMedia(visibleMedia, null)}
                fallbackAlt={routeName}
                language={language}
                onMediaError={hideFailedMedia}
              />
            </section>
          )}
          {content.checkpoints.length === 0 ? (
            <p className="route-empty-state">{t('routes.noCheckpoints')}</p>
          ) : (
            <ol className="route-checkpoint-list route-reference-list">
              {content.checkpoints.map((checkpoint) => {
                const name =
                  language === 'es' ? checkpoint.nameEs : checkpoint.nameEn;
                const description =
                  language === 'es'
                    ? checkpoint.descriptionEs
                    : checkpoint.descriptionEn;
                const media = sortedMedia(visibleMedia, checkpoint.id);
                return (
                  <li key={checkpoint.id}>
                    <div className="route-checkpoint-marker" aria-hidden="true">
                      {checkpoint.sequence}
                    </div>
                    <div className="route-reference-content">
                      <CheckpointMediaGallery
                        media={media}
                        fallbackAlt={name}
                        language={language}
                        onMediaError={hideFailedMedia}
                      />
                      {checkpoint.checkpointType && (
                        <span className="route-checkpoint-type">
                          {t(
                            `routes.checkpointTypes.${
                              checkpoint.checkpointType as RouteCheckpointType
                            }`
                          )}
                        </span>
                      )}
                      <h3>{name}</h3>
                      {description && <p>{description}</p>}
                      {checkpoint.altitudeM !== null && (
                        <span className="route-checkpoint-altitude">
                          {t('routes.altitude', {
                            altitude: numberFormatter.format(
                              checkpoint.altitudeM
                            ),
                          })}
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      )}
    </section>
  );
}
