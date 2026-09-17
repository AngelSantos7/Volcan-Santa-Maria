import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getAppLanguage } from '../../i18n';
import { WeatherIcon } from './WeatherIcon';
import {
  findClosestForecastHour,
  getCachedVolcanoForecast,
  getGuatemalaLocalTime,
  getVolcanoForecast,
  getWeatherConditionKey,
  REFRESH_COOLDOWN_MS,
} from './weather-service';
import type { VolcanoForecast, WeatherHour } from './weather-types';
import {
  conditionLabel,
  formatWeatherDateTime,
  formatWeatherTime,
  metricValue,
} from './weather-format';

type Metric = { label: string; value: string };

function metricsForHour(
  hour: WeatherHour,
  t: (key: string) => string
): Metric[] {
  return [
    hour.temperatureC === null
      ? null
      : {
          label: t('weather.temperature'),
          value: metricValue(hour.temperatureC, ' °C'),
        },
    hour.humidityPercent === null
      ? null
      : {
          label: t('weather.humidity'),
          value: metricValue(hour.humidityPercent, ' %'),
        },
    hour.precipitationProbability === null
      ? null
      : {
          label: t('weather.rain'),
          value: metricValue(hour.precipitationProbability, ' %'),
        },
    hour.windSpeedKmh === null
      ? null
      : {
          label: t('weather.wind'),
          value: metricValue(hour.windSpeedKmh, ' km/h'),
        },
    hour.windGustKmh === null
      ? null
      : {
          label: t('weather.gusts'),
          value: metricValue(hour.windGustKmh, ' km/h'),
        },
    hour.cloudCoverPercent === null
      ? null
      : {
          label: t('weather.cloudCover'),
          value: metricValue(hour.cloudCoverPercent, ' %'),
        },
  ].filter((metric): metric is Metric => metric !== null);
}

