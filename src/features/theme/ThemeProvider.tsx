import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ThemeContext, type Theme, type ThemeContextValue } from './theme-context';

const STORAGE_KEY = 'volcan-santa-maria:theme';
function initialTheme(): Theme {
  try {
    const theme = window.localStorage.getItem(STORAGE_KEY) === 'light' ? 'light' : 'dark';
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    return theme;
  } catch {
    document.documentElement.dataset.theme = 'dark';
    document.documentElement.style.colorScheme = 'dark';
    return 'dark';
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(initialTheme);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  }, [theme]);
  const value = useMemo<ThemeContextValue>(() => ({
    theme,
    setTheme(nextTheme) {
      setThemeState(nextTheme);
      try {
        window.localStorage.setItem(STORAGE_KEY, nextTheme);
      } catch {
        // The visual preference still applies for the current session.
      }
    },
  }), [theme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
