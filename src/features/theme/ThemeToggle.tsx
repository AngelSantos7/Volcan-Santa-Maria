import { useTranslation } from 'react-i18next';
import { useTheme } from './theme-context';

export function ThemeToggle() {
  const { t } = useTranslation();
  const { theme, setTheme } = useTheme();
  const isDark = theme === 'dark';
  const label = t(isDark ? 'theme.switchToLight' : 'theme.switchToDark');

  return (
    <button
      className="theme-toggle"
      type="button"
      aria-label={label}
      title={label}
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
    >
      {isDark ? (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="3.75" />
          <path d="M12 2.25v2M12 19.75v2M4.25 12h-2M21.75 12h-2M5.1 5.1l1.4 1.4M17.5 17.5l1.4 1.4M18.9 5.1l-1.4 1.4M6.5 17.5l-1.4 1.4" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M20.25 15.35A8.5 8.5 0 0 1 8.65 3.75a8.5 8.5 0 1 0 11.6 11.6Z" />
        </svg>
      )}
    </button>
  );
}
