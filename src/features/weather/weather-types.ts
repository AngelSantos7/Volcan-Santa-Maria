export type WeatherHour = {
  time: string;
  temperatureC: number | null;
  apparentTemperatureC: number | null;
  precipitationProbability: number | null;
  humidityPercent: number | null;
  cloudCoverPercent: number | null;
  weatherCode: number | null;
  windSpeedKmh: number | null;
  windGustKmh: number | null;
};

export type VolcanoForecast = {
  fetchedAt: string;
  isStale: boolean;
  hours: WeatherHour[];
  sunrise: string[];
  sunset: string[];
};

export type WeatherConditionKey =
  | 'clear'
  | 'partlyCloudy'
  | 'overcast'
  | 'fog'
  | 'drizzle'
  | 'freezingDrizzle'
  | 'rain'
  | 'freezingRain'
  | 'snow'
  | 'showers'
  | 'thunderstorm'
  | 'unknown';
