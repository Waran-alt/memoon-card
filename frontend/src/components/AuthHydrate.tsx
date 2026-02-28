'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuthStore } from '@/store/auth.store';
import type { AuthUser } from '@/types';

interface AuthHydrateProps {
  serverUser: AuthUser | null;
  children: React.ReactNode;
}

export function AuthHydrate({ serverUser, children }: AuthHydrateProps) {
  const router = useRouter();
  const params = useParams();
  const locale = (params?.locale as string) ?? 'en';
  const setFromServer = useAuthStore((s) => s.setFromServer);
  const refreshAccess = useAuthStore((s) => s.refreshAccess);
  const didRefresh = useRef(false);
  const [tokenReady, setTokenReady] = useState(false);

  // Depend on primitive id/email so we don't re-run when serverUser is a new object reference (e.g. RSC re-run), which would call setFromServer repeatedly and cause the page to re-render every time.
  const userId = serverUser?.id ?? '';
  const userEmail = serverUser?.email ?? '';

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
      if (token) {
        setTokenReady(true);
      } else {
        router.replace(`/${locale}/login`);
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

  return <>{children}</>;
}
