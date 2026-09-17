import type { TFunction } from 'i18next';
import type { AppLanguage } from '../../i18n';
import type { WeatherHour } from './weather-types';
import { getWeatherConditionKey } from './weather-service';

export function formatWeatherTime(time: string, language: AppLanguage): string {
  const [, clock = time] = time.split('T');
  const [hour = '00', minute = '00'] = clock.split(':');
  const value = new Date(2000, 0, 1, Number(hour), Number(minute));
  return new Intl.DateTimeFormat(language === 'es' ? 'es-GT' : 'en', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(value);
}

export function formatWeatherDateTime(
  isoDate: string,
  language: AppLanguage
): string {
  return new Intl.DateTimeFormat(language === 'es' ? 'es-GT' : 'en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(isoDate));
}

export function conditionLabel(hour: WeatherHour, t: TFunction): string {
  return t(`weather.conditions.${getWeatherConditionKey(hour.weatherCode)}`);
}

export function metricValue(value: number | null, suffix: string): string {
  return value === null ? '—' : `${Math.round(value)}${suffix}`;
}
