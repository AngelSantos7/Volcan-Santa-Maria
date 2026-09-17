import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getAppLanguage } from '../../i18n';
import {
  getCachedSummitRouteContent,
  getSummitRouteContent,
} from './route-service';
import type {
  RouteCheckpointType,
  RouteContent,
  RouteTab,
} from './route-types';

type RouteInfoScreenProps = {
  initialTab?: RouteTab;
  onBack: () => void;
};

const routeTabs: RouteTab[] = ['information', 'map', 'references', 'photos'];
const RouteMap = lazy(() =>
  import('./components/RouteMap').then((module) => ({
    default: module.RouteMap,
  }))
);

function formatDuration(minutes: number, language: string): string {
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  const formatter = new Intl.NumberFormat(language === 'es' ? 'es-GT' : 'en');

  if (hours === 0) return `${formatter.format(remainingMinutes)} min`;
  if (remainingMinutes === 0) return `${formatter.format(hours)} h`;
  return `${formatter.format(hours)} h ${formatter.format(remainingMinutes)} min`;
}

export function RouteInfoScreen({
  initialTab = 'information',
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
  const description = content
    ? language === 'es'
      ? content.descriptionEs
      : content.descriptionEn
    : null;
  const hasRouteFacts = Boolean(
    content?.difficulty ||
    content?.distanceKm !== null ||
    content?.estimatedDurationMinutes !== null ||
    content?.elevationGainM !== null
  );
  const visibleRouteMedia = content
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

      {content && activeTab === 'information' && (
        <div
          className="route-tab-panel"
          id="route-panel-information"
          role="tabpanel"
          aria-labelledby="route-tab-information"
        >
          {description ? (
            <p className="route-description">{description}</p>
          ) : (
            <p className="route-empty-state">{t('routes.noDescription')}</p>
          )}

          {hasRouteFacts && (
            <dl className="route-facts">
              {content.difficulty && (
                <div>
                  <dt>{t('routes.difficulty')}</dt>
                  <dd>{content.difficulty}</dd>
                </div>
              )}
              {content.distanceKm !== null && (
                <div>
                  <dt>{t('routes.distance')}</dt>
                  <dd>{numberFormatter.format(content.distanceKm)} km</dd>
                </div>
              )}
              {content.estimatedDurationMinutes !== null && (
                <div>
                  <dt>{t('routes.duration')}</dt>
                  <dd>
                    {formatDuration(content.estimatedDurationMinutes, language)}
                  </dd>
                </div>
              )}
              {content.elevationGainM !== null && (
                <div>
                  <dt>{t('routes.elevationGain')}</dt>
                  <dd>{numberFormatter.format(content.elevationGainM)} m</dd>
                </div>
              )}
            </dl>
          )}
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

      {content && activeTab === 'references' && (
        <div
          className="route-tab-panel"
          id="route-panel-references"
          role="tabpanel"
          aria-labelledby="route-tab-references"
        >
          {content.checkpoints.length === 0 ? (
            <p className="route-empty-state">{t('routes.noCheckpoints')}</p>
          ) : (
            <ol className="route-checkpoint-list">
              {content.checkpoints.map((checkpoint) => {
                const name =
                  language === 'es' ? checkpoint.nameEs : checkpoint.nameEn;
                const checkpointDescription =
                  language === 'es'
                    ? checkpoint.descriptionEs
                    : checkpoint.descriptionEn;

                return (
                  <li key={checkpoint.id}>
                    <div className="route-checkpoint-marker" aria-hidden="true">
                      {checkpoint.sequence}
                    </div>
                    <div>
                      {checkpoint.checkpointType && (
                        <span className="route-checkpoint-type">
                          {t(
                            `routes.checkpointTypes.${checkpoint.checkpointType as RouteCheckpointType}`
                          )}
                        </span>
                      )}
                      <h3>{name}</h3>
                      {checkpointDescription && <p>{checkpointDescription}</p>}
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

      {content && activeTab === 'photos' && (
        <div
          className="route-tab-panel"
          id="route-panel-photos"
          role="tabpanel"
          aria-labelledby="route-tab-photos"
        >
          {content.mediaLoadFailed && (
            <p className="route-media-error" role="status">
              {t('routes.photosLoadError')}
            </p>
          )}
          {visibleRouteMedia.length === 0 ? (
            <p className="route-empty-state">{t('routes.noPhotos')}</p>
          ) : (
            <div className="route-photo-grid">
              {visibleRouteMedia.map((media) => {
                const caption =
                  language === 'es' ? media.captionEs : media.captionEn;

                return (
                  <figure key={media.id}>
                    <img
                      src={media.publicUrl}
                      alt={caption ?? routeName}
                      loading="lazy"
                      onError={() =>
                        setFailedPhotoIds((currentIds) => {
                          const nextIds = new Set(currentIds);
                          nextIds.add(media.id);
                          return nextIds;
                        })
                      }
                    />
                    {caption && <figcaption>{caption}</figcaption>}
                  </figure>
                );
              })}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
