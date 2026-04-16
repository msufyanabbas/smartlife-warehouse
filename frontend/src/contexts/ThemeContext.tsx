import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

export type ThemeMode = 'dark' | 'light' | 'system';

interface ThemeContextType {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  resolved: 'dark' | 'light';
}

const ThemeContext = createContext<ThemeContextType | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(() => {
    return (localStorage.getItem('wh_theme') as ThemeMode) || 'dark';
  });

  const getResolved = (m: ThemeMode): 'dark' | 'light' => {
    if (m === 'system') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return m;
  };

  const [resolved, setResolved] = useState<'dark' | 'light'>(() => getResolved(mode));

  const setMode = (m: ThemeMode) => {
    localStorage.setItem('wh_theme', m);
    setModeState(m);
    setResolved(getResolved(m));
  };

  // Listen for system preference changes
  useEffect(() => {
    if (mode !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => setResolved(mq.matches ? 'dark' : 'light');
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [mode]);

  // Apply theme to document
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', resolved);
  }, [resolved]);

  return (
    <ThemeContext.Provider value={{ mode, setMode, resolved }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}