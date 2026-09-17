import type {
  VolcanoForecast,
  WeatherConditionKey,
  WeatherHour,
} from './weather-types';

const FORECAST_URL = new URL('https://api.open-meteo.com/v1/forecast');
const CACHE_KEY = 'santa-maria-weather:v2';
const CACHE_MAX_AGE_MS = 30 * 60 * 1000;
export const REFRESH_COOLDOWN_MS = 60 * 1000;
const HOURLY_FIELDS = [
  'temperature_2m',
  'apparent_temperature',
  'precipitation_probability',
  'relative_humidity_2m',
  'cloud_cover',
  'weather_code',
  'wind_speed_10m',
  'wind_gusts_10m',
].join(',');

FORECAST_URL.searchParams.set('latitude', '14.757');
FORECAST_URL.searchParams.set('longitude', '-91.552');
FORECAST_URL.searchParams.set('hourly', HOURLY_FIELDS);
FORECAST_URL.searchParams.set('daily', 'sunrise,sunset');
FORECAST_URL.searchParams.set('timezone', 'America/Guatemala');
FORECAST_URL.searchParams.set('forecast_days', '16');

type OpenMeteoResponse = {
  hourly?: {
    time?: unknown;
    temperature_2m?: unknown;
    apparent_temperature?: unknown;
    precipitation_probability?: unknown;
    relative_humidity_2m?: unknown;
    cloud_cover?: unknown;
    weather_code?: unknown;
    wind_speed_10m?: unknown;
    wind_gusts_10m?: unknown;
  };
  daily?: {
    sunrise?: unknown;
    sunset?: unknown;
  };
};

let cachedForecast: VolcanoForecast | null = null;
let inFlightRequest: Promise<VolcanoForecast> | null = null;
let lastNetworkRequestAt = 0;

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function valueAt(values: unknown, index: number): unknown {
  return Array.isArray(values) ? values[index] : null;
}

function parseForecast(payload: OpenMeteoResponse): VolcanoForecast {
  const hourly = payload.hourly;
  if (!hourly || !Array.isArray(hourly.time)) {
    throw new Error('Incomplete weather response');
  }

  const hours = hourly.time.flatMap<WeatherHour>((time, index) => {
    if (
      typeof time !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(time)
    ) {
      return [];
    }

    return [
      {
        time,
        temperatureC: finiteNumber(valueAt(hourly.temperature_2m, index)),
        apparentTemperatureC: finiteNumber(
          valueAt(hourly.apparent_temperature, index)
        ),
        precipitationProbability: finiteNumber(
          valueAt(hourly.precipitation_probability, index)
        ),
        humidityPercent: finiteNumber(
          valueAt(hourly.relative_humidity_2m, index)
        ),
        cloudCoverPercent: finiteNumber(valueAt(hourly.cloud_cover, index)),
        weatherCode: finiteNumber(valueAt(hourly.weather_code, index)),
        windSpeedKmh: finiteNumber(valueAt(hourly.wind_speed_10m, index)),
        windGustKmh: finiteNumber(valueAt(hourly.wind_gusts_10m, index)),
      },
    ];
  });

  if (hours.length === 0) throw new Error('Weather forecast is empty');
  const sunrise = Array.isArray(payload.daily?.sunrise)
    ? payload.daily.sunrise.filter((value): value is string =>
        Boolean(typeof value === 'string' && value.includes('T'))
      )
    : [];
  const sunset = Array.isArray(payload.daily?.sunset)
    ? payload.daily.sunset.filter((value): value is string =>
        Boolean(typeof value === 'string' && value.includes('T'))
      )
    : [];
  return {
    fetchedAt: new Date().toISOString(),
    isStale: false,
    hours,
    sunrise,
    sunset,
  };
}

function readStoredForecast(): VolcanoForecast | null {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<VolcanoForecast>;
    if (
      typeof parsed.fetchedAt !== 'string' ||
      !Array.isArray(parsed.hours) ||
      !Array.isArray(parsed.sunrise) ||
      !Array.isArray(parsed.sunset)
    ) {
      return null;
    }
    return { ...parsed, isStale: Boolean(parsed.isStale) } as VolcanoForecast;
  } catch {
    return null;
  }
}

function storeForecast(forecast: VolcanoForecast): void {
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(forecast));
  } catch {
    // The fresh response remains available in memory when storage is disabled.
  }
}

function isFresh(forecast: VolcanoForecast): boolean {
  return Date.now() - Date.parse(forecast.fetchedAt) < CACHE_MAX_AGE_MS;
}

export function getCachedVolcanoForecast(): VolcanoForecast | null {
  cachedForecast ??= readStoredForecast();
  return cachedForecast;
}

export async function getVolcanoForecast(options?: {
  force?: boolean;
}): Promise<VolcanoForecast> {
  const existing = getCachedVolcanoForecast();
  const force = options?.force === true;
  const refreshIsThrottled =
    force && Date.now() - lastNetworkRequestAt < REFRESH_COOLDOWN_MS;
  if (existing && ((!force && isFresh(existing)) || refreshIsThrottled)) {
    return existing;
  }
  if (inFlightRequest) return inFlightRequest;

  lastNetworkRequestAt = Date.now();
  inFlightRequest = fetch(FORECAST_URL, {
    headers: { Accept: 'application/json' },
  })
    .then(async (response) => {
      if (!response.ok) throw new Error('Weather service unavailable');
      return parseForecast((await response.json()) as OpenMeteoResponse);
    })
    .then((forecast) => {
      cachedForecast = forecast;
      storeForecast(forecast);
      return forecast;
    })
    .catch((error: unknown) => {
      if (existing) return { ...existing, isStale: true };
      throw error;
    })
    .finally(() => {
      inFlightRequest = null;
    });

  return inFlightRequest;
}

export function getGuatemalaLocalTime(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Guatemala',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((entry) => entry.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}`;
}

export function findClosestForecastHour(
  forecast: VolcanoForecast,
  localDateTime: string
): WeatherHour | null {
  const exactHour = `${localDateTime.slice(0, 13)}:00`;
  return (
    forecast.hours.find((hour) => hour.time >= exactHour) ??
    forecast.hours.at(-1) ??
    null
  );
}

export function isWithinForecastRange(
  forecast: VolcanoForecast,
  localDateTime: string
): boolean {
  const first = forecast.hours[0]?.time;
  const last = forecast.hours.at(-1)?.time;
  return Boolean(
    first && last && localDateTime >= first && localDateTime <= last
  );
}

export function getWeatherConditionKey(
  weatherCode: number | null
): WeatherConditionKey {
  if (weatherCode === 0) return 'clear';
  if (weatherCode === 1 || weatherCode === 2) return 'partlyCloudy';
  if (weatherCode === 3) return 'overcast';
  if (weatherCode === 45 || weatherCode === 48) return 'fog';
  if ([51, 53, 55].includes(weatherCode ?? -1)) return 'drizzle';
  if ([56, 57].includes(weatherCode ?? -1)) return 'freezingDrizzle';
  if ([61, 63, 65].includes(weatherCode ?? -1)) return 'rain';
  if ([66, 67].includes(weatherCode ?? -1)) return 'freezingRain';
  if ([71, 73, 75, 77, 85, 86].includes(weatherCode ?? -1)) return 'snow';
  if ([80, 81, 82].includes(weatherCode ?? -1)) return 'showers';
  if ([95, 96, 99].includes(weatherCode ?? -1)) return 'thunderstorm';
  return 'unknown';
}
