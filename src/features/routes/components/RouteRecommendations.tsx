import { useTranslation } from 'react-i18next';

const RECOMMENDATION_KEYS = [
  'preparation',
  'clothing',
  'hydration',
  'lighting',
  'weather',
  'stayOnRoute',
  'waste',
  'environment',
  'returnSafety',
  'emergency',
] as const;

export function RouteRecommendations() {
  const { t } = useTranslation();

  return (
    <div className="route-recommendations">
      <p className="route-recommendations-intro">
        {t('routes.recommendations.intro')}
      </p>
      <div className="route-recommendation-grid">
        {RECOMMENDATION_KEYS.map((key, index) => (
          <article key={key}>
            <span aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
            <div>
              <h3>{t(`routes.recommendations.items.${key}.title`)}</h3>
              <p>{t(`routes.recommendations.items.${key}.body`)}</p>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