function TemperatureSparkline({ hours }: { hours: WeatherHour[] }) {
  const { t } = useTranslation();
  const values = hours.flatMap((hour, index) =>
    hour.temperatureC === null ? [] : [{ index, value: hour.temperatureC }]
  );
  if (values.length < 2) return null;
  const minimum = Math.min(...values.map(({ value }) => value));
  const maximum = Math.max(...values.map(({ value }) => value));
  const range = Math.max(1, maximum - minimum);
  const points = values
    .map(({ index, value }) => {
      const x = (index / Math.max(1, hours.length - 1)) * 100;
      const y = 35 - ((value - minimum) / range) * 27;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <div className="weather-mini-chart">
      <span>{t('weather.temperatureTrend')}</span>
      <svg
        viewBox="0 0 100 40"
        role="img"
        aria-label={t('weather.temperatureTrend')}
      >
        <polyline points={points} />
      </svg>
    </div>
  );
}

function RainBars({ hours }: { hours: WeatherHour[] }) {
  const { t } = useTranslation();
  if (!hours.some((hour) => hour.precipitationProbability !== null))
    return null;
  return (
    <div className="weather-mini-chart">
      <span>{t('weather.rainTrend')}</span>
      <div
        className="weather-rain-bars"
        role="img"
        aria-label={t('weather.rainTrend')}
      >
        {hours.map((hour) => (
          <i
            key={hour.time}
            style={{
              height: `${Math.max(2, hour.precipitationProbability ?? 0)}%`,
            }}
          />
        ))}
      </div>
    </div>
  );
}

function WeatherSkeleton() {
  return (
    <div className="weather-skeleton" role="status" aria-label="Loading">
      <div />
      <div />
      <div />
    </div>
  );
}

export function WeatherPanel() {
  const { t, i18n } = useTranslation();
  const language = getAppLanguage(i18n.resolvedLanguage);
  const [forecast, setForecast] = useState<VolcanoForecast | null>(() =>
    getCachedVolcanoForecast()
  );
  const [loading, setLoading] = useState(forecast === null);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshLocked, setRefreshLocked] = useState(false);

  const loadForecast = (force = false) => {
    if (force) {
      setRefreshing(true);
      setRefreshLocked(true);
      window.setTimeout(() => setRefreshLocked(false), REFRESH_COOLDOWN_MS);
    }
    void getVolcanoForecast({ force })
      .then((nextForecast) => {
        setForecast(nextForecast);
        setFailed(nextForecast.isStale);
      })
      .catch(() => setFailed(true))
      .finally(() => {
        setLoading(false);
        setRefreshing(false);
      });
  };

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
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const current = forecast
    ? findClosestForecastHour(forecast, getGuatemalaLocalTime())
    : null;
  const upcoming = useMemo(() => {
    if (!forecast || !current) return [];
    const startIndex = forecast.hours.findIndex(
      (hour) => hour.time === current.time
    );
    return forecast.hours.slice(startIndex, startIndex + 12);
  }, [current, forecast]);

  if (loading && !forecast) return <WeatherSkeleton />;
  if ((!forecast || !current) && failed)
    return (
      <p className="weather-state" role="status">
        {t('weather.unavailable')}
      </p>
    );
  if (!forecast || !current)
    return (
      <p className="weather-state" role="status">
        {t('weather.incomplete')}
      </p>
    );

  const today = current.time.slice(0, 10);
  const sunrise = forecast.sunrise.find((value) => value.startsWith(today));
  const sunset = forecast.sunset.find((value) => value.startsWith(today));
  const metrics = metricsForHour(current, t);
  const conditionKey = getWeatherConditionKey(current.weatherCode);

  return (
    <div className="weather-panel">
      <section
        className={`weather-hero weather-hero--${conditionKey}`}
        aria-labelledby="weather-current-title"
      >
        <div className="weather-hero-heading">
          <div>
            <span>{t('weather.volcanoName')}</span>
            <h3 id="weather-current-title">{conditionLabel(current, t)}</h3>
          </div>
          <WeatherIcon
            weatherCode={current.weatherCode}
            className="weather-hero-icon"
          />
        </div>
        <div className="weather-temperature">
          <strong>{metricValue(current.temperatureC, ' °C')}</strong>
          {current.apparentTemperatureC !== null && (
            <span>
              {t('weather.feelsLike', {
                value: Math.round(current.apparentTemperatureC),
              })}
            </span>
          )}
        </div>
        {metrics.length > 0 && (
          <dl className="weather-metric-chips">
            {metrics.map((metric) => (
              <div key={metric.label}>
                <dt>{metric.label}</dt>
                <dd>{metric.value}</dd>
              </div>
            ))}
          </dl>
        )}
        {(sunrise || sunset) && (
          <div className="weather-sun-times">
            {sunrise && (
              <span>
                {t('weather.sunrise')}: {formatWeatherTime(sunrise, language)}
              </span>
            )}
            {sunset && (
              <span>
                {t('weather.sunset')}: {formatWeatherTime(sunset, language)}
              </span>
            )}
          </div>
        )}
      </section>

      {upcoming.length > 0 && (
        <section
          className="weather-hourly"
          aria-labelledby="weather-upcoming-title"
        >
          <h3 id="weather-upcoming-title">{t('weather.nextHours')}</h3>
          <div className="weather-hourly-scroll">
            {upcoming.map((hour, index) => (
              <article
                key={hour.time}
                aria-current={index === 0 ? 'time' : undefined}
              >
                <time dateTime={hour.time}>
                  {index === 0
                    ? t('weather.current')
                    : formatWeatherTime(hour.time, language)}
                </time>
                <WeatherIcon weatherCode={hour.weatherCode} />
                <strong>{metricValue(hour.temperatureC, ' °C')}</strong>
                {hour.precipitationProbability !== null && (
                  <small>
                    {t('weather.rainShort', {
                      value: Math.round(hour.precipitationProbability),
                    })}
                  </small>
                )}
              </article>
            ))}
          </div>
        </section>
      )}

      <div className="weather-chart-grid">
        <TemperatureSparkline hours={upcoming} />
        <RainBars hours={upcoming} />
      </div>
      {(failed || forecast.isStale) && (
        <p className="weather-cached-note">{t('weather.previousData')}</p>
      )}
      <footer className="weather-footer">
        <div>
          <p>
            {t('weather.updatedAt', {
              date: formatWeatherDateTime(forecast.fetchedAt, language),
            })}
          </p>
          <small>{t('weather.referenceNotice')}</small>
        </div>
        <button
          type="button"
          onClick={() => loadForecast(true)}
          disabled={refreshing || refreshLocked}
        >
          {t(refreshing ? 'weather.refreshing' : 'weather.refresh')}
        </button>
      </footer>
    </div>
  );
}
