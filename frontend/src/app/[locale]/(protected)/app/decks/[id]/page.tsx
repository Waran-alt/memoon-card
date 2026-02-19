'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useLocale } from 'i18n';
import apiClient, { getApiErrorMessage, isRequestCancelled } from '@/lib/api';
import type { Deck, Card } from '@/types';
import { useTranslation } from '@/hooks/useTranslation';
import { CardFormFields } from './CardFormFields';

const LAST_STUDIED_KEY = (deckId: string) => `memoon_last_studied_${deckId}`;

function cardMatchesSearch(card: Card, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    card.recto.toLowerCase().includes(q) ||
    card.verso.toLowerCase().includes(q) ||
    (card.comment?.toLowerCase().includes(q) ?? false)
  );
}

type ConfirmType = 'delete' | 'treatAsNew' | 'expandDelay';
type ConfirmDialogState =
  | { type: ConfirmType; cardId: string }
  | { type: 'bulkDelete'; cardIds: string[] }
  | null;

export default function DeckDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { locale } = useLocale();
  const { t: tc } = useTranslation('common', locale);
  const { t: ta } = useTranslation('app', locale);
  const id = typeof params.id === 'string' ? params.id : '';
  const [deck, setDeck] = useState<Deck | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [cards, setCards] = useState<Card[]>([]);
  const [cardsLoading, setCardsLoading] = useState(false);
  const [cardsError, setCardsError] = useState('');
  const [showCreateCard, setShowCreateCard] = useState(false);
  const [createRecto, setCreateRecto] = useState('');
  const [createVerso, setCreateVerso] = useState('');
  const [createComment, setCreateComment] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [revealedCardIds, setRevealedCardIds] = useState<Set<string>>(new Set());
  const [showRevealAllDialog, setShowRevealAllDialog] = useState(false);
  const [editingCard, setEditingCard] = useState<Card | null>(null);
  const [editRecto, setEditRecto] = useState('');
  const [editVerso, setEditVerso] = useState('');
  const [editComment, setEditComment] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState>(null);
  const [selectedCardIds, setSelectedCardIds] = useState<Set<string>>(new Set());
  const [actionLoading, setActionLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [appliedSearchQuery, setAppliedSearchQuery] = useState('');
  const [lastStudiedIds, setLastStudiedIds] = useState<Set<string>>(new Set());
  const [showOnlyReviewed, setShowOnlyReviewed] = useState(false);
  const [reviewedBannerDismissed, setReviewedBannerDismissed] = useState(false);

  useEffect(() => {
    if (!id) return;
    const ac = new AbortController();
    setLoading(true);
    setError('');
    apiClient
      .get<{ success: boolean; data?: Deck }>(`/api/decks/${id}`, { signal: ac.signal })
      .then((res) => {
        if (res.data?.success && res.data.data) {
          setDeck(res.data.data);
        } else {
          setError(ta('deckNotFound'));
        }
      })
      .catch((err) => {
        if (!isRequestCancelled(err)) setError(getApiErrorMessage(err, ta('failedLoadDeck')));
      })
      .finally(() => setLoading(false));
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (!id || !deck) return;
    const ac = new AbortController();
    setCardsLoading(true);
    setCardsError('');
    apiClient
      .get<{ success: boolean; data?: Card[] }>(`/api/decks/${id}/cards`, { signal: ac.signal })
      .then((res) => {
        if (res.data?.success && Array.isArray(res.data.data)) {
          setCards(res.data.data);
          try {
            const raw = typeof window !== 'undefined' ? window.sessionStorage.getItem(LAST_STUDIED_KEY(id)) : null;
            if (raw) {
              const parsed = JSON.parse(raw) as unknown;
              const TEN_MIN_MS = 10 * 60 * 1000;
              let ids: string[] = [];
              let at: number | undefined;
              if (Array.isArray(parsed) && parsed.every((x) => typeof x === 'string')) {
                ids = parsed as string[];
              } else if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { ids?: unknown }).ids)) {
                const obj = parsed as { ids: unknown[]; at?: number };
                if (obj.ids.every((x) => typeof x === 'string')) {
                  ids = obj.ids as string[];
                  at = typeof obj.at === 'number' ? obj.at : undefined;
                }
              }
              if (at !== undefined && Date.now() - at > TEN_MIN_MS) {
                window.sessionStorage.removeItem(LAST_STUDIED_KEY(id));
              } else if (ids.length > 0) {
                const set = new Set(ids);
                setLastStudiedIds(set);
                setRevealedCardIds((prev) => new Set([...prev, ...set]));
                setReviewedBannerDismissed(false);
              }
            }
          } catch {
            // ignore invalid stored data
          }
        }
      })
      .catch((err) => {
        if (!isRequestCancelled(err)) setCardsError(getApiErrorMessage(err, ta('failedLoadCards')));
      })
      .finally(() => setCardsLoading(false));
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, deck]);

  const revealOne = useCallback((cardId: string) => {
    setRevealedCardIds((prev) => new Set(prev).add(cardId));
  }, []);

  const revealAll = useCallback(() => {
    setRevealedCardIds(new Set(cards.map((c) => c.id)));
    setShowRevealAllDialog(false);
  }, [cards]);

  const displayCards = useMemo(() => {
    const q = appliedSearchQuery.trim();
    if (q) {
      return cards.filter((c) => cardMatchesSearch(c, q));
    }
    if (showOnlyReviewed && lastStudiedIds.size > 0) {
      return cards.filter((c) => lastStudiedIds.has(c.id));
    }
    return cards;
  }, [cards, appliedSearchQuery, showOnlyReviewed, lastStudiedIds]);

  const isRevealed = useCallback(
    (cardId: string) => {
      if (appliedSearchQuery.trim()) return true;
      return revealedCardIds.has(cardId);
    },
    [appliedSearchQuery, revealedCardIds]
  );

  function handleApplySearch() {
    setAppliedSearchQuery(searchQuery.trim());
  }

  function handleClearSearch() {
    setSearchQuery('');
    setAppliedSearchQuery('');
  }

  // Debounce applied search by 300 ms so the list doesn't jump on every keystroke
  useEffect(() => {
    const q = searchQuery.trim();
    const t = window.setTimeout(() => setAppliedSearchQuery(q), 300);
    return () => window.clearTimeout(t);
  }, [searchQuery]);

  function dismissReviewedBanner() {
    setReviewedBannerDismissed(true);
    try {
      if (typeof window !== 'undefined') window.sessionStorage.removeItem(LAST_STUDIED_KEY(id));
    } catch {
      // ignore
    }
    setLastStudiedIds(new Set());
  }

  const openEditModal = useCallback((card: Card) => {
    setEditingCard(card);
    setEditRecto(card.recto);
    setEditVerso(card.verso);
    setEditComment(card.comment ?? '');
    setEditError('');
  }, []);

  const manageCardId = searchParams.get('manageCard');
  const hasOpenedManageCardRef = useRef(false);
  useEffect(() => {
    if (!manageCardId || !cards.length || hasOpenedManageCardRef.current) return;
    const card = cards.find((c) => c.id === manageCardId);
    if (card) {
      hasOpenedManageCardRef.current = true;
      openEditModal(card);
      router.replace(`/${locale}/app/decks/${id}`, { scroll: false });
    }
  }, [manageCardId, cards, id, locale, openEditModal, router]);

  const closeEditModal = useCallback(() => {
    setEditingCard(null);
    setEditError('');
  }, []);

  const closeCreateModal = useCallback(() => {
    setShowCreateCard(false);
    setCreateRecto('');
    setCreateVerso('');
    setCreateComment('');
    setCreateError('');
  }, []);

  function handleEditCard(e: React.FormEvent) {
    e.preventDefault();
    if (!editingCard) return;
    setEditError('');
    const recto = editRecto.trim();
    const verso = editVerso.trim();
    if (!recto || !verso) {
      setEditError(ta('frontBackRequired'));
      return;
    }
    setEditSaving(true);
    apiClient
      .put<{ success: boolean; data?: Card }>(`/api/cards/${editingCard.id}`, {
        recto,
        verso,
        comment: editComment.trim() || undefined,
      })
      .then((res) => {
        if (res.data?.success && res.data.data) {
          setCards((prev) =>
            prev.map((c) => (c.id === editingCard.id ? res.data!.data! : c))
          );
          closeEditModal();
        } else {
          setEditError(tc('invalidResponse'));
        }
      })
      .catch((err) => setEditError(getApiErrorMessage(err, ta('failedUpdateCard'))))
      .finally(() => setEditSaving(false));
  }

  function runConfirmAction() {
    if (!confirmDialog) return;
    if (confirmDialog.type === 'bulkDelete' && 'cardIds' in confirmDialog) {
      const ids = confirmDialog.cardIds;
      setActionLoading(true);
      Promise.all(ids.map((cardId) => apiClient.delete(`/api/cards/${cardId}`)))
        .then(() => {
          setCards((prev) => prev.filter((c) => !ids.includes(c.id)));
          setRevealedCardIds((prev) => {
            const next = new Set(prev);
            ids.forEach((id) => next.delete(id));
            return next;
          });
          setSelectedCardIds((prev) => {
            const next = new Set(prev);
            ids.forEach((id) => next.delete(id));
            return next;
          });
        })
        .catch(() => {})
        .finally(() => {
          setActionLoading(false);
          setConfirmDialog(null);
        });
      return;
    }
    const cardId = 'cardId' in confirmDialog ? confirmDialog.cardId : '';
    if (!cardId) return;
    setActionLoading(true);
    const done = () => {
      setActionLoading(false);
      setConfirmDialog(null);
    };
    if (confirmDialog.type === 'delete') {
      apiClient
        .delete(`/api/cards/${cardId}`)
        .then(() => {
          setCards((prev) => prev.filter((c) => c.id !== cardId));
          setRevealedCardIds((prev) => {
            const next = new Set(prev);
            next.delete(cardId);
            return next;
          });
          setSelectedCardIds((prev) => {
            const next = new Set(prev);
            next.delete(cardId);
            return next;
          });
        })
        .catch(() => {})
        .finally(done);
      return;
    }
    if (confirmDialog.type === 'treatAsNew') {
      apiClient
        .post<{ success: boolean; data?: Card }>(`/api/cards/${cardId}/reset-stability`)
        .then((res) => {
          if (res.data?.success && res.data.data) {
            setCards((prev) =>
              prev.map((c) => (c.id === cardId ? res.data!.data! : c))
            );
          }
        })
        .catch(() => {})
        .finally(done);
      return;
    }
    if (confirmDialog.type === 'expandDelay') {
      apiClient
        .post<{ success: boolean; data?: Card }>(`/api/cards/${cardId}/postpone`, {
          revealedForSeconds: 30,
        })
        .then((res) => {
          if (res.data?.success && res.data.data) {
            setCards((prev) =>
              prev.map((c) => (c.id === cardId ? res.data!.data! : c))
            );
          }
        })
        .catch(() => {})
        .finally(done);
    }
  }

  function toggleCardSelection(cardId: string) {
    setSelectedCardIds((prev) => {
      const next = new Set(prev);
      if (next.has(cardId)) next.delete(cardId);
      else next.add(cardId);
      return next;
    });
  }

  function selectAllDisplayed() {
    setSelectedCardIds(new Set(displayCards.map((c) => c.id)));
  }

  function deselectAllDisplayed() {
    setSelectedCardIds(new Set());
  }

  function runBulkReveal() {
    setRevealedCardIds((prev) => new Set([...prev, ...selectedCardIds]));
    setSelectedCardIds(new Set());
  }

  function runBulkTreatAsNew() {
    const ids = Array.from(selectedCardIds);
    if (ids.length === 0) return;
    setActionLoading(true);
    Promise.all(
      ids.map((cardId) =>
        apiClient.post<{ success: boolean; data?: Card }>(`/api/cards/${cardId}/reset-stability`)
      )
    )
      .then((results) => {
        const updates = new Map<string, Card>();
        results.forEach((res, i) => {
          if (res.data?.success && res.data.data && ids[i]) {
            updates.set(ids[i], res.data.data);
          }
        });
        if (updates.size > 0) {
          setCards((prev) =>
            prev.map((c) => updates.get(c.id) ?? c)
          );
        }
        setSelectedCardIds(new Set());
      })
      .catch(() => {})
      .finally(() => setActionLoading(false));
  }

  function handleCreateCard(e: React.FormEvent) {
    e.preventDefault();
    setCreateError('');
    const recto = createRecto.trim();
    const verso = createVerso.trim();
    if (!recto || !verso) {
      setCreateError(ta('frontBackRequired'));
      return;
    }
    setCreating(true);
    apiClient
      .post<{ success: boolean; data?: Card }>(`/api/decks/${id}/cards`, {
        recto,
        verso,
        comment: createComment.trim() || undefined,
      })
      .then((res) => {
        if (res.data?.success && res.data.data) {
          setCards((prev) => [res.data!.data!, ...prev]);
          closeCreateModal();
        } else {
          setCreateError(tc('invalidResponse'));
        }
      })
      .catch((err) => setCreateError(getApiErrorMessage(err, ta('failedCreateCard'))))
      .finally(() => setCreating(false));
  }

  if (!id) {
    router.replace(`/${locale}/app`);
    return null;
  }

  if (loading) {
    return <p className="text-sm text-[var(--mc-text-secondary)]">{tc('loading')}</p>;
  }

  if (error || !deck) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-[var(--mc-accent-danger)]" role="alert">
          {error || ta('deckNotFound')}
        </p>
        <Link
          href={`/${locale}/app`}
          className="text-sm font-medium text-[var(--mc-text-secondary)] underline hover:no-underline"
        >
          {ta('backToDecks')}
        </Link>
      </div>
    );
  }

  return (
    <div className="mc-study-page space-y-6">
      <div>
        <Link
          href={`/${locale}/app`}
          className="text-sm font-medium text-[var(--mc-text-secondary)] hover:text-[var(--mc-text-primary)]"
        >
          ← {ta('backToDecks')}
        </Link>
        <h2 className="mt-2 text-xl font-semibold text-[var(--mc-text-primary)]">
          {deck.title}
        </h2>
        {deck.description && (
          <p className="mt-1 text-sm text-[var(--mc-text-secondary)]">
            {deck.description}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-sm font-medium text-[var(--mc-text-primary)]">{ta('cards')}</h3>
        <div className="flex shrink-0 gap-2">
          <Link
            href={`/${locale}/app/decks/${id}/study`}
            className="rounded border border-[var(--mc-border-subtle)] px-4 py-2 text-sm font-medium text-[var(--mc-text-primary)] hover:bg-[var(--mc-bg-card-back)] transition-colors duration-200"
          >
            {ta('study')}
          </Link>
          <button
            type="button"
            onClick={() => {
              setShowCreateCard(true);
              setCreateError('');
            }}
            className="rounded bg-[var(--mc-accent-success)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity"
          >
            {ta('newCard')}
          </button>
        </div>
      </div>

      {cardsError && (
        <p className="text-sm text-[var(--mc-accent-danger)]" role="alert">
          {cardsError}
        </p>
      )}

      {showCreateCard && (
        <div
          data-testid="create-modal-overlay"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-card-title"
          onClick={closeCreateModal}
        >
          <div
            className="mx-4 max-w-lg rounded-lg border border-[var(--mc-border-subtle)] bg-[var(--mc-bg-surface)] p-4 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="create-card-title" className="text-lg font-semibold text-[var(--mc-text-primary)]">
              {ta('createCard')}
            </h3>
            <p className="mt-1 text-xs text-[var(--mc-text-secondary)]">{ta('createCardHint')}</p>
            <form onSubmit={handleCreateCard} className="mt-3">
              <CardFormFields
                idPrefix="card"
                recto={createRecto}
                verso={createVerso}
                comment={createComment}
                onRectoChange={setCreateRecto}
                onVersoChange={setCreateVerso}
                onCommentChange={setCreateComment}
                t={ta}
              />
              {createError && (
                <p className="mt-3 text-sm text-[var(--mc-accent-danger)]" role="alert">
                  {createError}
                </p>
              )}
              <div className="mt-3 flex gap-2">
                <button
                  type="submit"
                  disabled={creating || !createRecto.trim() || !createVerso.trim()}
                  className="rounded bg-[var(--mc-accent-success)] px-3 py-1.5 text-sm font-medium text-white transition-opacity disabled:opacity-50 hover:opacity-90"
                >
                  {creating ? tc('creating') : tc('create')}
                </button>
                <button
                  type="button"
                  onClick={closeCreateModal}
                  className="rounded border border-[var(--mc-border-subtle)] px-3 py-1.5 text-sm font-medium text-[var(--mc-text-secondary)] hover:bg-[var(--mc-bg-card-back)]"
                >
                  {tc('cancel')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {cardsLoading ? (
        <p className="text-sm text-[var(--mc-text-secondary)]">{ta('loadingCards')}</p>
      ) : !showCreateCard && cards.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[var(--mc-border-subtle)] p-8 text-center">
          <p className="text-sm text-[var(--mc-text-secondary)]">
            {ta('noCardsYet')}
          </p>
          <button
            type="button"
            onClick={() => setShowCreateCard(true)}
            className="mt-3 text-sm font-medium text-[var(--mc-text-secondary)] underline hover:no-underline"
          >
            {ta('newCard')}
          </button>
        </div>
      ) : (
        <>
          {lastStudiedIds.size > 0 && !reviewedBannerDismissed && (
            <div className="mb-4 rounded-lg border border-[var(--mc-accent-primary)]/30 bg-[var(--mc-accent-primary)]/5 p-3">
              <p className="text-sm text-[var(--mc-text-primary)]">
                {ta('manageReviewedBanner', { vars: { count: String(lastStudiedIds.size) } })}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowOnlyReviewed(!showOnlyReviewed)}
                  className="text-sm font-medium text-[var(--mc-accent-primary)] underline hover:no-underline"
                >
                  {showOnlyReviewed ? ta('showAllCards') : ta('showOnlyReviewed')}
                </button>
                <button
                  type="button"
                  onClick={dismissReviewedBanner}
                  className="text-sm font-medium text-[var(--mc-text-secondary)] hover:text-[var(--mc-text-primary)]"
                >
                  {ta('dismiss')}
                </button>
                <Link
                  href={`/${locale}/app/study-sessions`}
                  className="text-sm font-medium text-[var(--mc-accent-primary)] underline hover:no-underline"
                >
                  {ta('viewStudySessions')}
                </Link>
              </div>
            </div>
          )}
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleApplySearch(); } }}
              placeholder={ta('searchCardsPlaceholder')}
              aria-label={ta('searchCardsPlaceholder')}
              className="min-w-[200px] max-w-full flex-1 rounded border border-[var(--mc-border-subtle)] bg-[var(--mc-bg-surface)] px-3 py-2 text-sm text-[var(--mc-text-primary)]"
            />
            <button
              type="button"
              onClick={handleApplySearch}
              className="rounded border border-[var(--mc-border-subtle)] px-3 py-2 text-sm font-medium text-[var(--mc-text-primary)] hover:bg-[var(--mc-bg-card-back)]"
            >
              {ta('applySearch')}
            </button>
            {appliedSearchQuery.trim() && (
              <button
                type="button"
                onClick={handleClearSearch}
                className="text-sm font-medium text-[var(--mc-text-secondary)] hover:text-[var(--mc-text-primary)]"
              >
                {ta('clearSearch')}
              </button>
            )}
            {!appliedSearchQuery.trim() && (
              <>
                <p className="text-xs text-[var(--mc-text-secondary)]">
                  {ta('cardsContentHidden')}
                </p>
                <button
                  type="button"
                  onClick={() => setShowRevealAllDialog(true)}
                  className="text-xs font-medium text-[var(--mc-accent-primary)] underline hover:no-underline"
                >
                  {ta('revealAll')}
                </button>
              </>
            )}
          </div>
          {displayCards.length > 0 && (
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <button type="button" onClick={selectAllDisplayed} className="text-xs font-medium text-[var(--mc-text-secondary)] hover:text-[var(--mc-text-primary)] underline hover:no-underline">
                {ta('selectAll')}
              </button>
              <button type="button" onClick={deselectAllDisplayed} className="text-xs font-medium text-[var(--mc-text-secondary)] hover:text-[var(--mc-text-primary)] underline hover:no-underline">
                {ta('deselectAll')}
              </button>
              {selectedCardIds.size > 0 && (
                <>
                  <span className="text-xs text-[var(--mc-text-secondary)]">({selectedCardIds.size})</span>
                  <button type="button" onClick={runBulkReveal} disabled={actionLoading} className="rounded border border-[var(--mc-border-subtle)] px-2 py-1 text-xs font-medium hover:bg-[var(--mc-bg-card-back)] disabled:opacity-50">
                    {ta('revealSelected')}
                  </button>
                  <button type="button" onClick={runBulkTreatAsNew} disabled={actionLoading} className="rounded border border-[var(--mc-border-subtle)] px-2 py-1 text-xs font-medium hover:bg-[var(--mc-bg-card-back)] disabled:opacity-50">
                    {ta('treatAsNewSelected')}
                  </button>
                  <button type="button" onClick={() => setConfirmDialog({ type: 'bulkDelete', cardIds: Array.from(selectedCardIds) })} disabled={actionLoading} className="rounded border border-[var(--mc-accent-danger)] px-2 py-1 text-xs font-medium text-[var(--mc-accent-danger)] hover:bg-[var(--mc-accent-danger)]/10 disabled:opacity-50">
                    {ta('deleteSelected')}
                  </button>
                </>
              )}
            </div>
          )}
          <ul className="space-y-3">
            {displayCards.length === 0 ? (
              <li className="rounded-lg border border-dashed border-[var(--mc-border-subtle)] p-4 text-center text-sm text-[var(--mc-text-secondary)]">
                <p>{appliedSearchQuery.trim() ? ta('searchNoMatch') : showOnlyReviewed ? ta('noReviewedCards') : ta('noCardsYet')}</p>
                {appliedSearchQuery.trim() ? (
                  <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={handleClearSearch}
                      className="rounded border border-[var(--mc-border-subtle)] px-3 py-1.5 text-sm font-medium text-[var(--mc-text-primary)] hover:bg-[var(--mc-bg-card-back)]"
                    >
                      {ta('clearSearch')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowCreateCard(true)}
                      className="rounded bg-[var(--mc-accent-success)] px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
                    >
                      {ta('newCard')}
                    </button>
                  </div>
                ) : null}
              </li>
            ) : (
              displayCards.map((card) => {
                const revealed = isRevealed(card.id);
                const globalIndex = cards.findIndex((c) => c.id === card.id) + 1;
                return (
                  <li
                    key={card.id}
                    className="mc-study-surface rounded-lg border p-4 shadow-sm"
                  >
                    {!revealed ? (
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-[var(--mc-text-primary)]">
                          {ta('cardLabel', { vars: { n: String(globalIndex) } })}
                        </span>
                        <button
                          type="button"
                          onClick={() => revealOne(card.id)}
                          className="rounded border border-[var(--mc-border-subtle)] px-3 py-1.5 text-sm font-medium text-[var(--mc-text-secondary)] hover:bg-[var(--mc-bg-card-back)]"
                        >
                          {ta('revealCard')}
                        </button>
                      </div>
                    ) : (
                    <>
                      <div className="flex items-start gap-3">
                        <label className="flex shrink-0 items-center gap-2 text-sm text-[var(--mc-text-secondary)]">
                          <input
                            type="checkbox"
                            checked={selectedCardIds.has(card.id)}
                            onChange={() => toggleCardSelection(card.id)}
                            aria-label={ta('cards')}
                            className="rounded border-[var(--mc-border-subtle)]"
                          />
                          <span className="sr-only">{ta('cards')}</span>
                        </label>
                        <div className="space-y-2 min-w-0 flex-1">
                        <p className="text-sm font-medium text-[var(--mc-text-primary)]">
                          {ta('recto')}: {card.recto}
                        </p>
                        <p className="text-sm text-[var(--mc-text-secondary)]">
                          {ta('verso')}: {card.verso}
                        </p>
                        {card.comment && (
                          <p className="text-xs text-[var(--mc-text-muted)]">
                            {ta('commentOptional')}: {card.comment}
                          </p>
                        )}
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => openEditModal(card)}
                          className="rounded border border-[var(--mc-border-subtle)] px-3 py-1.5 text-sm font-medium text-[var(--mc-text-secondary)] hover:bg-[var(--mc-bg-card-back)]"
                        >
                          {ta('editCard')}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setConfirmDialog({ type: 'delete', cardId: card.id })
                          }
                          className="rounded border border-[var(--mc-accent-danger)] px-3 py-1.5 text-sm font-medium text-[var(--mc-accent-danger)] hover:bg-[var(--mc-accent-danger)]/10"
                        >
                          {ta('deleteCard')}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setConfirmDialog({
                              type: 'treatAsNew',
                              cardId: card.id,
                            })
                          }
                          className="rounded border border-[var(--mc-border-subtle)] px-3 py-1.5 text-sm font-medium text-[var(--mc-text-secondary)] hover:bg-[var(--mc-bg-card-back)]"
                        >
                          {ta('treatAsNew')}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setConfirmDialog({
                              type: 'expandDelay',
                              cardId: card.id,
                            })
                          }
                          className="rounded border border-[var(--mc-border-subtle)] px-3 py-1.5 text-sm font-medium text-[var(--mc-text-secondary)] hover:bg-[var(--mc-bg-card-back)]"
                        >
                          {ta('expandDelay')}
                        </button>
                      </div>
                    </>
                  )}
                </li>
              );
            })
            )}
          </ul>
        </>
      )}

      {showRevealAllDialog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          role="dialog"
          aria-modal="true"
          aria-labelledby="reveal-all-title"
          onClick={() => setShowRevealAllDialog(false)}
        >
          <div
            className="mx-4 max-w-md rounded-lg border border-[var(--mc-border-subtle)] bg-[var(--mc-bg-surface)] p-4 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="reveal-all-title" className="text-lg font-semibold text-[var(--mc-text-primary)]">
              {ta('revealAllDialogTitle')}
            </h3>
            <p className="mt-2 text-sm text-[var(--mc-text-secondary)]">
              {ta('revealAllDialogMessage')}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                href={`/${locale}/app/decks/${id}/study`}
                className="rounded bg-[var(--mc-accent-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
              >
                {ta('revealAllStudyFirst')}
              </Link>
              <button
                type="button"
                onClick={revealAll}
                className="rounded border border-[var(--mc-border-subtle)] px-4 py-2 text-sm font-medium text-[var(--mc-text-primary)] hover:bg-[var(--mc-bg-card-back)]"
              >
                {ta('revealAllConfirm')}
              </button>
              <button
                type="button"
                onClick={() => setShowRevealAllDialog(false)}
                className="rounded border border-[var(--mc-border-subtle)] px-4 py-2 text-sm font-medium text-[var(--mc-text-secondary)] hover:bg-[var(--mc-bg-card-back)]"
              >
                {tc('cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      {editingCard && (
        <div
          data-testid="edit-modal-overlay"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-card-title"
          onClick={closeEditModal}
        >
          <div
            className="mx-4 max-w-lg rounded-lg border border-[var(--mc-border-subtle)] bg-[var(--mc-bg-surface)] p-4 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="edit-card-title" className="text-lg font-semibold text-[var(--mc-text-primary)]">
              {ta('editCardTitle')}
            </h3>
            <form onSubmit={handleEditCard} className="mt-3">
              <CardFormFields
                idPrefix="edit"
                recto={editRecto}
                verso={editVerso}
                comment={editComment}
                onRectoChange={setEditRecto}
                onVersoChange={setEditVerso}
                onCommentChange={setEditComment}
                t={ta}
              />
              {editError && (
                <p className="mt-3 text-sm text-[var(--mc-accent-danger)]" role="alert">
                  {editError}
                </p>
              )}
              <div className="mt-3 flex gap-2">
                <button
                  type="submit"
                  disabled={editSaving || !editRecto.trim() || !editVerso.trim()}
                  className="rounded bg-[var(--mc-accent-success)] px-3 py-1.5 text-sm font-medium text-white transition-opacity disabled:opacity-50 hover:opacity-90"
                >
                  {editSaving ? tc('saving') : tc('save')}
                </button>
                <button
                  type="button"
                  onClick={closeEditModal}
                  className="rounded border border-[var(--mc-border-subtle)] px-3 py-1.5 text-sm font-medium text-[var(--mc-text-secondary)] hover:bg-[var(--mc-bg-card-back)]"
                >
                  {tc('cancel')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {confirmDialog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-dialog-title"
          onClick={() => setConfirmDialog(null)}
        >
          <div
            className="mx-4 max-w-md rounded-lg border border-[var(--mc-border-subtle)] bg-[var(--mc-bg-surface)] p-4 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="confirm-dialog-title" className="text-lg font-semibold text-[var(--mc-text-primary)]">
              {confirmDialog.type === 'bulkDelete' && 'cardIds' in confirmDialog
                ? ta('bulkDeleteConfirmTitle', { vars: { count: String(confirmDialog.cardIds.length) } })
                : confirmDialog.type === 'delete' && ta('deleteCardConfirmTitle')}
              {confirmDialog.type === 'treatAsNew' && ta('treatAsNewConfirmTitle')}
              {confirmDialog.type === 'expandDelay' && ta('expandDelayConfirmTitle')}
            </h3>
            <p className="mt-2 text-sm text-[var(--mc-text-secondary)]">
              {confirmDialog.type === 'bulkDelete' && 'cardIds' in confirmDialog
                ? ta('bulkDeleteConfirmMessage')
                : confirmDialog.type === 'delete' && ta('deleteCardConfirmMessage')}
              {confirmDialog.type === 'treatAsNew' && ta('treatAsNewConfirmMessage')}
              {confirmDialog.type === 'expandDelay' && ta('expandDelayConfirmMessage')}
            </p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmDialog(null)}
                disabled={actionLoading}
                className="rounded border border-[var(--mc-border-subtle)] px-4 py-2 text-sm font-medium text-[var(--mc-text-secondary)] hover:bg-[var(--mc-bg-card-back)] disabled:opacity-50"
              >
                {tc('cancel')}
              </button>
              <button
                type="button"
                onClick={runConfirmAction}
                disabled={actionLoading}
                className="rounded px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                style={
                  confirmDialog.type === 'delete' || (confirmDialog.type === 'bulkDelete' && 'cardIds' in confirmDialog)
                    ? { backgroundColor: 'var(--mc-accent-danger)' }
                    : { backgroundColor: 'var(--mc-accent-primary)' }
                }
              >
                {actionLoading
                  ? tc('loading')
                  : confirmDialog.type === 'bulkDelete' && 'cardIds' in confirmDialog
                    ? ta('deleteConfirm')
                    : confirmDialog.type === 'delete'
                      ? ta('deleteConfirm')
                      : confirmDialog.type === 'treatAsNew'
                        ? ta('treatAsNewConfirm')
                        : ta('expandDelayConfirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
