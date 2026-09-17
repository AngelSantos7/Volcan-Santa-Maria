import { useTranslation } from 'react-i18next';
import { getWeatherConditionKey } from './weather-service';

type WeatherIconProps = {
  weatherCode: number | null;
  className?: string;
};

export function WeatherIcon({ weatherCode, className = '' }: WeatherIconProps) {
  const { t } = useTranslation();
  const condition = getWeatherConditionKey(weatherCode);
  const isRain = [
    'drizzle',
    'freezingDrizzle',
    'rain',
    'freezingRain',
    'showers',
    'thunderstorm',
  ].includes(condition);
  const isCloudy = condition !== 'clear';

  return (
    <svg
      className={`weather-icon weather-icon--${condition}${className ? ` ${className}` : ''}`}
      viewBox="0 0 64 64"
      role="img"
      aria-label={t(`weather.conditions.${condition}`)}
    >
      {condition === 'clear' && (
        <>
          <circle className="weather-icon-sun" cx="32" cy="32" r="12" />
          <path d="M32 7v8M32 49v8M7 32h8M49 32h8M14 14l6 6M44 44l6 6M50 14l-6 6M20 44l-6 6" />
        </>
      )}
      {isCloudy && (
        <>
          {condition === 'partlyCloudy' && (
            <circle className="weather-icon-sun" cx="24" cy="23" r="10" />
          )}
          <path
            className="weather-icon-cloud"
            d="M17 43h31a9 9 0 0 0 0-18 15 15 0 0 0-28-2A10 10 0 0 0 17 43Z"
          />
        </>
      )}
      {condition === 'fog' && <path d="M13 49h38M18 56h28" />}
      {isRain && (
        <path
          className="weather-icon-rain"
          d="M22 48l-3 7M34 48l-3 7M46 48l-3 7"
        />
      )}
      {condition === 'thunderstorm' && (
        <path
          className="weather-icon-lightning"
          d="M35 43l-7 10h6l-3 7 11-12h-7Z"
        />
      )}
      {condition === 'snow' && (
        <path d="M21 49l5 5M26 49l-5 5M38 49l5 5M43 49l-5 5" />
      )}
    </svg>
  );
}
