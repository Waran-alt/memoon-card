'use client';

/**
 * My decks: loads /api/decks with credentials; backend scopes by JWT user (IDOR).
 */
import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useLocale } from 'i18n';
import apiClient, { getApiErrorMessage } from '@/lib/api';
import type { Deck } from '@/types';
import { useTranslation } from '@/hooks/useTranslation';
import { useApiGet } from '@/hooks/useApiGet';
import { VALIDATION_LIMITS } from '@memoon-card/shared';
import { Button, buttonClassName } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Layers } from 'lucide-react';

const { DECK_TITLE_MAX, DECK_DESCRIPTION_MAX } = VALIDATION_LIMITS;

interface DeckStats {
  totalCards: number;
  dueCards: number;
  newCards: number;
  reviewedToday: number;
}

export default function AppPage() {
  const { locale } = useLocale();
  const { t: tc } = useTranslation('common', locale);
  const { t: ta } = useTranslation('app', locale);
  const { data: decksData, loading, error, refetch } = useApiGet<Deck[]>('/api/decks', {
    errorFallback: ta('failedLoadDecks'),
  });
  const decks = useMemo(() => (Array.isArray(decksData) ? decksData : []), [decksData]);
  const deckIds = useMemo(() => decks.map((d) => d.id), [decks]);
  const deckIdsKey = deckIds.join(',');
  const [deckStats, setDeckStats] = useState<Record<string, DeckStats>>({});
  const [showCreate, setShowCreate] = useState(false);
  const [createTitle, setCreateTitle] = useState('');
  const [createDescription, setCreateDescription] = useState('');
  const [createCategoryNames, setCreateCategoryNames] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  // Fetch stats for each deck when list is loaded (async body avoids sync setState in effect)
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (deckIds.length === 0) {
        if (!cancelled) setDeckStats({});
        return;
      }
      const results = await Promise.all(
        deckIds.map((id) =>
          apiClient
            .get<{ success: boolean; data?: DeckStats }>(`/api/decks/${id}/stats`)
            .then((res) => (res.data?.success && res.data.data ? { id, stats: res.data.data } : null))
            .catch(() => ({ id, stats: null as DeckStats | null }))
        )
      );
      if (cancelled) return;
      const next: Record<string, DeckStats> = {};
      results.forEach((r) => {
        if (r?.stats) next[r.id] = r.stats;
      });
      setDeckStats(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [deckIdsKey, deckIds]);

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreateError('');
    const title = createTitle.trim();
    if (!title) {
      setCreateError(ta('titleRequired'));
      return;
    }
    const categoryNames = createCategoryNames
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    setCreating(true);
    apiClient
      .post<{ success: boolean; data?: Deck }>('/api/decks', {
        title,
        description: createDescription.trim() || undefined,
        ...(categoryNames.length > 0 ? { categoryNames } : {}),
      })
      .then((res) => {
        if (res.data?.success && res.data.data) {
          refetch();
          setCreateTitle('');
          setCreateDescription('');
          setCreateCategoryNames('');
          setShowCreate(false);
        } else {
          setCreateError(tc('invalidResponse'));
        }
      })
      .catch((err) => setCreateError(getApiErrorMessage(err, ta('failedCreateDeck'))))
      .finally(() => setCreating(false));
  }

  return (
    <div className="mc-study-page mx-auto w-full max-w-5xl space-y-6">
      <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-(--mc-text-secondary)">
          {ta('decksIntro')}
        </p>
        <Button
          type="button"
          onClick={() => {
            setShowCreate(true);
            setCreateError('');
          }}
          className="shrink-0 self-start sm:self-auto"
        >
          {tc('newDeck')}
        </Button>
      </div>

      {error && (
        <p className="text-sm text-(--mc-accent-danger)" role="alert" aria-live="polite">
          {error}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-(--mc-text-secondary)">{ta('loadingDecks')}</p>
      ) : showCreate ? (
        <form
          onSubmit={handleCreate}
          className="mc-study-surface rounded-xl border p-5 shadow-sm"
        >
          <h2 className="mb-3 text-sm font-medium text-(--mc-text-primary)">
            {ta('createDeck')}
          </h2>
          <div className="space-y-3">
            <div>
              <label htmlFor="deck-title" className="mb-1 block text-sm font-medium text-(--mc-text-secondary)">
                {ta('title')}
              </label>
              <input
                id="deck-title"
                type="text"
                value={createTitle}
                onChange={(e) => setCreateTitle(e.target.value)}
                maxLength={DECK_TITLE_MAX}
                placeholder={ta('titlePlaceholder')}
                required
                autoFocus
                className="w-full rounded border border-(--mc-border-subtle) bg-(--mc-bg-surface) px-3 py-2 text-sm text-(--mc-text-primary)"
              />
              <p className="mt-0.5 text-xs text-(--mc-text-secondary)">
                {createTitle.length}/{DECK_TITLE_MAX}
              </p>
            </div>
            <div>
              <label htmlFor="deck-description" className="mb-1 block text-sm font-medium text-(--mc-text-secondary)">
                {ta('description')}
              </label>
              <textarea
                id="deck-description"
                value={createDescription}
                onChange={(e) => setCreateDescription(e.target.value)}
                maxLength={DECK_DESCRIPTION_MAX}
                placeholder={ta('descriptionPlaceholder')}
                rows={2}
                className="w-full rounded border border-(--mc-border-subtle) bg-(--mc-bg-surface) px-3 py-2 text-sm text-(--mc-text-primary)"
              />
              <p className="mt-0.5 text-xs text-(--mc-text-secondary)">
                {createDescription.length}/{DECK_DESCRIPTION_MAX}
              </p>
            </div>
            <div>
              <label htmlFor="deck-categories" className="mb-1 block text-sm font-medium text-(--mc-text-secondary)">
                {ta('createDeckCategoriesLabel')}
              </label>
              <textarea
                id="deck-categories"
                value={createCategoryNames}
                onChange={(e) => setCreateCategoryNames(e.target.value)}
                placeholder={ta('createDeckCategoriesPlaceholder')}
                rows={2}
                className="w-full rounded border border-(--mc-border-subtle) bg-(--mc-bg-surface) px-3 py-2 text-sm text-(--mc-text-primary)"
              />
              <p className="mt-0.5 text-xs text-(--mc-text-secondary)">
                {ta('createDeckCategoriesHint')}
              </p>
            </div>
            {createError && (
              <p className="text-sm text-(--mc-accent-danger)" role="alert" aria-live="polite">
                {createError}
              </p>
            )}
            <div className="flex gap-2">
              <Button type="submit" disabled={creating || !createTitle.trim()} size="sm">
                {creating ? tc('creating') : tc('create')}
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  setShowCreate(false);
                  setCreateTitle('');
                  setCreateDescription('');
                  setCreateCategoryNames('');
                  setCreateError('');
                }}
              >
                {tc('cancel')}
              </Button>
            </div>
          </div>
        </form>
      ) : null}

      {!loading && !showCreate && decks.length === 0 && (
        <EmptyState
          icon={<Layers />}
          title={ta('noDecksTitle')}
          description={ta('noDecksDescription')}
          action={
            <Button type="button" onClick={() => setShowCreate(true)}>
              {ta('noDecksCta')}
            </Button>
          }
        />
      )}

      {!loading && decks.length > 0 && (
        <ul className="m-0 list-none grid gap-3 p-0 sm:grid-cols-2 lg:grid-cols-3">
          {decks.map((deck) => {
            const stats = deckStats[deck.id];
            return (
              <li key={deck.id} className="mc-study-surface rounded-xl border p-4 shadow-sm transition-all duration-200 hover:shadow">
                <Link href={`/${locale}/app/decks/${deck.id}`} className="block hover:opacity-90">
                  <h3 className="font-medium text-(--mc-text-primary)">
                    {deck.title}
                  </h3>
                  {deck.description ? (
                    <p className="mt-1 line-clamp-2 text-sm text-(--mc-text-secondary)">
                      {deck.description}
                    </p>
                  ) : (
                    <p className="mt-1 text-sm text-(--mc-text-secondary)/80">
                      {ta('noDescription')}
                    </p>
                  )}
                </Link>
                {stats != null ? (
                  <p className="mt-2 text-xs text-(--mc-text-muted)">
                    {ta('deckSummaryCardCount', { vars: { count: String(stats.totalCards) } })}
                    {' · '}
                    {ta('deckStudyDueCount', { vars: { due: String(stats.dueCards) } })}
                    {' · '}
                    {ta('deckStudyNewCount', { vars: { newCount: String(stats.newCards) } })}
                  </p>
                ) : (
                  <p className="mt-2 text-xs text-(--mc-text-muted)">{tc('loading')}</p>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  {(stats == null || stats.dueCards > 0 || stats.newCards > 0) && (
                    <Link
                      href={`/${locale}/app/decks/${deck.id}/study`}
                      className={buttonClassName({ variant: 'brand', size: 'sm' })}
                    >
                      {ta('study')}
                    </Link>
                  )}
                  <Link
                    href={`/${locale}/app/decks/${deck.id}`}
                    className="rounded border border-(--mc-border-subtle) px-3 py-1.5 text-sm font-medium text-(--mc-text-secondary) hover:bg-(--mc-bg-card)"
                  >
                    {ta('deckListOpen')}
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
