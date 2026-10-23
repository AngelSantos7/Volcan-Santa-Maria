import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { listAvailableRoutes } from './route-service';
import type { RouteContent } from './route-types';

export function RouteSelector({ value, onChange, disabled = false }: {
  value: string; onChange: (id: string, route: RouteContent) => void; disabled?: boolean;
}) {
  const { t } = useTranslation();
  const [routes, setRoutes] = useState<RouteContent[]>([]);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    void listAvailableRoutes().then((items) => { if (active) { setRoutes(items); setError(items.length === 0); } })
      .catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [attempt]);
  return <fieldset className="route-selector" disabled={disabled}>
    <legend>{t('visits.route')}</legend>
    {!routes.length && !error && <p role="status">{t('routes.loading')}</p>}
    {error && <p role="alert">{t('final.noRoutes')} <button type="button" onClick={() => { setError(false); setAttempt(attempt + 1); }}>{t('profile.retry')}</button></p>}
    <div className="route-options">
      {routes.map((route) => <label key={route.id} className={`route-option ${value === route.id ? 'selected' : value ? 'muted-option' : ''}`}>
        <input type="radio" name="route" value={route.id} checked={value === route.id} onChange={() => onChange(route.id, route)} required />
        <strong>{t(route.slug === 'mirador-picacho' ? 'final.picachoBadge' : 'final.summitBadge')}</strong>
        <span>{t(route.returnSamePath ? 'final.oneWay' : 'final.roundTrip')}: {route.distanceKm?.toFixed(2)} km</span>
        {route.returnSamePath && <><span>{t('final.total')}: {route.totalDistanceKm?.toFixed(2)} km</span><small>{t('final.sameWay')}</small></>}
        {route.estimatedDurationMinutes !== null && <small>{t('final.referenceTime')}: {Math.floor(route.estimatedDurationMinutes / 60)} h {route.estimatedDurationMinutes % 60} min</small>}
      </label>)}
    </div>
  </fieldset>;
}
