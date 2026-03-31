'use client';

import { useEffect, useState } from 'react';
import apiClient from '@/lib/api';
import { useTranslation } from '@/hooks/useTranslation';
import { useLocale } from 'i18n';
import { useConnectionState } from '@/hooks/useConnectionState';
import { flushPendingQueue } from '@/lib/studySync';
import { useConnectionSyncStore } from '@/store/connectionSync.store';

/** Snapshot of connectivity/sync when the user dismissed the banner; hiding applies only while this still matches live state. */
type BannerDismissSnapshot = { isOnline: boolean; pendingCount: number; hadFailure: boolean };

/**
 * Global study-sync + connectivity banner for all authenticated app pages.
 * Offline messaging falls away once `isOnline` is true and there is nothing left to show; dismiss uses a snapshot so reconnect clears a stale dismiss without effects.
 * flushPendingQueue posts via apiClient (cookies, CSRF header).
 */
export function ConnectionSyncBanner() {
  const { locale } = useLocale();
  const { t: ta } = useTranslation('app', locale);
  const { isOnline, hadFailure, setHadFailure } = useConnectionState();
  const pendingCount = useConnectionSyncStore((s) => s.pendingCount);
  const refreshPendingCount = useConnectionSyncStore((s) => s.refreshPendingCount);

  const [dismissSnapshot, setDismissSnapshot] = useState<BannerDismissSnapshot | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const flush = () => {
      flushPendingQueue((url, payload) => apiClient.post(url, payload)).then(({ flushed }) => {
        refreshPendingCount();
        if (flushed > 0) setHadFailure(false);
      });
    };
    const onOnline = () => flush();
    window.addEventListener('online', onOnline);
    refreshPendingCount();
    if (typeof navigator !== 'undefined' && navigator.onLine) flush();
    return () => window.removeEventListener('online', onOnline);
  }, [refreshPendingCount, setHadFailure]);

  const needsBanner = !isOnline || pendingCount > 0 || hadFailure;
  const hiddenByDismiss =
    dismissSnapshot != null &&
    dismissSnapshot.isOnline === isOnline &&
    dismissSnapshot.pendingCount === pendingCount &&
    dismissSnapshot.hadFailure === hadFailure;

  const showConnectionBanner = needsBanner && !hiddenByDismiss;
  const connectionMessage = !isOnline ? ta('offlineWillRetry') : ta('connectionLostWillRetry');

  if (!showConnectionBanner) return null;

  /** Sidebar `md:w-52` + main horizontal padding `p-6` so the toast aligns with content column. */
  return (
    <div
      className="pointer-events-none fixed left-4 right-4 top-[calc(3.5rem+0.75rem)] z-[60] md:left-[calc(13rem+1.5rem)] md:right-6"
      aria-live="polite"
    >
      <div
        className="pointer-events-auto flex items-center justify-between gap-3 rounded-xl border border-(--mc-accent-warning)/40 bg-(--mc-bg-surface)/95 px-4 py-3 text-sm text-(--mc-accent-warning) shadow-lg ring-1 ring-black/5 backdrop-blur-md dark:ring-white/10"
        role="status"
      >
        <span className="min-w-0 leading-snug">{connectionMessage}</span>
        <button
          type="button"
          onClick={() => {
            setHadFailure(false);
            refreshPendingCount();
            const p = useConnectionSyncStore.getState().pendingCount;
            setDismissSnapshot({ isOnline, pendingCount: p, hadFailure: false });
          }}
          className="shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-medium hover:bg-(--mc-accent-warning)/15"
        >
          {ta('dismiss')}
        </button>
      </div>
    </div>
  );
}
