import type { WeatherHour } from './weather-types';

export type WeatherRisk =
  'favorable' | 'precaution' | 'adverse' | 'unavailable';

export type WeatherAdviceKey =
  'rainProtection' | 'moderateGusts' | 'strongWind' | 'rainIncreasingAtReturn';

export const WEATHER_THRESHOLDS = {
  rain: { precaution: 40, adverse: 70 },
  wind: { precaution: 20, adverse: 35 },
  gust: { precaution: 35, adverse: 50 },
} as const;

const ADVERSE_CODES = new Set([56, 57, 65, 66, 67, 75, 82, 86, 95, 96, 99]);
const PRECAUTION_CODES = new Set([
  45, 48, 51, 53, 55, 61, 63, 71, 73, 77, 80, 81, 85,
]);
const RISK_WEIGHT: Record<WeatherRisk, number> = {
  unavailable: 0,
  favorable: 1,
  precaution: 2,
  adverse: 3,
};

function reaches(value: number | null, threshold: number): boolean {
  return value !== null && value >= threshold;
}

export function classifyWeatherHour(hour: WeatherHour): WeatherRisk {
  const hasData = [
    hour.weatherCode,
    hour.precipitationProbability,
    hour.windSpeedKmh,
    hour.windGustKmh,
  ].some((value) => value !== null);
  if (!hasData) return 'unavailable';

  if (
    ADVERSE_CODES.has(hour.weatherCode ?? -1) ||
    reaches(hour.precipitationProbability, WEATHER_THRESHOLDS.rain.adverse) ||
    reaches(hour.windSpeedKmh, WEATHER_THRESHOLDS.wind.adverse) ||
    reaches(hour.windGustKmh, WEATHER_THRESHOLDS.gust.adverse)
  ) {
    return 'adverse';
  }

  if (
    PRECAUTION_CODES.has(hour.weatherCode ?? -1) ||
    reaches(
      hour.precipitationProbability,
      WEATHER_THRESHOLDS.rain.precaution
    ) ||
    reaches(hour.windSpeedKmh, WEATHER_THRESHOLDS.wind.precaution) ||
    reaches(hour.windGustKmh, WEATHER_THRESHOLDS.gust.precaution)
  ) {
    return 'precaution';
  }

  return 'favorable';
}

export function classifyWeatherPeriod(hours: WeatherHour[]): WeatherRisk {
  return hours.reduce<WeatherRisk>((worst, hour) => {
    const current = classifyWeatherHour(hour);
    return RISK_WEIGHT[current] > RISK_WEIGHT[worst] ? current : worst;
  }, 'unavailable');
}

export function selectRepresentativeHour(hours: WeatherHour[]): WeatherHour {
  return hours.reduce((selected, hour) => {
    const riskDifference =
      RISK_WEIGHT[classifyWeatherHour(hour)] -
      RISK_WEIGHT[classifyWeatherHour(selected)];
    if (riskDifference !== 0) return riskDifference > 0 ? hour : selected;

    const currentScore =
      (hour.precipitationProbability ?? 0) +
      (hour.windGustKmh ?? hour.windSpeedKmh ?? 0);
    const selectedScore =
      (selected.precipitationProbability ?? 0) +
      (selected.windGustKmh ?? selected.windSpeedKmh ?? 0);
    return currentScore > selectedScore ? hour : selected;
  });
}

export function getWeatherRecommendations(
  hours: WeatherHour[]
): WeatherAdviceKey[] {
  if (hours.length === 0) return [];
  const recommendations: WeatherAdviceKey[] = [];
  const maxRain = Math.max(
    ...hours.map((hour) => hour.precipitationProbability ?? 0)
  );
  const maxWind = Math.max(...hours.map((hour) => hour.windSpeedKmh ?? 0));
  const maxGust = Math.max(...hours.map((hour) => hour.windGustKmh ?? 0));
  const firstRain = hours[0]?.precipitationProbability ?? 0;
  const lastRain = hours.at(-1)?.precipitationProbability ?? 0;

  if (maxRain >= WEATHER_THRESHOLDS.rain.precaution) {
    recommendations.push('rainProtection');
  }
  if (
    maxWind >= WEATHER_THRESHOLDS.wind.adverse ||
    maxGust >= WEATHER_THRESHOLDS.gust.adverse
  ) {
    recommendations.push('strongWind');
  } else if (
    maxWind >= WEATHER_THRESHOLDS.wind.precaution ||
    maxGust >= WEATHER_THRESHOLDS.gust.precaution
  ) {
    recommendations.push('moderateGusts');
  }
  if (
    lastRain - firstRain >= 20 &&
    lastRain >= WEATHER_THRESHOLDS.rain.precaution
  ) {
    recommendations.push('rainIncreasingAtReturn');
  }

  return recommendations.slice(0, 3);
}
