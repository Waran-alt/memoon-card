/**
 * Auth store (Zustand)
 *
 * Holds user, accessToken, and hydration state. Access token is kept in memory
 * (not localStorage) for XSS safety; refresh token is httpOnly cookie.
 * Schedules proactive refresh before access token expiry (e.g. on mobile) to avoid 401.
 */

import { create } from 'zustand';
import { getClientApiBaseUrl } from '@/lib/env';
import type { AuthUser } from '@/types';

/** Decode JWT payload without verification (client-side exp only). Returns exp in seconds or null. */
function getAccessTokenExpiry(token: string): number | null {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    return typeof decoded.exp === 'number' ? decoded.exp : null;
  } catch {
    return null;
  }
}

const PROACTIVE_REFRESH_BEFORE_MS = 2 * 60 * 1000; // Refresh 2 min before expiry
let proactiveRefreshTimeoutId: ReturnType<typeof setTimeout> | null = null;

function clearProactiveRefresh(): void {
  if (proactiveRefreshTimeoutId != null) {
    clearTimeout(proactiveRefreshTimeoutId);
    proactiveRefreshTimeoutId = null;
  }
}

function scheduleProactiveRefresh(accessToken: string, refreshAccess: () => Promise<string | null>): void {
  clearProactiveRefresh();
  const exp = getAccessTokenExpiry(accessToken);
  if (exp == null) return;
  const nowMs = Date.now();
  const expMs = exp * 1000;
  const msUntilRefresh = expMs - nowMs - PROACTIVE_REFRESH_BEFORE_MS;
  if (msUntilRefresh <= 0) {
    void refreshAccess();
    return;
  }
  proactiveRefreshTimeoutId = setTimeout(() => {
    proactiveRefreshTimeoutId = null;
    refreshAccess().then((newToken) => {
      if (newToken) scheduleProactiveRefresh(newToken, refreshAccess);
    });
  }, msUntilRefresh);
}

export interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  isHydrated: boolean;
  /** When true, refresh failed (e.g. session expired); show re-auth modal instead of redirecting. */
  reauthRequired: boolean;
  setUser: (user: AuthUser | null) => void;
  setAccessToken: (token: string | null) => void;
  setHydrated: (hydrated: boolean) => void;
  setReauthRequired: (value: boolean) => void;
  /** Set user + access token + hydrated after successful login/register; then redirect in the page */
  setAuthSuccess: (data: { accessToken: string; user: AuthUser }) => void;
  /** Set user from SSR/session (no access token); caller should call refreshAccess() for API calls */
  setFromServer: (user: AuthUser | null) => void;
  /** Clear user and token; call after failed refresh or explicit logout */
  logout: () => void;
  /** Call POST /api/auth/refresh (cookie sent automatically). Returns new accessToken or null. */
  refreshAccess: () => Promise<string | null>;
  /** If access token is expired or expires within 2 min, refresh (e.g. when tab becomes visible again). */
  refreshIfStale: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  accessToken: null,
  isHydrated: false,
  reauthRequired: false,

  setUser: (user) => set({ user }),
  setAccessToken: (token) => set({ accessToken: token }),
  setHydrated: (isHydrated) => set({ isHydrated }),
  setReauthRequired: (value) => set({ reauthRequired: value }),

  setAuthSuccess: (data) => {
    set({ user: data.user, accessToken: data.accessToken, isHydrated: true, reauthRequired: false });
    if (typeof window !== 'undefined') scheduleProactiveRefresh(data.accessToken, get().refreshAccess);
  },

  setFromServer: (user) => set({ user, isHydrated: true }),

  logout: () => {
    clearProactiveRefresh();
    set({ user: null, accessToken: null, isHydrated: true, reauthRequired: false });
  },

  refreshAccess: async (): Promise<string | null> => {
    const API_URL = getClientApiBaseUrl();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
    };
    if (typeof window !== 'undefined') {
      headers['X-Forwarded-Host'] = window.location.host;
    }
    try {
      const res = await fetch(`${API_URL}/api/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        headers,
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok || !data?.success || !data?.data?.accessToken) {
        set({ reauthRequired: true, accessToken: null });
        return null;
      }
      const { accessToken, user } = data.data;
      set({ accessToken, user: user ?? get().user });
      if (typeof window !== 'undefined') scheduleProactiveRefresh(accessToken, get().refreshAccess);
      return accessToken;
    } catch {
      set({ reauthRequired: true, accessToken: null });
      return null;
    }
  },

  refreshIfStale: async (): Promise<void> => {
    const token = get().accessToken;
    if (!token) return;
    const exp = getAccessTokenExpiry(token);
    if (exp == null) return;
    const nowSec = Date.now() / 1000;
    if (exp - nowSec > 120) return; // More than 2 min left
    await get().refreshAccess();
  },
}));
