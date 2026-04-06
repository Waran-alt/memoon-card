'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import apiClient from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { THEME_STORAGE_KEY, type ResolvedTheme, type ThemeSetting } from '@/theme';
import { resolveThemePreference } from '@/theme/resolveTheme';

type ThemeContextValue = {
  theme: ThemeSetting;
  setTheme: (t: ThemeSetting) => void;
  resolvedTheme: ResolvedTheme;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function subscribeSystemDark(cb: () => void) {
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
}

function getSystemDark() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function getServerSnapshot() {
  return false;
}

function readStoredTheme(): ThemeSetting {
  if (typeof window === 'undefined') return 'system';
  try {
    const s = localStorage.getItem(THEME_STORAGE_KEY);
    if (s === 'light' || s === 'dark' || s === 'monokai' || s === 'system') return s;
  } catch {
    /* ignore */
  }
  return 'system';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const prefersDark = useSyncExternalStore(subscribeSystemDark, getSystemDark, getServerSnapshot);
  const userId = useAuthStore((s) => s.user?.id);
  const [theme, setThemeState] = useState<ThemeSetting>('system');

  useLayoutEffect(() => {
    setThemeState(readStoredTheme());
  }, []);

  /** When signed in, apply theme from server (cross-device sync). */
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    apiClient
      .get<{ success: boolean; data?: { ui_theme?: string | null } }>('/api/user/settings')
      .then((res) => {
        if (cancelled) return;
        const t = res.data?.data?.ui_theme;
        if (t === 'light' || t === 'dark' || t === 'monokai' || t === 'system') {
          setThemeState(t);
          try {
            localStorage.setItem(THEME_STORAGE_KEY, t);
          } catch {
            /* ignore */
          }
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const resolvedTheme = useMemo(
    () => resolveThemePreference(theme, prefersDark),
    [theme, prefersDark]
  );

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', resolvedTheme);
  }, [resolvedTheme]);

  const setTheme = useCallback((next: ThemeSetting) => {
    setThemeState(next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
    if (useAuthStore.getState().user?.id) {
      void apiClient.patch('/api/user/settings', { ui_theme: next }).catch(() => {});
    }
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, setTheme, resolvedTheme }),
    [theme, setTheme, resolvedTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return ctx;
}
