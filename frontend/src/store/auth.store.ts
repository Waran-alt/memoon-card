/**
 * Auth store (Zustand): user + in-memory access token (refresh stays httpOnly cookie).
 * `getAccessTokenExpiry` decodes JWT payload only for scheduling — trust claims only after server verify (grid 1.2).
 */

import { create } from 'zustand';
import { withLocalStorageRefreshLock } from '@/lib/auth-refresh-lock';
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

/** Single in-flight refresh so Strict Mode double-mount + axios 401 retry cannot race two POST /refresh (rotating refresh cookie would fail the second). */
let refreshAccessSingleFlight: Promise<string | null> | null = null;

/**
 * Serialize refresh across browser tabs. Without this, two tabs can POST /refresh with the same
 * cookie; the first rotates and revokes it, the second hits "reuse detected" and revokes all sessions.
 */
async function withCrossTabRefreshLock<T>(fn: () => Promise<T>): Promise<T> {
  if (typeof navigator !== 'undefined' && navigator.locks?.request) {
    return navigator.locks.request('memoon-auth-refresh', { mode: 'exclusive' }, fn);
  }
  return withLocalStorageRefreshLock(fn);
}

function clearProactiveRefresh(): void {
  if (proactiveRefreshTimeoutId != null) {
    clearTimeout(proactiveRefreshTimeoutId);
    proactiveRefreshTimeoutId = null;
  }
}

function parseRefreshResponseJson(text: string): unknown {
  const t = text.trim();
  if (!t) return null;
  try {
    return JSON.parse(t) as unknown;
  } catch {
    return null;
  }
}

/** Only these statuses mean “session is gone”;5xx / network / bad JSON are transient. */
function isRefreshAuthFailureStatus(status: number): boolean {
  return status === 401 || status === 403;
}

/**
 * POST /refresh returned 401 with a message that means the refresh cookie chain is dead
 * (reuse/revocation/rotation). Retrying refresh without a new login cannot succeed.
 */
function isRefreshSessionInvalidatedMessage(message: unknown): boolean {
  if (typeof message !== 'string') return false;
  const m = message.toLowerCase();
  return (
    m.includes('reuse') ||
    m.includes('revoked') ||
    m.includes('invalid or expired refresh') ||
    m.includes('invalid refresh token') ||
    m.includes('session not found') ||
    m.includes('user not found')
  );
}

export interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  isHydrated: boolean;
  /** When true, refresh failed (e.g. session expired); show re-auth modal instead of redirecting. */
  reauthRequired: boolean;
  /**
   * When true with reauthRequired, the server invalidated refresh sessions (e.g. token reuse across tabs).
   * UI should not offer “retry refresh” — only password login can issue a new session.
   */
  reauthSessionInvalidated: boolean;
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

type AuthRefreshSnapshot = Pick<AuthState, 'reauthRequired' | 'accessToken'>;

function scheduleProactiveRefresh(
  accessToken: string,
  refreshAccess: () => Promise<string | null>,
  getAuthSnapshot: () => AuthRefreshSnapshot
): void {
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
      if (newToken) scheduleProactiveRefresh(newToken, refreshAccess, getAuthSnapshot);
      else {
        const s = getAuthSnapshot();
        if (!s.reauthRequired && s.accessToken) scheduleProactiveRefresh(s.accessToken, refreshAccess, getAuthSnapshot);
      }
    });
  }, msUntilRefresh);
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  accessToken: null,
  isHydrated: false,
  reauthRequired: false,
  reauthSessionInvalidated: false,

  setUser: (user) => set({ user }),
  setAccessToken: (token) => set({ accessToken: token }),
  setHydrated: (isHydrated) => set({ isHydrated }),
  setReauthRequired: (value) => set({ reauthRequired: value }),

  setAuthSuccess: (data) => {
    set({
      user: data.user,
      accessToken: data.accessToken,
      isHydrated: true,
      reauthRequired: false,
      reauthSessionInvalidated: false,
    });
    if (typeof window !== 'undefined')
      scheduleProactiveRefresh(data.accessToken, get().refreshAccess, () => ({
        reauthRequired: get().reauthRequired,
        accessToken: get().accessToken,
      }));
  },

  setFromServer: (user) => set({ user, isHydrated: true }),

  logout: () => {
    clearProactiveRefresh();
    set({
      user: null,
      accessToken: null,
      isHydrated: true,
      reauthRequired: false,
      reauthSessionInvalidated: false,
    });
  },

  refreshAccess: async (): Promise<string | null> => {
    if (refreshAccessSingleFlight) {
      return refreshAccessSingleFlight;
    }
    const API_URL = getClientApiBaseUrl();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
    };
    if (typeof window !== 'undefined') {
      headers['X-Forwarded-Host'] = window.location.host;
    }
    refreshAccessSingleFlight = (async (): Promise<string | null> => {
      return withCrossTabRefreshLock(async () => {
        try {
          const res = await fetch(`${API_URL}/api/auth/refresh`, {
            method: 'POST',
            credentials: 'include',
            headers,
            body: JSON.stringify({}),
          });
          const text = await res.text();
          const parsed = parseRefreshResponseJson(text);
          const data = parsed as {
            success?: boolean;
            error?: string;
            data?: { accessToken?: string; user?: AuthUser };
          } | null;
          const accessToken = data?.success === true && typeof data.data?.accessToken === 'string' ? data.data.accessToken : null;
          const user = data?.data?.user;
          const apiError = typeof data?.error === 'string' ? data.error : '';

          if (res.ok && accessToken) {
            set({
              accessToken,
              user: user ?? get().user,
              reauthRequired: false,
              reauthSessionInvalidated: false,
            });
            if (typeof window !== 'undefined')
              scheduleProactiveRefresh(accessToken, get().refreshAccess, () => ({
                reauthRequired: get().reauthRequired,
                accessToken: get().accessToken,
              }));
            return accessToken;
          }

          if (isRefreshAuthFailureStatus(res.status)) {
            set({
              reauthRequired: true,
              accessToken: null,
              reauthSessionInvalidated: isRefreshSessionInvalidatedMessage(apiError),
            });
            return null;
          }

          return null;
        } catch {
          return null;
        }
      });
    })().finally(() => {
      refreshAccessSingleFlight = null;
    });
    return refreshAccessSingleFlight;
  },

  refreshIfStale: async (): Promise<void> => {
    if (get().reauthRequired) return;
    const token = get().accessToken;
    if (!token) {
      await get().refreshAccess();
      return;
    }
    const exp = getAccessTokenExpiry(token);
    if (exp == null) return;
    const nowSec = Date.now() / 1000;
    if (exp - nowSec > 120) return; // More than 2 min left
    await get().refreshAccess();
  },
}));
