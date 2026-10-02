import { useTranslation } from 'react-i18next';

const SECTIONS = {
  preparation: ['waterFood', 'footwear', 'properClothing', 'flashlight'],
  safety: ['localGuide', 'whistle', 'firstAid', 'remainOnRoute'],
  weather: ['checkForecast', 'fastChanges', 'weatherHazards'],
  environment: [
    'leaveNoWaste',
    'floraFauna',
    'noFires',
    'noLoudAudio',
    'noAlcohol',
  ],
} as const;

export function RouteRecommendations() {
  const { t } = useTranslation();

  return (
    <div className="route-recommendations">
      <p className="route-recommendations-intro">
        {t('routes.recommendations.intro')}
      </p>
      <aside className="santiaguito-warning" role="note"><h3>{t('routes.santiaguito.title')}</h3><p>{t('routes.santiaguito.body')}</p><small>{t('routes.santiaguito.source')}</small></aside>
      <div className="route-recommendation-sections">
        {Object.entries(SECTIONS).map(([section, items]) => (
          <section key={section}>
            <h3>{t(`routes.recommendations.sections.${section}`)}</h3>
            <ul>
              {items.map((item) => (
                <li key={item}>{t(`routes.recommendations.items.${item}`)}</li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
