import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getAppLanguage } from '../../i18n';
import { WeatherIcon } from './WeatherIcon';
import {
  findClosestForecastHour,
  getCachedVolcanoForecast,
  getGuatemalaLocalTime,
  getVolcanoForecast,
  isWithinForecastRange,
} from './weather-service';
import {
  classifyWeatherHour,
  classifyWeatherPeriod,
  getWeatherRecommendations,
  type WeatherRisk,
} from './weather-rules';
import type { VolcanoForecast, WeatherHour } from './weather-types';
import {
  formatWeatherDateTime,
  formatWeatherTime,
  metricValue,
} from './weather-format';

type HikeForecastCardProps = {
  startDate: string;
  startTime: string;
  returnDate: string;
  returnTime: string;
  enabled: boolean;
};

const RISK_ICONS: Record<WeatherRisk, string> = {
  favorable: '✓',
  precaution: '!',
  unfavorable: '▲',
  not_recommended: '⊘',
  unavailable: '?',
};

function WeatherRiskBadge({ risk }: { risk: WeatherRisk }) {
  const { t } = useTranslation();
  return (
    <span className={`weather-risk weather-risk--${risk}`}>
      <span aria-hidden="true">{RISK_ICONS[risk]}</span>
      {t(`weather.risk.${risk}`)}
    </span>
  );
}

function ForecastStage({
  label,
  hour,
  risk,
}: {
  label: string;
  hour: WeatherHour;
  risk: WeatherRisk;
}) {
  const { t, i18n } = useTranslation();
  const language = getAppLanguage(i18n.resolvedLanguage);
  return (
    <article className="hike-forecast-stage">
      <div className="hike-forecast-stage-heading">
        <WeatherIcon weatherCode={hour.weatherCode} />
        <div>
          <span>{label}</span>
          <strong>{formatWeatherTime(hour.time, language)}</strong>
        </div>
      </div>
      <p>{metricValue(hour.temperatureC, ' °C')}</p>
      {hour.precipitationProbability !== null && (
        <small>
          {t('weather.rainShort', {
            value: Math.round(hour.precipitationProbability),
          })}
        </small>
      )}
      <WeatherRiskBadge risk={risk} />
    </article>
  );
}

export function HikeForecastCard({
  startDate,
  startTime,
  returnDate,
  returnTime,
  enabled,
}: HikeForecastCardProps) {
  const { t, i18n } = useTranslation();
  const language = getAppLanguage(i18n.resolvedLanguage);
  const [forecast, setForecast] = useState<VolcanoForecast | null>(() =>
    getCachedVolcanoForecast()
  );
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    void getVolcanoForecast()
      .then((nextForecast) => {
        if (!active) return;
        setForecast(nextForecast);
        setFailed(nextForecast.isStale);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const summary = useMemo(() => {
    if (!enabled || !forecast) return null;
    const plannedStart = `${startDate}T${startTime}`;
    const expectedReturn = `${returnDate}T${returnTime}`;
    if (
      !isWithinForecastRange(forecast, plannedStart) ||
      !isWithinForecastRange(forecast, expectedReturn)
    )
      return { unavailable: true } as const;
    const departure = findClosestForecastHour(forecast, plannedStart);
    const duringTime = getGuatemalaLocalTime(
      new Date(
        new Date(`${plannedStart}:00-06:00`).getTime() + 2 * 60 * 60 * 1000
      )
    );
    const during = findClosestForecastHour(forecast, duringTime);
    const returning = findClosestForecastHour(forecast, expectedReturn);
    if (!departure || !during || !returning) return null;
    const period = forecast.hours.filter(
      (hour) => hour.time >= departure.time && hour.time <= returning.time
    );
    if (period.length === 0) return null;
    return {
      unavailable: false,
      departure,
      during,
      returning,
      periodRisk: classifyWeatherPeriod(period),
      recommendations: getWeatherRecommendations(period),
    } as const;
  }, [enabled, forecast, returnDate, returnTime, startDate, startTime]);

  if (!enabled) return null;
  return (
    <aside className="hike-forecast-card" aria-labelledby="hike-forecast-title">
      <div className="hike-forecast-header">
        <div>
          <h3 id="hike-forecast-title">{t('weather.hike.title')}</h3>
          <span>{t('weather.hike.plannedPeriod')}</span>
        </div>
        {summary && !summary.unavailable && (
          <WeatherRiskBadge risk={summary.periodRisk} />
        )}
      </div>
      {!forecast && !failed && <p role="status">{t('weather.loading')}</p>}
      {failed && !forecast && <p role="status">{t('weather.unavailable')}</p>}
      {summary?.unavailable && (
        <p className="weather-range-message" role="status">
          {t('weather.hike.outOfRange')}
          <br />
          {t('weather.hike.outOfRangeFollowUp')}
        </p>
      )}
      {summary && !summary.unavailable && (
        <>
          <div className="hike-forecast-stages">
            <ForecastStage
              label={t('weather.hike.departure')}
              hour={summary.departure}
              risk={classifyWeatherHour(summary.departure)}
            />
            <ForecastStage
              label={t('weather.hike.during')}
              hour={summary.during}
              risk={classifyWeatherHour(summary.during)}
            />
            <ForecastStage
              label={t('weather.hike.return')}
              hour={summary.returning}
              risk={classifyWeatherHour(summary.returning)}
            />
          </div>
          <section
            className="weather-condition-summary"
            aria-labelledby="weather-condition-title"
          >
            <h4 id="weather-condition-title">
              {t('weather.hike.conditionsTitle')}
            </h4>
            <dl>
              <div>
                <dt>{t('weather.hike.departure')}</dt>
                <dd>
                  <WeatherRiskBadge
                    risk={classifyWeatherHour(summary.departure)}
                  />
                </dd>
              </div>
              <div>
                <dt>{t('weather.hike.during')}</dt>
                <dd>
                  <WeatherRiskBadge
                    risk={classifyWeatherHour(summary.during)}
                  />
                </dd>
              </div>
              <div>
                <dt>{t('weather.hike.return')}</dt>
                <dd>
                  <WeatherRiskBadge
                    risk={classifyWeatherHour(summary.returning)}
                  />
                </dd>
              </div>
            </dl>
          </section>
          {summary.recommendations.length > 0 && (
            <section
              className="weather-advice"
              aria-labelledby="weather-advice-title"
            >
              <h4 id="weather-advice-title">
                {t('weather.hike.recommendationsTitle')}
              </h4>
              <ul>
                {summary.recommendations.map((key) => (
                  <li key={key}>{t(`weather.hike.advice.${key}`)}</li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
      {(failed || forecast?.isStale) && forecast && (
        <p className="weather-cached-note">{t('weather.previousData')}</p>
      )}
      {forecast && (
        <small>
          {t('weather.updatedAt', {
            date: formatWeatherDateTime(forecast.fetchedAt, language),
          })}
        </small>
      )}
      <small>{t('weather.hike.referenceFastChange')}</small>
      <small className="weather-guidance-disclaimer">
        {t('weather.hike.guidanceDisclaimer')}
      </small>
    </aside>
  );
}
