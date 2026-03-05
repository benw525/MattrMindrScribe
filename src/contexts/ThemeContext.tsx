import React, { useCallback, useEffect, useState, createContext } from 'react';
type Theme = 'light' | 'dark';
interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}
export const ThemeContext = createContext<ThemeContextType | undefined>(
  undefined
);
export function ThemeProvider({ children }: {children: ReactNode;}) {
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('mms-theme');
      if (stored === 'dark' || stored === 'light') return stored;
      return window.matchMedia('(prefers-color-scheme: dark)').matches ?
      'dark' :
      'light';
    }
    return 'light';
  });
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('mms-theme', theme);
  }, [theme]);
  const toggleTheme = useCallback(() => {
    setThemeState((prev) => prev === 'light' ? 'dark' : 'light');
  }, []);
  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
  }, []);
  return (
    <ThemeContext.Provider
      value={{
        theme,
        toggleTheme,
        setTheme
      }}>

      {children}
    </ThemeContext.Provider>);

}