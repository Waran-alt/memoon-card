'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { useAuthStore } from '@/store/auth.store';
import { ReauthModal } from '@/components/ReauthModal';
import type { AuthUser } from '@/types';

interface AuthHydrateProps {
  serverUser: AuthUser | null;
  children: React.ReactNode;
}

export function AuthHydrate({ serverUser, children }: AuthHydrateProps) {
  const params = useParams();
  const locale = (params?.locale as string) ?? 'en';
  const setFromServer = useAuthStore((s) => s.setFromServer);
  const refreshAccess = useAuthStore((s) => s.refreshAccess);
  const refreshIfStale = useAuthStore((s) => s.refreshIfStale);
  const didRefresh = useRef(false);
  const [tokenReady, setTokenReady] = useState(false);

  // Depend on primitive id/email so we don't re-run when serverUser is a new object reference (e.g. RSC re-run), which would call setFromServer repeatedly and cause the page to re-render every time.
  const userId = serverUser?.id ?? '';
  const userEmail = serverUser?.email ?? '';

  // On mobile: when user returns to the tab, refresh token if it is expired or close to expiry (timers are throttled in background).
  useEffect(() => {
    const onVisibilityChange = (): void => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        void refreshIfStale();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [refreshIfStale]);

  useEffect(() => {
    setFromServer(serverUser);
    if (!serverUser) {
      setTokenReady(true);
      return;
    }
    if (didRefresh.current) {
      setTokenReady(true);
      return;
    }
    didRefresh.current = true;
    refreshAccess().then((token) => {
      setTokenReady(true);
      if (!token) {
        // Store already set reauthRequired; ReauthModal will be shown, no redirect.
      }
    });
    // Only re-run when user identity or locale changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, userEmail, locale, setFromServer, refreshAccess]);

  // Wait for access token before rendering children so first API calls (e.g. GET /api/decks) are sent with Authorization header.
  if (!tokenReady) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <p className="text-sm text-(--mc-text-secondary)">Loading…</p>
      </div>
    );
  }

  return (
    <>
      {children}
      <ReauthModal locale={locale} />
    </>
  );
}
