import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useColorScheme } from '@mui/material/styles';
import { loadThemeMode, saveThemeMode } from '../lib/storage';

interface ThemeCtx {
  mode: 'light' | 'dark';
  toggle: () => void;
}

const ThemeContext = createContext<ThemeCtx | null>(null);

export function ThemeModeProvider({ children }: { children: ReactNode }) {
  const { setMode } = useColorScheme();
  const [mode, setLocalMode] = useState<'light' | 'dark'>(() => {
    // `?theme=light|dark` wins once, for deep links and screenshot/critique passes.
    const requested = new URLSearchParams(window.location.search).get('theme');
    if (requested === 'light' || requested === 'dark') return requested;
    return loadThemeMode() ?? 'dark';
  });

  useEffect(() => {
    setMode?.(mode);
    saveThemeMode(mode);
  }, [mode, setMode]);

  const value = useMemo<ThemeCtx>(
    () => ({ mode, toggle: () => setLocalMode((m) => (m === 'light' ? 'dark' : 'light')) }),
    [mode],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useThemeMode(): ThemeCtx {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useThemeMode must be used within ThemeModeProvider');
  return ctx;
}
