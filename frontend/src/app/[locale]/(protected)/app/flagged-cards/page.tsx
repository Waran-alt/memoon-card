'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useLocale } from 'i18n';
import { useSearchParams } from 'next/navigation';
import { useApiGet } from '@/hooks/useApiGet';
import apiClient, { getApiErrorMessage } from '@/lib/api';
import { useTranslation } from '@/hooks/useTranslation';

interface FlagWithCard {
  id: string;
  card_id: string;
  deck_id: string;
  deck_title: string;
  reason: string;
  note: string | null;
  resolved: boolean;
  created_at: string;
  recto_snippet: string;
}

export default function FlaggedCardsPage() {
  const { locale } = useLocale();
  const searchParams = useSearchParams();
  const deckId = searchParams.get('deckId') ?? '';
  const { t: tc } = useTranslation('common', locale);
  const { t: ta } = useTranslation('app', locale);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [resolveError, setResolveError] = useState('');

  const flagsUrl = useMemo(
    () => `/api/cards/flags?resolved=false${deckId ? `&deckId=${encodeURIComponent(deckId)}` : ''}`,
    [deckId]
  );
  const { data: flags, loading, error, refetch } = useApiGet<FlagWithCard[]>(
    flagsUrl,
    { errorFallback: ta('flaggedCardsLoadError') }
  );

  const rows = flags ?? [];

  async function handleResolve(flagId: string) {
    setResolvingId(flagId);
    setResolveError('');
    try {
      await apiClient.patch(`/api/cards/flags/${flagId}`, { resolved: true });
      await refetch();
    } catch (err) {
      setResolveError(getApiErrorMessage(err, ta('flaggedCardsResolveError')));
    } finally {
      setResolvingId(null);
    }
  }

  return (
    <div className="mc-study-page mx-auto max-w-3xl space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-(--mc-text-primary)">{ta('flaggedCardsTitle')}</h2>
        <p className="mt-1 text-sm text-(--mc-text-secondary)">{ta('flaggedCardsIntro')}</p>
      </div>
      {resolveError && (
        <p className="text-sm text-(--mc-accent-danger)" role="alert">{resolveError}</p>
      )}
      {loading && <p className="text-sm text-(--mc-text-secondary)">{tc('loading')}</p>}
      {error && (
        <p className="text-sm text-(--mc-accent-danger)" role="alert">{error}</p>
      )}
      {!loading && !error && rows.length === 0 && (
        <p className="text-sm text-(--mc-text-secondary)">{ta('flaggedCardsEmpty')}</p>
      )}
      {!loading && !error && rows.length > 0 && (
        <ul className="space-y-3">
          {rows.map((flag) => (
            <li key={flag.id} className="rounded-lg border border-(--mc-border-subtle) bg-(--mc-bg-surface) p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-(--mc-text-primary)">
                    {flag.recto_snippet}{flag.recto_snippet.length >= 80 ? '…' : ''}
                  </p>
                  <p className="mt-1 text-xs text-(--mc-text-secondary)">
                    {ta('flaggedCardsDeck')}:{' '}
                    <Link href={`/${locale}/app/decks/${flag.deck_id}`} className="text-(--mc-accent-primary) underline hover:no-underline">
                      {flag.deck_title}
                    </Link>
                  </p>
                  <p className="mt-0.5 text-xs text-(--mc-text-secondary)">
                    {ta('flaggedCardsReason')}: {flag.reason}{flag.note ? ` — ${flag.note}` : ''}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Link
                    href={`/${locale}/app/decks/${flag.deck_id}?manageCard=${flag.card_id}`}
                    className="rounded border border-(--mc-border-subtle) px-3 pt-1 pb-1.5 text-sm font-medium hover:bg-(--mc-bg-card-back)"
                  >
                    {ta('editCard')}
                  </Link>
                  <button
                    type="button"
                    disabled={resolvingId === flag.id}
                    onClick={() => handleResolve(flag.id)}
                    className="rounded bg-(--mc-accent-success) px-3 pt-1 pb-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
                  >
                    {resolvingId === flag.id ? tc('loading') : ta('flaggedCardsResolve')}
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-(--mc-text-secondary)">
        <Link href={`/${locale}/app`} className="text-(--mc-accent-primary) underline hover:no-underline">
          {ta('backToDecks')}
        </Link>
      </p>
    </div>
  );
}
