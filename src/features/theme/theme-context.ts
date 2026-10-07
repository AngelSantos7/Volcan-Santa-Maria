import { createContext, useContext } from 'react';

export type Theme = 'dark' | 'light';
export type ThemeContextValue = { theme: Theme; setTheme: (theme: Theme) => void };

export const ThemeContext = createContext<ThemeContextValue | null>(null);

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useTheme must be used within ThemeProvider');
  return value;
}
