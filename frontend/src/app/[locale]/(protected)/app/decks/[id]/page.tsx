'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useLocale } from 'i18n';
import apiClient, { getApiErrorMessage, isRequestCancelled } from '@/lib/api';
import type { Deck, Card, Category } from '@/types';
import { useTranslation } from '@/hooks/useTranslation';
import { VALIDATION_LIMITS } from '@memoon-card/shared';
import { CardFormFields } from './CardFormFields';

const { DECK_TITLE_MAX, DECK_DESCRIPTION_MAX } = VALIDATION_LIMITS;

const LAST_STUDIED_KEY = (deckId: string) => `memoon_last_studied_${deckId}`;

function formatCardDate(isoDate: string, locale: string): string {
  return new Date(isoDate).toLocaleDateString(locale, { dateStyle: 'short' });
}

/** Next/Last review: show time if same calendar day as now, otherwise show date. */
function formatCardDateOrTime(isoDate: string, locale: string, nowMs: number = Date.now()): string {
  const d = new Date(isoDate);
  const now = new Date(nowMs);
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString(locale, { dateStyle: 'short' });
}

/** Format a numeric card field (stability, difficulty); show — when null/undefined/NaN. */
function formatCardNumber(value: unknown): string {
  const n = Number(value);
  if (value == null || !Number.isFinite(n)) return '—';
  return n.toFixed(2);
}

/**
 * Format event/review timestamp for display. Accepts ms or seconds (if < 1e12).
 * Handles string from API (pg bigint) and invalid values.
 */
function formatEventTime(ts: unknown, locale: string): string {
  const n = Number(ts);
  if (!Number.isFinite(n)) return '—';
  const ms = n < 1e12 ? n * 1000 : n;
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(locale);
}

/** Normalize event_time to milliseconds for timeline positioning. */
function eventTimeToMs(ts: unknown): number | null {
  const n = Number(ts);
  if (!Number.isFinite(n)) return null;
  return n < 1e12 ? n * 1000 : n;
}

const TIMING_GRAPH_EVENT_COLORS: Record<string, string> = {
  card_shown: 'var(--mc-accent-primary)',
  answer_revealed: 'var(--mc-accent-warning)',
  rating_submitted: 'var(--mc-accent-success)',
  card_created: 'var(--mc-text-muted)',
};
function getTimingEventColor(eventType: string): string {
  return TIMING_GRAPH_EVENT_COLORS[eventType] ?? 'var(--mc-accent-primary)';
}

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
  | { type: 'deleteDeck' }
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
  const [createKnowledgeContent, setCreateKnowledgeContent] = useState('');
  const [showReversedZone, setShowReversedZone] = useState(false);
  const [createRectoB, setCreateRectoB] = useState('');
  const [createVersoB, setCreateVersoB] = useState('');
  const [createCommentB, setCreateCommentB] = useState('');
  const [creating, setCreating] = useState(false);
  const [creatingA, setCreatingA] = useState(false);
  const [creatingB, setCreatingB] = useState(false);
  const [createError, setCreateError] = useState('');
  const [createErrorB, setCreateErrorB] = useState('');
  const [userSettings, setUserSettings] = useState<{ knowledge_enabled?: boolean } | null>(null);
  const [revealedCardIds, setRevealedCardIds] = useState<Set<string>>(new Set());
  const [editingCard, setEditingCard] = useState<Card | null>(null);
  const [editRecto, setEditRecto] = useState('');
  const [editVerso, setEditVerso] = useState('');
  const [editComment, setEditComment] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState>(null);
  const [selectedCardIds, setSelectedCardIds] = useState<Set<string>>(new Set());
  const [actionLoading, setActionLoading] = useState(false);
  const [openingReverseCardId, setOpeningReverseCardId] = useState<string | null>(null);
  const [reverseCardError, setReverseCardError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [appliedSearchQuery, setAppliedSearchQuery] = useState('');
  const [lastStudiedIds, setLastStudiedIds] = useState<Set<string>>(new Set());
  const [showOnlyReviewed, setShowOnlyReviewed] = useState(false);
  const [reviewedBannerDismissed, setReviewedBannerDismissed] = useState(false);
  type StudyStats = { dueCount: number; newCount: number; flaggedCount: number; criticalCount: number; highRiskCount: number };
  const [studyStats, setStudyStats] = useState<StudyStats | null>(null);
  const [cardCategoriesModalCard, setCardCategoriesModalCard] = useState<Card | null>(null);
  const [allCategories, setAllCategories] = useState<Category[]>([]);
  const [categoryModalSelectedIds, setCategoryModalSelectedIds] = useState<Set<string>>(new Set());
  const [categoryModalSaving, setCategoryModalSaving] = useState(false);
  const [editModalCategories, setEditModalCategories] = useState<Category[]>([]);
  const [editModalSelectedIds, setEditModalSelectedIds] = useState<Set<string>>(new Set());
  const [showEditDeck, setShowEditDeck] = useState(false);
  const [editDeckTitle, setEditDeckTitle] = useState('');
  const [editDeckDescription, setEditDeckDescription] = useState('');
  const [editDeckShowKnowledge, setEditDeckShowKnowledge] = useState(false);
  const [editDeckCategoryIds, setEditDeckCategoryIds] = useState<Set<string>>(new Set());
  const [editDeckCategoriesList, setEditDeckCategoriesList] = useState<Category[]>([]);
  const [editDeckSaving, setEditDeckSaving] = useState(false);
  const [editDeckError, setEditDeckError] = useState('');
  const [generateReversedSourceCard, setGenerateReversedSourceCard] = useState<Card | null>(null);
  const [generateReversedExistingCard, setGenerateReversedExistingCard] = useState<Card | null>(null);
  const [reverseRectoA, setReverseRectoA] = useState('');
  const [reverseVersoA, setReverseVersoA] = useState('');
  const [reverseCommentA, setReverseCommentA] = useState('');
  const [reverseRectoB, setReverseRectoB] = useState('');
  const [reverseVersoB, setReverseVersoB] = useState('');
  const [reverseCommentB, setReverseCommentB] = useState('');
  const [reverseSubmitSaving, setReverseSubmitSaving] = useState(false);
  const [reverseSubmitError, setReverseSubmitError] = useState('');
  const [reverseSaveASaving, setReverseSaveASaving] = useState(false);
  const [reverseSaveAError, setReverseSaveAError] = useState('');
  const [reverseSaveBSaving, setReverseSaveBSaving] = useState(false);
  const [reverseSaveBError, setReverseSaveBError] = useState('');
  const [cardDetailsCard, setCardDetailsCard] = useState<Card | null>(null);
  const [cardDetailsHistory, setCardDetailsHistory] = useState<Array<{ event_type: string; event_time: number; payload?: Record<string, unknown> }>>([]);
  const [cardDetailsSummary, setCardDetailsSummary] = useState<{
    totalEvents: number;
    byEventType: Array<{ eventType: string; count: number }>;
    byDay: Array<{ day: string; count: number }>;
    bySession: Array<{ sessionId: string; count: number; firstEventAt: number; lastEventAt: number }>;
  } | null>(null);
  const [cardDetailsReviewLogs, setCardDetailsReviewLogs] = useState<Array<{
    id: string;
    rating: number;
    review_time: number;
    review_date: string;
    scheduled_days: number;
    elapsed_days: number;
    stability_before: number | null;
    difficulty_before: number | null;
    retrievability_before: number | null;
    stability_after: number | null;
    difficulty_after: number | null;
  }>>([]);
  const [cardDetailsLoading, setCardDetailsLoading] = useState(false);
  const [cardDetailsError, setCardDetailsError] = useState('');

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
    setStudyStats(null);
    apiClient
      .get<{ success: boolean; data?: StudyStats }>(`/api/decks/${id}/study-stats`, { signal: ac.signal })
      .then((res) => {
        if (res.data?.success && res.data.data) setStudyStats(res.data.data);
      })
      .catch(() => {});
    return () => ac.abort();
  }, [id, deck]);

  useEffect(() => {
    const ac = new AbortController();
    apiClient
      .get<{ success: boolean; data?: { knowledge_enabled?: boolean } }>('/api/user/settings', { signal: ac.signal })
      .then((res) => {
        if (res.data?.success && res.data.data) setUserSettings(res.data.data);
      })
      .catch(() => setUserSettings({ knowledge_enabled: false }));
    return () => ac.abort();
  }, []);

  useEffect(() => {
    if (!cardCategoriesModalCard) return;
    setCategoryModalSelectedIds(new Set(cardCategoriesModalCard.category_ids ?? []));
    apiClient
      .get<{ success: boolean; data?: Category[] }>('/api/users/me/categories')
      .then((res) => {
        if (res.data?.success && Array.isArray(res.data.data)) setAllCategories(res.data.data);
      })
      .catch(() => setAllCategories([]));
  }, [cardCategoriesModalCard]);

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
    setEditModalSelectedIds(new Set(card.category_ids ?? []));
    apiClient.get<{ success: boolean; data?: Category[] }>('/api/users/me/categories').then((res) => {
      if (res.data?.success && Array.isArray(res.data.data)) setEditModalCategories(res.data.data);
      else setEditModalCategories([]);
    }).catch(() => setEditModalCategories([]));
  }, []);

  const manageCardId = searchParams.get('manageCard');
  const hasOpenedManageCardRef = useRef(false);
  const selectAllCheckboxRef = useRef<HTMLInputElement>(null);

  const allDisplayedSelected =
    displayCards.length > 0 && displayCards.every((c) => selectedCardIds.has(c.id));
  const someDisplayedSelected =
    displayCards.length > 0 && displayCards.some((c) => selectedCardIds.has(c.id));
  const selectAllIndeterminate = someDisplayedSelected && !allDisplayedSelected;

  useEffect(() => {
    const el = selectAllCheckboxRef.current;
    if (el) el.indeterminate = selectAllIndeterminate;
  }, [selectAllIndeterminate]);
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
    setEditModalCategories([]);
    setEditModalSelectedIds(new Set());
  }, []);

  const closeCreateModal = useCallback(() => {
    setShowCreateCard(false);
    setCreateRecto('');
    setCreateVerso('');
    setCreateComment('');
    setCreateKnowledgeContent('');
    setShowReversedZone(false);
    setCreateRectoB('');
    setCreateVersoB('');
    setCreateCommentB('');
    setCreateError('');
    setCreateErrorB('');
  }, []);

  function openEditDeckModal() {
    if (deck) {
      setEditDeckTitle(deck.title);
      setEditDeckDescription(deck.description ?? '');
      setEditDeckShowKnowledge(deck.show_knowledge_on_card_creation ?? false);
      setEditDeckCategoryIds(new Set((deck.categories ?? []).map((c) => c.id)));
      setEditDeckError('');
      setShowEditDeck(true);
      apiClient.get<{ success: boolean; data?: Category[] }>('/api/users/me/categories').then((res) => {
        if (res.data?.success && Array.isArray(res.data.data)) setEditDeckCategoriesList(res.data.data);
        else setEditDeckCategoriesList([]);
      }).catch(() => setEditDeckCategoriesList([]));
    }
  }

  const closeEditDeckModal = useCallback(() => {
    setShowEditDeck(false);
    setEditDeckError('');
  }, []);

  function openCardDetailsModal(card: Card) {
    setCardDetailsCard(card);
    setCardDetailsHistory([]);
    setCardDetailsSummary(null);
    setCardDetailsReviewLogs([]);
    setCardDetailsError('');
    setCardDetailsLoading(true);
    Promise.all([
      apiClient.get<{ success: boolean; data?: Card }>(`/api/cards/${card.id}`),
      apiClient.get<{ success: boolean; data?: Array<{ event_type: string; event_time: number; payload?: Record<string, unknown> }> }>(`/api/cards/${card.id}/history?limit=100`),
      apiClient.get<{ success: boolean; data?: { totalEvents: number; byEventType: Array<{ eventType: string; count: number }>; byDay: Array<{ day: string; count: number }>; bySession: Array<{ sessionId: string; count: number; firstEventAt: number; lastEventAt: number }> } }>(`/api/cards/${card.id}/history/summary?days=90&sessionLimit=20`),
      apiClient.get<{ success: boolean; data?: Array<{ id: string; rating: number; review_time: number; review_date: string; scheduled_days: number; elapsed_days: number; stability_before: number | null; difficulty_before: number | null; retrievability_before: number | null; stability_after: number | null; difficulty_after: number | null }> }>(`/api/cards/${card.id}/review-logs?limit=50`),
    ])
      .then(([cardRes, historyRes, summaryRes, logsRes]) => {
        if (cardRes.data?.success && cardRes.data.data) setCardDetailsCard(cardRes.data.data);
        if (historyRes.data?.success && Array.isArray(historyRes.data.data)) setCardDetailsHistory(historyRes.data.data);
        if (summaryRes.data?.success && summaryRes.data.data) setCardDetailsSummary(summaryRes.data.data);
        if (logsRes.data?.success && Array.isArray(logsRes.data.data)) setCardDetailsReviewLogs(logsRes.data.data);
      })
      .catch(() => setCardDetailsError(ta('cardDetailsLoadError')))
      .finally(() => setCardDetailsLoading(false));
  }

  const closeCardDetailsModal = useCallback(() => {
    setCardDetailsCard(null);
    setCardDetailsHistory([]);
    setCardDetailsSummary(null);
    setCardDetailsReviewLogs([]);
    setCardDetailsError('');
  }, []);

  function handleUpdateDeck(e: React.FormEvent) {
    e.preventDefault();
    if (!id || !deck) return;
    const title = editDeckTitle.trim();
    if (!title) {
      setEditDeckError(ta('titleRequired'));
      return;
    }
    setEditDeckSaving(true);
    setEditDeckError('');
    apiClient
      .put<{ success: boolean; data?: Deck }>(`/api/decks/${id}`, {
        title,
        description: editDeckDescription.trim() || null,
        show_knowledge_on_card_creation: editDeckShowKnowledge,
        category_ids: Array.from(editDeckCategoryIds),
      })
      .then(async (res) => {
        if (res.data?.success && res.data.data) {
          closeEditDeckModal();
          const r = await apiClient.get<{ success: boolean; data?: Deck }>(`/api/decks/${id}`);
          if (r.data?.success && r.data.data) setDeck(r.data.data);
        } else {
          setEditDeckError(tc('invalidResponse'));
        }
      })
      .catch((err) => setEditDeckError(getApiErrorMessage(err, ta('failedUpdateDeck'))))
      .finally(() => setEditDeckSaving(false));
  }

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
      .then(async (res) => {
        if (res.data?.success && res.data.data) {
          await apiClient.put(`/api/cards/${editingCard.id}/categories`, {
            categoryIds: Array.from(editModalSelectedIds),
          });
          const cardsRes = await apiClient.get<{ success: boolean; data?: Card[] }>(`/api/decks/${id}/cards`);
          if (cardsRes.data?.success && Array.isArray(cardsRes.data.data)) {
            setCards(cardsRes.data.data);
          } else {
            setCards((prev) => prev.map((c) => (c.id === editingCard.id ? res.data!.data! : c)));
          }
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
    if (confirmDialog.type === 'deleteDeck') {
      setActionLoading(true);
      apiClient
        .delete(`/api/decks/${id}`)
        .then(() => router.push(`/${locale}/app`))
        .catch(() => {})
        .finally(() => {
          setActionLoading(false);
          setConfirmDialog(null);
        });
      return;
    }
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

  function toggleEditModalCategory(categoryId: string) {
    setEditModalSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(categoryId)) next.delete(categoryId);
      else next.add(categoryId);
      return next;
    });
  }

  function toggleCategoryInModal(categoryId: string) {
    setCategoryModalSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(categoryId)) next.delete(categoryId);
      else next.add(categoryId);
      return next;
    });
  }

  async function saveCardCategories() {
    if (!cardCategoriesModalCard || categoryModalSaving) return;
    setCategoryModalSaving(true);
    try {
      await apiClient.put(`/api/cards/${cardCategoriesModalCard.id}/categories`, {
        categoryIds: Array.from(categoryModalSelectedIds),
      });
      const res = await apiClient.get<{ success: boolean; data?: Card[] }>(`/api/decks/${id}/cards`);
      if (res.data?.success && Array.isArray(res.data.data)) setCards(res.data.data);
      setCardCategoriesModalCard(null);
    } finally {
      setCategoryModalSaving(false);
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
    const useBulk = showReversedZone || createKnowledgeContent.trim() !== '';
    if (showReversedZone) {
      const rectoB = createRectoB.trim();
      const versoB = createVersoB.trim();
      if (!rectoB || !versoB) {
        setCreateError(ta('frontBackRequiredBoth') !== 'frontBackRequiredBoth' ? ta('frontBackRequiredBoth') : 'Front and back are required for both cards.');
        return;
      }
    }
    const categoryIds = deck?.categories?.map((c) => c.id) ?? [];
    setCreating(true);
    if (useBulk) {
      const cardsPayload = showReversedZone
        ? [
            { recto, verso, comment: createComment.trim() || null, category_ids: categoryIds },
            {
              recto: createRectoB.trim(),
              verso: createVersoB.trim(),
              comment: createCommentB.trim() || null,
              category_ids: categoryIds,
            },
          ]
        : [{ recto, verso, comment: createComment.trim() || null, category_ids: categoryIds }];
      apiClient
        .post<{ success: boolean; data?: Card | Card[] }>(`/api/decks/${id}/cards/bulk`, {
          knowledge: { content: createKnowledgeContent.trim() || null },
          cards: cardsPayload,
        })
        .then((res) => {
          if (res.data?.success && res.data.data) {
            const data = res.data.data;
            const newCards = Array.isArray(data) ? data : [data];
            setCards((prev) => [...newCards, ...prev]);
            closeCreateModal();
          } else {
            setCreateError(tc('invalidResponse'));
          }
        })
        .catch((err) => setCreateError(getApiErrorMessage(err, ta('failedCreateCard'))))
        .finally(() => setCreating(false));
    } else {
      apiClient
        .post<{ success: boolean; data?: Card }>(`/api/decks/${id}/cards`, {
          recto,
          verso,
          comment: createComment.trim() || undefined,
        })
        .then(async (res) => {
          if (res.data?.success && res.data.data) {
            const newCard = res.data.data;
            if (deck?.categories?.length && newCard.id) {
              try {
                await apiClient.put(`/api/cards/${newCard.id}/categories`, {
                  categoryIds: deck.categories.map((c) => c.id),
                });
              } catch {
                // Card was created; category assignment is best-effort
              }
            }
            setCards((prev) => [res.data!.data!, ...prev]);
            closeCreateModal();
          } else {
            setCreateError(tc('invalidResponse'));
          }
        })
        .catch((err) => setCreateError(getApiErrorMessage(err, ta('failedCreateCard'))))
        .finally(() => setCreating(false));
    }
  }

  function handleAddReversedZone() {
    setCreateRectoB(createVerso);
    setCreateVersoB(createRecto);
    setCreateCommentB(createComment);
    setShowReversedZone(true);
  }

  function handleCreateCardAOnly(e: React.FormEvent) {
    e.preventDefault();
    setCreateError('');
    const recto = createRecto.trim();
    const verso = createVerso.trim();
    if (!recto || !verso) {
      setCreateError(ta('frontBackRequired'));
      return;
    }
    setCreatingA(true);
    apiClient
      .post<{ success: boolean; data?: Card }>(`/api/decks/${id}/cards`, {
        recto,
        verso,
        comment: createComment.trim() || undefined,
      })
      .then(async (res) => {
        if (res.data?.success && res.data.data) {
          const newCard = res.data.data;
          if (deck?.categories?.length && newCard.id) {
            try {
              await apiClient.put(`/api/cards/${newCard.id}/categories`, {
                categoryIds: deck.categories.map((c) => c.id),
              });
            } catch {
              // best-effort
            }
          }
          setCards((prev) => [newCard, ...prev]);
          closeCreateModal();
        } else {
          setCreateError(tc('invalidResponse'));
        }
      })
      .catch((err) => setCreateError(getApiErrorMessage(err, ta('failedCreateCard'))))
      .finally(() => setCreatingA(false));
  }

  function handleCreateCardThenB(e: React.FormEvent) {
    e.preventDefault();
    setCreateError('');
    setCreateErrorB('');
    const recto = createRecto.trim();
    const verso = createVerso.trim();
    const rectoB = createRectoB.trim();
    const versoB = createVersoB.trim();
    if (!recto || !verso) {
      setCreateError(ta('frontBackRequired'));
      return;
    }
    if (!rectoB || !versoB) {
      setCreateErrorB(ta('frontBackRequiredBoth') !== 'frontBackRequiredBoth' ? ta('frontBackRequiredBoth') : 'Front and back are required for both cards.');
      return;
    }
    setCreatingB(true);
    apiClient
      .post<{ success: boolean; data?: Card }>(`/api/decks/${id}/cards`, {
        recto,
        verso,
        comment: createComment.trim() || undefined,
      })
      .then(async (res) => {
        if (!res.data?.success || !res.data.data) {
          setCreateErrorB(tc('invalidResponse'));
          return;
        }
        const cardA = res.data.data;
        if (deck?.categories?.length && cardA.id) {
          try {
            await apiClient.put(`/api/cards/${cardA.id}/categories`, {
              categoryIds: deck.categories.map((c) => c.id),
            });
          } catch {
            // best-effort
          }
        }
        return apiClient
          .post<{ success: boolean; data?: Card }>(`/api/cards/${cardA.id}/reversed`, {
            card_b: { recto: rectoB, verso: versoB, comment: createCommentB.trim() || null },
          })
          .then((r) => {
            if (r.data?.success && r.data.data) {
              const newCards = [cardA, r.data.data];
              setCards((prev) => [...newCards, ...prev]);
              closeCreateModal();
            } else {
              setCreateErrorB(tc('invalidResponse'));
            }
          })
          .catch((err) => setCreateErrorB(getApiErrorMessage(err, ta('failedGenerateReversedCard') !== 'failedGenerateReversedCard' ? ta('failedGenerateReversedCard') : 'Could not create reversed card.')));
      })
      .catch((err) => setCreateErrorB(getApiErrorMessage(err, ta('failedCreateCard'))))
      .finally(() => setCreatingB(false));
  }

  async function handleOpenReverseCard(sourceCard: Card) {
    const reverseCardId = sourceCard.reverse_card_id;
    if (!reverseCardId) return;
    setReverseCardError(null);
    setOpeningReverseCardId(reverseCardId);
    setEditingCard(null);
    try {
      const res = await apiClient.get<{ success: boolean; data?: Card }>(`/api/cards/${reverseCardId}`);
      if (res.data?.success && res.data.data) {
        openReversePairModal(sourceCard, res.data.data);
      } else {
        setReverseCardError(ta('failedLoadReverseCard') !== 'failedLoadReverseCard' ? ta('failedLoadReverseCard') : 'Could not load reverse card.');
      }
    } catch (err) {
      setReverseCardError(getApiErrorMessage(err, ta('failedLoadReverseCard') !== 'failedLoadReverseCard' ? ta('failedLoadReverseCard') : 'Could not load reverse card.'));
    } finally {
      setOpeningReverseCardId(null);
    }
  }

  function openGenerateReversedModal(card: Card) {
    setEditingCard(null);
    setReverseCardError(null);
    setReverseSubmitError('');
    setGenerateReversedExistingCard(null);
    setGenerateReversedSourceCard(card);
    setReverseRectoA(card.recto);
    setReverseVersoA(card.verso);
    setReverseCommentA(card.comment ?? '');
    setReverseRectoB(card.verso);
    setReverseVersoB(card.recto);
    setReverseCommentB(card.comment ?? '');
  }

  function closeGenerateReversedModal() {
    setGenerateReversedSourceCard(null);
    setGenerateReversedExistingCard(null);
  }

  function openReversePairModal(sourceCard: Card, reverseCard: Card) {
    setReverseCardError(null);
    setReverseSubmitError('');
    setReverseSaveAError('');
    setReverseSaveBError('');
    setGenerateReversedExistingCard(reverseCard);
    setGenerateReversedSourceCard(sourceCard);
    setReverseRectoA(sourceCard.recto);
    setReverseVersoA(sourceCard.verso);
    setReverseCommentA(sourceCard.comment ?? '');
    setReverseRectoB(reverseCard.recto);
    setReverseVersoB(reverseCard.verso);
    setReverseCommentB(reverseCard.comment ?? '');
  }

  async function handleSaveReverseCardA(e: React.FormEvent) {
    e.preventDefault();
    const source = generateReversedSourceCard;
    if (!source) return;
    const recto = reverseRectoA.trim();
    const verso = reverseVersoA.trim();
    if (!recto || !verso) {
      setReverseSaveAError(ta('frontBackRequired') !== 'frontBackRequired' ? ta('frontBackRequired') : 'Front and back are required.');
      return;
    }
    setReverseSaveAError('');
    setReverseSaveASaving(true);
    try {
      const res = await apiClient.put<{ success: boolean; data?: Card }>(`/api/cards/${source.id}`, {
        recto,
        verso,
        comment: reverseCommentA.trim() || undefined,
      });
      if (res.data?.success && res.data.data) {
        const updated = res.data.data;
        setCards((prev) => prev.map((c) => (c.id === source.id ? updated : c)));
        setGenerateReversedSourceCard(updated);
        setReverseRectoA(updated.recto);
        setReverseVersoA(updated.verso);
        setReverseCommentA(updated.comment ?? '');
      } else {
        setReverseSaveAError(ta('failedUpdateCard') !== 'failedUpdateCard' ? ta('failedUpdateCard') : 'Could not update card.');
      }
    } catch (err) {
      setReverseSaveAError(getApiErrorMessage(err, ta('failedUpdateCard') !== 'failedUpdateCard' ? ta('failedUpdateCard') : 'Could not update card.'));
    } finally {
      setReverseSaveASaving(false);
    }
  }

  async function handleSaveReverseCardB(e: React.FormEvent) {
    e.preventDefault();
    const existingB = generateReversedExistingCard;
    if (!existingB) return;
    const recto = reverseRectoB.trim();
    const verso = reverseVersoB.trim();
    if (!recto || !verso) {
      setReverseSaveBError(ta('frontBackRequired') !== 'frontBackRequired' ? ta('frontBackRequired') : 'Front and back are required.');
      return;
    }
    setReverseSaveBError('');
    setReverseSaveBSaving(true);
    try {
      const res = await apiClient.put<{ success: boolean; data?: Card }>(`/api/cards/${existingB.id}`, {
        recto,
        verso,
        comment: reverseCommentB.trim() || undefined,
      });
      if (res.data?.success && res.data.data) {
        const updated = res.data.data;
        setCards((prev) => prev.map((c) => (c.id === existingB.id ? updated : c)));
        setGenerateReversedExistingCard(updated);
        setReverseRectoB(updated.recto);
        setReverseVersoB(updated.verso);
        setReverseCommentB(updated.comment ?? '');
      } else {
        setReverseSaveBError(ta('failedUpdateCard') !== 'failedUpdateCard' ? ta('failedUpdateCard') : 'Could not update card.');
      }
    } catch (err) {
      setReverseSaveBError(getApiErrorMessage(err, ta('failedUpdateCard') !== 'failedUpdateCard' ? ta('failedUpdateCard') : 'Could not update card.'));
    } finally {
      setReverseSaveBSaving(false);
    }
  }

  async function handleCreateReversedCard(e: React.FormEvent) {
    e.preventDefault();
    const source = generateReversedSourceCard;
    if (!source) return;
    const recto = reverseRectoB.trim();
    const verso = reverseVersoB.trim();
    if (!recto || !verso) {
      setReverseSubmitError(ta('frontBackRequired') !== 'frontBackRequired' ? ta('frontBackRequired') : 'Front and back are required.');
      return;
    }
    setReverseSubmitError('');
    setReverseSubmitSaving(true);
    try {
      const res = await apiClient.post<{ success: boolean; data?: Card }>(`/api/cards/${source.id}/reversed`, {
        card_b: { recto, verso, comment: reverseCommentB.trim() || null },
      });
      if (res.data?.success && res.data.data) {
        const newCard = res.data.data;
        setCards((prev) => [newCard, ...prev.map((c) => (c.id === source.id ? { ...c, reverse_card_id: newCard.id } : c))]);
        closeGenerateReversedModal();
      } else {
        setReverseSubmitError(ta('failedGenerateReversedCard') !== 'failedGenerateReversedCard' ? ta('failedGenerateReversedCard') : 'Could not create reversed card.');
      }
    } catch (err) {
      setReverseSubmitError(getApiErrorMessage(err, ta('failedGenerateReversedCard') !== 'failedGenerateReversedCard' ? ta('failedGenerateReversedCard') : 'Could not create reversed card.'));
    } finally {
      setReverseSubmitSaving(false);
    }
  }

  if (!id) {
    router.replace(`/${locale}/app`);
    return null;
  }

  if (loading) {
    return <p className="text-sm text-(--mc-text-secondary)">{tc('loading')}</p>;
  }

  if (error || !deck) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-(--mc-accent-danger)" role="alert">
          {error || ta('deckNotFound')}
        </p>
        <Link
          href={`/${locale}/app`}
          className="text-sm font-medium text-(--mc-text-secondary) underline hover:no-underline"
        >
          {ta('backToDecks')}
        </Link>
      </div>
    );
  }

  return (
    <div className="mc-study-page space-y-6">
      <section
        className="rounded-xl border border-(--mc-border-subtle) bg-(--mc-bg-surface) p-5 shadow-sm"
        aria-labelledby="deck-summary-title"
      >
        <h2 id="deck-summary-title" className="text-xl font-semibold tracking-tight text-(--mc-text-primary)">
          {deck.title}
        </h2>
        {deck.description && (
          <p className="mt-1.5 text-sm text-(--mc-text-secondary) leading-relaxed">
            {deck.description}
          </p>
        )}
        <p className="mt-3 text-sm text-(--mc-text-secondary)">
          {cardsLoading ? tc('loading') : ta('deckSummaryCardCount', { vars: { count: String(cards.length) } })}
        </p>
        {studyStats !== null && (
          <p className="mt-1.5 text-sm text-(--mc-text-secondary)">
            {(ta('deckStudyDueCount', { vars: { due: String(studyStats.dueCount) } }))}
            {' · '}
            {(ta('deckStudyNewCount', { vars: { newCount: String(studyStats.newCount) } }))}
            {studyStats.criticalCount > 0 && (
              <> · {(ta('deckStudyCriticalCount', { vars: { count: String(studyStats.criticalCount) } }))}</>
            )}
            {studyStats.highRiskCount > 0 && studyStats.criticalCount !== studyStats.highRiskCount && (
              <> · {(ta('deckStudyHighRiskCount', { vars: { count: String(studyStats.highRiskCount) } }))}</>
            )}
            {studyStats.flaggedCount > 0 && (
              <>
                {' · '}
                {(ta('deckStudyFlaggedCount', { vars: { count: String(studyStats.flaggedCount) } }))}
                {' — '}
                <Link
                  href={`/${locale}/app/flagged-cards${id ? `?deckId=${encodeURIComponent(id)}` : ''}`}
                  className="font-medium text-(--mc-accent-primary) underline hover:no-underline"
                >
                  {ta('deckStudyManageFlagged')}
                </Link>
              </>
            )}
          </p>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href={`/${locale}/app/decks/${id}/study`}
            className="rounded-lg bg-(--mc-accent-primary) px-4 pt-1.5 pb-2 text-sm font-medium text-white shadow-sm transition-colors duration-200 hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--mc-accent-primary) focus-visible:ring-offset-2 focus-visible:ring-offset-(--mc-bg-base)"
          >
            {ta('study')}
          </Link>
          {studyStats !== null && studyStats.criticalCount > 0 && (
            <Link
              href={`/${locale}/app/decks/${id}/study?atRiskOnly=true`}
              className="rounded-lg border border-(--mc-accent-warning) bg-(--mc-accent-warning)/10 px-4 pt-1.5 pb-2 text-sm font-medium text-(--mc-accent-warning) shadow-sm transition-colors duration-200 hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--mc-accent-warning) focus-visible:ring-offset-2 focus-visible:ring-offset-(--mc-bg-base)"
            >
              {ta('studyAtRiskOnly')}
            </Link>
          )}
          <button
            type="button"
            onClick={() => {
              setShowCreateCard(true);
              setCreateError('');
            }}
            className="rounded-lg bg-(--mc-accent-success) px-4 pt-1.5 pb-2 text-sm font-medium text-white shadow-sm transition-colors duration-200 hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--mc-accent-success) focus-visible:ring-offset-2 focus-visible:ring-offset-(--mc-bg-base)"
          >
            {ta('newCard')}
          </button>
          <button
            type="button"
            onClick={openEditDeckModal}
            className="rounded-lg border border-(--mc-border-subtle) bg-(--mc-bg-surface) px-4 pt-1.5 pb-2 text-sm font-medium text-(--mc-text-primary) shadow-sm transition-colors duration-200 hover:bg-(--mc-bg-card-back) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--mc-accent-primary) focus-visible:ring-offset-2 focus-visible:ring-offset-(--mc-bg-base)"
          >
            {ta('editDeck')}
          </button>
          <button
            type="button"
            onClick={() => setConfirmDialog({ type: 'deleteDeck' })}
            className="rounded-lg border border-(--mc-accent-danger) bg-(--mc-bg-surface) px-4 pt-1.5 pb-2 text-sm font-medium text-(--mc-accent-danger) shadow-sm transition-colors duration-200 hover:bg-(--mc-accent-danger)/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--mc-accent-danger) focus-visible:ring-offset-2 focus-visible:ring-offset-(--mc-bg-base)"
          >
            {ta('deleteDeck')}
          </button>
        </div>
      </section>

      <div className="flex items-baseline justify-between gap-4 border-b border-(--mc-border-subtle) pb-2">
        <h3 className="text-sm font-medium uppercase tracking-wider text-(--mc-text-secondary)">{ta('cards')}</h3>
      </div>

      {cardsError && (
        <p className="text-sm text-(--mc-accent-danger)" role="alert">
          {cardsError}
        </p>
      )}

      {showCreateCard && (
        <div
          data-testid="create-modal-overlay"
          className="fixed inset-0 z-50 flex items-center justify-center bg-(--mc-overlay)"
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-card-title"
          onClick={closeCreateModal}
        >
          <div
            className={`mx-4 w-full rounded-xl border border-(--mc-border-subtle) bg-(--mc-bg-surface) p-5 shadow-xl ${showReversedZone ? 'max-w-4xl' : 'max-w-2xl'}`}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="create-card-title" className="text-lg font-semibold text-(--mc-text-primary)">
              {ta('createCard')}
            </h3>
            <p className="mt-1 text-xs text-(--mc-text-secondary)">{ta('createCardHint')}</p>
            {deck?.categories && deck.categories.length > 0 && (
              <p className="mt-1 text-xs text-(--mc-text-secondary)">
                {ta('createCardDeckCategoriesHint', { vars: { names: deck.categories.map((c) => c.name).join(', ') } })}
              </p>
            )}
            {showReversedZone ? (
              <p className="mt-1 text-sm text-(--mc-text-secondary)">
                {ta('generateReversedCardHint') !== 'generateReversedCardHint' ? ta('generateReversedCardHint') : 'Side-by-side for easy comparison. Save or create each card independently.'}
              </p>
            ) : null}
            {showReversedZone ? (
              <div className="mt-4 grid grid-cols-1 gap-6 md:grid-cols-2">
                <div className="rounded-lg border border-(--mc-border-subtle) bg-(--mc-bg-page) p-4">
                  <p className="mb-3 text-xs font-medium text-(--mc-text-secondary)">
                    {ta('cardLabel', { vars: { n: 'A' } })}
                  </p>
                  {userSettings?.knowledge_enabled && deck?.show_knowledge_on_card_creation && (
                    <div className="mb-3">
                      <label htmlFor="create-knowledge" className="mb-1 block text-sm font-medium text-(--mc-text-secondary)">
                        {ta('knowledgeContent') !== 'knowledgeContent' ? ta('knowledgeContent') : 'Knowledge (optional)'}
                      </label>
                      <textarea
                        id="create-knowledge"
                        value={createKnowledgeContent}
                        onChange={(e) => setCreateKnowledgeContent(e.target.value)}
                        placeholder={ta('knowledgePlaceholder') !== 'knowledgePlaceholder' ? ta('knowledgePlaceholder') : 'Optional context or note for this card pair'}
                        rows={2}
                        className="w-full rounded border border-(--mc-border-subtle) bg-(--mc-bg-surface) px-3 py-2 text-sm text-(--mc-text-primary)"
                      />
                    </div>
                  )}
                  <form onSubmit={handleCreateCardAOnly}>
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
                      <p className="mt-3 text-sm text-(--mc-accent-danger)" role="alert">
                        {createError}
                      </p>
                    )}
                    <div className="mt-3">
                      <button
                        type="submit"
                        disabled={creatingA || !createRecto.trim() || !createVerso.trim()}
                        className="rounded bg-(--mc-accent-success) px-3 pt-1 pb-1.5 text-sm font-medium text-white transition-opacity disabled:opacity-50 hover:opacity-90"
                      >
                        {creatingA ? tc('creating') : ta('createCard')}
                      </button>
                    </div>
                  </form>
                </div>
                <div className="rounded-lg border border-(--mc-border-subtle) bg-(--mc-bg-page) p-4">
                  <p className="mb-3 text-xs font-medium text-(--mc-text-secondary)">
                    {ta('cardLabel', { vars: { n: 'B' } })} — {ta('reversedCard') !== 'reversedCard' ? ta('reversedCard') : 'Reversed card'}
                  </p>
                  <form onSubmit={handleCreateCardThenB}>
                    <CardFormFields
                      idPrefix="card-b"
                      recto={createRectoB}
                      verso={createVersoB}
                      comment={createCommentB}
                      onRectoChange={setCreateRectoB}
                      onVersoChange={setCreateVersoB}
                      onCommentChange={setCreateCommentB}
                      t={ta}
                    />
                    {createErrorB && (
                      <p className="mt-3 text-sm text-(--mc-accent-danger)" role="alert">
                        {createErrorB}
                      </p>
                    )}
                    <div className="mt-3">
                      <button
                        type="submit"
                        disabled={creatingB || !createRecto.trim() || !createVerso.trim() || !createRectoB.trim() || !createVersoB.trim()}
                        className="rounded bg-(--mc-accent-primary) px-3 pt-1 pb-1.5 text-sm font-medium text-white opacity-90 hover:opacity-100 disabled:opacity-50"
                      >
                        {creatingB ? tc('creating') : (ta('generateReversedCard') !== 'generateReversedCard' ? ta('generateReversedCard') : 'Create reversed card')}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            ) : (
              <form onSubmit={handleCreateCard} className="mt-3 space-y-4">
                {userSettings?.knowledge_enabled && deck?.show_knowledge_on_card_creation && (
                  <div>
                    <label htmlFor="create-knowledge" className="mb-1 block text-sm font-medium text-(--mc-text-secondary)">
                      {ta('knowledgeContent') !== 'knowledgeContent' ? ta('knowledgeContent') : 'Knowledge (optional)'}
                    </label>
                    <textarea
                      id="create-knowledge"
                      value={createKnowledgeContent}
                      onChange={(e) => setCreateKnowledgeContent(e.target.value)}
                      placeholder={ta('knowledgePlaceholder') !== 'knowledgePlaceholder' ? ta('knowledgePlaceholder') : 'Optional context or note for this card pair'}
                      rows={2}
                      className="w-full rounded border border-(--mc-border-subtle) bg-(--mc-bg-page) px-3 py-2 text-sm text-(--mc-text-primary)"
                    />
                  </div>
                )}
                <div>
                  <span className="text-xs font-medium text-(--mc-text-secondary)">{ta('cardLabel', { vars: { n: 'A' } })}</span>
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
                </div>
                {userSettings?.knowledge_enabled && deck?.show_knowledge_on_card_creation && (
                  <button
                    type="button"
                    onClick={handleAddReversedZone}
                    className="rounded border border-(--mc-accent-primary) bg-transparent px-3 py-1.5 text-sm font-medium text-(--mc-accent-primary) hover:bg-(--mc-accent-primary)/10"
                  >
                    {ta('addReversedCard') !== 'addReversedCard' ? ta('addReversedCard') : 'Add reversed card'}
                  </button>
                )}
                {createError && (
                  <p className="mt-3 text-sm text-(--mc-accent-danger)" role="alert">
                    {createError}
                  </p>
                )}
                <div className="mt-3 flex gap-2">
                  <button
                    type="submit"
                    disabled={creating || !createRecto.trim() || !createVerso.trim()}
                    className="rounded bg-(--mc-accent-success) px-3 pt-1 pb-1.5 text-sm font-medium text-white transition-opacity disabled:opacity-50 hover:opacity-90"
                  >
                    {creating ? tc('creating') : tc('create')}
                  </button>
                  <button
                    type="button"
                    onClick={closeCreateModal}
                    className="rounded border border-(--mc-border-subtle) px-3 pt-1 pb-1.5 text-sm font-medium text-(--mc-text-secondary) hover:bg-(--mc-bg-card-back)"
                  >
                    {tc('cancel')}
                  </button>
                </div>
              </form>
            )}
            {showReversedZone && (
              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  onClick={closeCreateModal}
                  className="rounded border border-(--mc-border-subtle) px-3 pt-1 pb-1.5 text-sm font-medium text-(--mc-text-secondary) hover:bg-(--mc-bg-card-back)"
                >
                  {tc('close') !== 'close' ? tc('close') : 'Close'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {cardsLoading ? (
        <p className="text-sm text-(--mc-text-secondary)">{ta('loadingCards')}</p>
      ) : !showCreateCard && cards.length === 0 ? (
        <div className="rounded-lg border border-dashed border-(--mc-border-subtle) p-8 text-center">
          <p className="text-sm text-(--mc-text-secondary)">
            {ta('noCardsYet')}
          </p>
          <button
            type="button"
            onClick={() => setShowCreateCard(true)}
            className="mt-3 text-sm font-medium text-(--mc-text-secondary) underline hover:no-underline"
          >
            {ta('newCard')}
          </button>
        </div>
      ) : (
        <>
          {reverseCardError && (
            <div className="mb-4 flex items-center justify-between gap-2 rounded-lg border border-(--mc-accent-danger)/50 bg-(--mc-accent-danger)/5 p-3">
              <p className="text-sm text-(--mc-accent-danger)" role="alert">
                {reverseCardError}
              </p>
              <button
                type="button"
                onClick={() => setReverseCardError(null)}
                className="shrink-0 text-sm font-medium text-(--mc-text-secondary) hover:text-(--mc-text-primary)"
                aria-label={tc('dismiss') !== 'dismiss' ? tc('dismiss') : 'Dismiss'}
              >
                ×
              </button>
            </div>
          )}
          {lastStudiedIds.size > 0 && !reviewedBannerDismissed && (
            <div className="mb-4 rounded-lg border border-(--mc-accent-primary)/30 bg-(--mc-accent-primary)/5 p-3">
              <p className="text-sm text-(--mc-text-primary)">
                {ta('manageReviewedBanner', { vars: { count: String(lastStudiedIds.size) } })}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowOnlyReviewed(!showOnlyReviewed)}
                  className="text-sm font-medium text-(--mc-accent-primary) underline hover:no-underline"
                >
                  {showOnlyReviewed ? ta('showAllCards') : ta('showOnlyReviewed')}
                </button>
                <button
                  type="button"
                  onClick={dismissReviewedBanner}
                  className="text-sm font-medium text-(--mc-text-secondary) hover:text-(--mc-text-primary)"
                >
                  {ta('dismiss')}
                </button>
                <Link
                  href={`/${locale}/app/study-sessions`}
                  className="text-sm font-medium text-(--mc-accent-primary) underline hover:no-underline"
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
              className="min-w-[200px] max-w-full flex-1 rounded border border-(--mc-border-subtle) bg-(--mc-bg-surface) px-3 pt-1.5 pb-2 text-sm text-(--mc-text-primary)"
            />
            <button
              type="button"
              onClick={handleApplySearch}
              className="rounded border border-(--mc-border-subtle) px-3 pt-1.5 pb-2 text-sm font-medium text-(--mc-text-secondary) hover:bg-(--mc-bg-card-back) hover:text-(--mc-text-primary)"
            >
              {ta('applySearch')}
            </button>
            {appliedSearchQuery.trim() && (
              <button
                type="button"
                onClick={handleClearSearch}
                className="rounded border border-(--mc-border-subtle) px-3 pt-1.5 pb-2 text-sm font-medium text-(--mc-text-secondary) hover:bg-(--mc-bg-card-back) hover:text-(--mc-text-primary)"
              >
                {ta('clearSearch')}
              </button>
            )}
          </div>
          {displayCards.length > 0 && (() => {
            const selectedDisplayedCount = displayCards.filter((c) => selectedCardIds.has(c.id)).length;
            const cardsSelectedLabel = ta('cardsSelectedCount', { vars: { selected: String(selectedDisplayedCount), total: String(displayCards.length) } });
            return (
            <div className="mb-2 flex min-h-8 flex-wrap items-center gap-2 pl-4">
              <div className="flex items-center gap-2">
                <label className="cursor-pointer">
                  <input
                    ref={selectAllCheckboxRef}
                    type="checkbox"
                    checked={allDisplayedSelected}
                    onChange={() => (allDisplayedSelected ? deselectAllDisplayed() : selectAllDisplayed())}
                    aria-label={cardsSelectedLabel}
                    className="h-5 w-5 rounded border-(--mc-border-subtle)"
                  />
                </label>
                <span className="cursor-default text-sm text-(--mc-text-secondary)" aria-hidden="true">{cardsSelectedLabel}</span>
              </div>
              {selectedCardIds.size > 0 && (
                <div className="ml-auto flex flex-wrap items-center gap-2">
                  <button type="button" onClick={runBulkReveal} disabled={actionLoading} className="rounded border border-(--mc-border-subtle) px-3 pt-1 pb-1.5 text-sm font-medium text-(--mc-text-secondary) hover:bg-(--mc-bg-card-back) hover:text-(--mc-text-primary) disabled:opacity-50">
                    {ta('revealSelected')}
                  </button>
                  <button type="button" onClick={runBulkTreatAsNew} disabled={actionLoading} className="rounded border border-(--mc-border-subtle) px-3 pt-1 pb-1.5 text-sm font-medium text-(--mc-text-secondary) hover:bg-(--mc-bg-card-back) hover:text-(--mc-text-primary) disabled:opacity-50">
                    {ta('treatAsNewSelected')}
                  </button>
                  <button type="button" onClick={() => setConfirmDialog({ type: 'bulkDelete', cardIds: Array.from(selectedCardIds) })} disabled={actionLoading} className="rounded border border-(--mc-accent-danger) px-3 pt-1 pb-1.5 text-sm font-medium text-(--mc-accent-danger) hover:bg-(--mc-accent-danger)/10 disabled:opacity-50">
                    {ta('deleteSelected')}
                  </button>
                </div>
              )}
            </div>
            );
          })()}
          <ul className="space-y-3">
            {displayCards.length === 0 ? (
              <li className="rounded-xl border border-dashed border-(--mc-border-subtle) bg-(--mc-bg-surface)/50 p-6 text-center text-sm text-(--mc-text-secondary)">
                <p>{appliedSearchQuery.trim() ? ta('searchNoMatch') : showOnlyReviewed ? ta('noReviewedCards') : ta('noCardsYet')}</p>
                {appliedSearchQuery.trim() ? (
                  <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={handleClearSearch}
                      className="rounded border border-(--mc-border-subtle) px-3 pt-1 pb-1.5 text-sm font-medium text-(--mc-text-secondary) hover:bg-(--mc-bg-card-back) hover:text-(--mc-text-primary)"
                    >
                      {ta('clearSearch')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowCreateCard(true)}
                      className="rounded bg-(--mc-accent-success) px-3 pt-1 pb-1.5 text-sm font-medium text-white hover:opacity-90"
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
                    className="mc-study-surface rounded-xl border border-(--mc-border-subtle) p-4 shadow-sm transition-colors duration-150 hover:bg-(--mc-bg-card-back)/40"
                  >
                    {!revealed ? (
                      <div className="flex items-center gap-3">
                        <label className="flex shrink-0 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={selectedCardIds.has(card.id)}
                            onChange={() => toggleCardSelection(card.id)}
                            aria-label={ta('cardLabel', { vars: { n: String(globalIndex) } })}
                            className="h-5 w-5 rounded border-(--mc-border-subtle)"
                          />
                          <span className="sr-only">{ta('cards')}</span>
                        </label>
                        <span className="min-w-0 flex-1 font-medium text-(--mc-text-primary)">
                          {ta('cardLabel', { vars: { n: String(globalIndex) } })}
                        </span>
                        <button
                          type="button"
                          onClick={() => revealOne(card.id)}
                          className="shrink-0 rounded border border-(--mc-border-subtle) px-3 pt-1 pb-1.5 text-sm font-medium text-(--mc-text-secondary) hover:bg-(--mc-bg-card-back) hover:text-(--mc-text-primary)"
                        >
                          {ta('revealCard')}
                        </button>
                      </div>
                    ) : (
                    <>
                      <div className="flex items-start gap-3">
                        <label className="flex shrink-0 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={selectedCardIds.has(card.id)}
                            onChange={() => toggleCardSelection(card.id)}
                            aria-label={ta('cards')}
                            className="h-5 w-5 rounded border-(--mc-border-subtle)"
                          />
                          <span className="sr-only">{ta('cards')}</span>
                        </label>
                        <div className="space-y-2 min-w-0 flex-1">
                        <p className="text-sm font-medium text-(--mc-text-primary)">
                          {ta('recto')}: {card.recto}
                        </p>
                        <p className="text-sm text-(--mc-text-secondary)">
                          {ta('verso')}: {card.verso}
                        </p>
                        {card.comment && (
                          <p className="text-xs text-(--mc-text-muted)">
                            {ta('commentOptional')}: {card.comment}
                          </p>
                        )}
                        </div>
                      </div>
                      <p className="mt-2 text-xs text-(--mc-text-secondary)">
                        {!card.last_review
                          ? ta('cardStatusNew')
                          : [
                              ta('cardLastReview', { vars: { date: formatCardDateOrTime(card.last_review, locale) } }),
                              ta('cardNextReview', { vars: { date: formatCardDateOrTime(card.next_review, locale) } }),
                            ].join(' · ')}
                      </p>
                      {(card.categories?.length ?? 0) > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {card.categories!.map((c) => (
                            <span
                              key={c.id}
                              className="rounded bg-(--mc-bg-card-back) px-1.5 py-0.5 text-xs text-(--mc-text-secondary)"
                            >
                              {c.name}
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setCardCategoriesModalCard(card)}
                          className="rounded-lg border border-(--mc-border-subtle) px-3 pt-1 pb-1.5 text-sm font-medium text-(--mc-text-secondary) transition-colors hover:bg-(--mc-bg-card-back) hover:text-(--mc-text-primary)"
                        >
                          {ta('editCardCategories')}
                        </button>
                        <button
                          type="button"
                          onClick={() => openCardDetailsModal(card)}
                          className="rounded-lg border border-(--mc-border-subtle) px-3 pt-1 pb-1.5 text-sm font-medium text-(--mc-text-secondary) transition-colors hover:bg-(--mc-bg-card-back) hover:text-(--mc-text-primary)"
                        >
                          {ta('cardDetailsButton')}
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditModal(card)}
                          className="rounded-lg border border-(--mc-border-subtle) px-3 pt-1 pb-1.5 text-sm font-medium text-(--mc-text-secondary) transition-colors hover:bg-(--mc-bg-card-back) hover:text-(--mc-text-primary)"
                        >
                          {ta('editCard')}
                        </button>
                        {userSettings?.knowledge_enabled && card.reverse_card_id && (
                          <button
                            type="button"
                            onClick={() => handleOpenReverseCard(card)}
                            disabled={openingReverseCardId === card.reverse_card_id}
                            className="rounded-lg border border-(--mc-accent-primary) px-3 pt-1 pb-1.5 text-sm font-medium text-(--mc-accent-primary) transition-colors hover:bg-(--mc-accent-primary)/10 disabled:opacity-50"
                          >
                            {openingReverseCardId === card.reverse_card_id ? (tc('loading') !== 'loading' ? tc('loading') : 'Loading…') : (ta('openReverseCard') !== 'openReverseCard' ? ta('openReverseCard') : 'Open reverse card')}
                          </button>
                        )}
                        {userSettings?.knowledge_enabled && !card.reverse_card_id && (
                          <button
                            type="button"
                            onClick={() => openGenerateReversedModal(card)}
                            className="rounded-lg border border-(--mc-border-subtle) px-3 pt-1 pb-1.5 text-sm font-medium text-(--mc-text-secondary) transition-colors hover:bg-(--mc-bg-card-back) hover:text-(--mc-text-primary)"
                          >
                            {ta('generateReversedCard') !== 'generateReversedCard' ? ta('generateReversedCard') : 'Generate reversed card'}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() =>
                            setConfirmDialog({ type: 'delete', cardId: card.id })
                          }
                          className="rounded-lg border border-(--mc-accent-danger) px-3 pt-1 pb-1.5 text-sm font-medium text-(--mc-accent-danger) transition-colors hover:bg-(--mc-accent-danger)/10"
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
                          disabled={!card.last_review}
                          title={!card.last_review ? ta('cardStatusNew') : undefined}
                          className="rounded-lg border border-(--mc-border-subtle) px-3 pt-1 pb-1.5 text-sm font-medium text-(--mc-text-secondary) transition-colors hover:bg-(--mc-bg-card-back) hover:text-(--mc-text-primary) disabled:opacity-50 disabled:cursor-not-allowed"
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
                          disabled={!card.last_review}
                          title={!card.last_review ? ta('cardStatusNew') : undefined}
                          className="rounded-lg border border-(--mc-border-subtle) px-3 pt-1 pb-1.5 text-sm font-medium text-(--mc-text-secondary) transition-colors hover:bg-(--mc-bg-card-back) hover:text-(--mc-text-primary) disabled:opacity-50 disabled:cursor-not-allowed"
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

      {editingCard && (
        <div
          data-testid="edit-modal-overlay"
          className="fixed inset-0 z-50 flex items-center justify-center bg-(--mc-overlay)"
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-card-title"
          onClick={closeEditModal}
        >
          <div
            className="mx-4 w-full max-w-2xl rounded-xl border border-(--mc-border-subtle) bg-(--mc-bg-surface) p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="edit-card-title" className="text-lg font-semibold text-(--mc-text-primary)">
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
              {editModalCategories.length > 0 && (
                <div className="mt-3">
                  <p className="text-sm font-medium text-(--mc-text-primary) mb-2">{ta('cardCategories')}</p>
                  <ul className="space-y-1.5 max-h-32 overflow-y-auto">
                    {editModalCategories.map((cat) => (
                      <li key={cat.id} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id={`edit-cat-${cat.id}`}
                          checked={editModalSelectedIds.has(cat.id)}
                          onChange={() => toggleEditModalCategory(cat.id)}
                          className="h-4 w-4 rounded border-(--mc-border-subtle)"
                        />
                        <label htmlFor={`edit-cat-${cat.id}`} className="text-sm text-(--mc-text-primary) cursor-pointer">
                          {cat.name}
                        </label>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {editError && (
                <p className="mt-3 text-sm text-(--mc-accent-danger)" role="alert">
                  {editError}
                </p>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="submit"
                  disabled={editSaving || !editRecto.trim() || !editVerso.trim()}
                  className="rounded bg-(--mc-accent-success) px-3 pt-1 pb-1.5 text-sm font-medium text-white transition-opacity disabled:opacity-50 hover:opacity-90"
                >
                  {editSaving ? tc('saving') : tc('save')}
                </button>
                {userSettings?.knowledge_enabled && editingCard && !editingCard.reverse_card_id && (
                  <button
                    type="button"
                    onClick={() => {
                      openGenerateReversedModal(editingCard);
                      closeEditModal();
                    }}
                    className="rounded border border-(--mc-border-subtle) px-3 pt-1 pb-1.5 text-sm font-medium text-(--mc-text-secondary) transition-colors hover:bg-(--mc-bg-card-back) hover:text-(--mc-text-primary)"
                  >
                    {ta('generateReversedCard') !== 'generateReversedCard' ? ta('generateReversedCard') : 'Generate reversed card'}
                  </button>
                )}
                {userSettings?.knowledge_enabled && editingCard && editingCard.reverse_card_id && (
                  <button
                    type="button"
                    onClick={() => handleOpenReverseCard(editingCard)}
                    className="rounded border border-(--mc-accent-primary) px-3 pt-1 pb-1.5 text-sm font-medium text-(--mc-accent-primary) transition-colors hover:bg-(--mc-accent-primary)/10"
                  >
                    {ta('openReverseCard') !== 'openReverseCard' ? ta('openReverseCard') : 'Open reverse card'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={closeEditModal}
                  className="rounded border border-(--mc-border-subtle) px-3 pt-1 pb-1.5 text-sm font-medium text-(--mc-text-secondary) hover:bg-(--mc-bg-card-back)"
                >
                  {tc('cancel')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {generateReversedSourceCard && (
        <div
          data-testid="generate-reversed-modal-overlay"
          className="fixed inset-0 z-50 flex items-center justify-center bg-(--mc-overlay)"
          role="dialog"
          aria-modal="true"
          aria-labelledby="generate-reversed-title"
          onClick={closeGenerateReversedModal}
        >
          <div
            className="mx-4 w-full max-w-4xl rounded-xl border border-(--mc-border-subtle) bg-(--mc-bg-surface) p-5 shadow-xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="generate-reversed-title" className="text-lg font-semibold text-(--mc-text-primary)">
              {generateReversedExistingCard
                ? (ta('reverseCardPairTitle') !== 'reverseCardPairTitle' ? ta('reverseCardPairTitle') : 'Reverse card pair')
                : (ta('generateReversedCard') !== 'generateReversedCard' ? ta('generateReversedCard') : 'Generate reversed card')}
            </h3>
            <p className="mt-1 text-sm text-(--mc-text-secondary)">
              {ta('generateReversedCardHint') !== 'generateReversedCardHint'
                ? ta('generateReversedCardHint')
                : 'Side-by-side for easy comparison. Save or create each card independently.'}
            </p>
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="rounded-lg border border-(--mc-border-subtle) bg-(--mc-bg-page) p-4">
                <p className="text-xs font-medium text-(--mc-text-secondary) mb-3">
                  {ta('cardLabel', { vars: { n: 'A' } })} — {ta('existingCard') !== 'existingCard' ? ta('existingCard') : 'Existing card'}
                </p>
                <form onSubmit={handleSaveReverseCardA}>
                  <CardFormFields
                    idPrefix="reverse-a"
                    recto={reverseRectoA}
                    verso={reverseVersoA}
                    comment={reverseCommentA}
                    onRectoChange={setReverseRectoA}
                    onVersoChange={setReverseVersoA}
                    onCommentChange={setReverseCommentA}
                    t={ta}
                  />
                  {reverseSaveAError && (
                    <p className="mt-3 text-sm text-(--mc-accent-danger)" role="alert">
                      {reverseSaveAError}
                    </p>
                  )}
                  <div className="mt-3">
                    <button
                      type="submit"
                      disabled={reverseSaveASaving || !reverseRectoA.trim() || !reverseVersoA.trim()}
                      className="rounded bg-(--mc-accent-success) px-3 pt-1 pb-1.5 text-sm font-medium text-white transition-opacity disabled:opacity-50 hover:opacity-90"
                    >
                      {reverseSaveASaving ? (tc('saving') !== 'saving' ? tc('saving') : 'Saving…') : tc('save')}
                    </button>
                  </div>
                </form>
              </div>
              <div className="rounded-lg border border-(--mc-border-subtle) bg-(--mc-bg-page) p-4">
                <p className="text-xs font-medium text-(--mc-text-secondary) mb-3">
                  {ta('cardLabel', { vars: { n: 'B' } })} — {ta('reversedCard') !== 'reversedCard' ? ta('reversedCard') : 'Reversed card'}
                </p>
                <form onSubmit={generateReversedExistingCard ? handleSaveReverseCardB : handleCreateReversedCard}>
                  <CardFormFields
                    idPrefix="reverse-b"
                    recto={reverseRectoB}
                    verso={reverseVersoB}
                    comment={reverseCommentB}
                    onRectoChange={setReverseRectoB}
                    onVersoChange={setReverseVersoB}
                    onCommentChange={setReverseCommentB}
                    t={ta}
                  />
                  {generateReversedExistingCard ? (
                    reverseSaveBError && (
                      <p className="mt-3 text-sm text-(--mc-accent-danger)" role="alert">
                        {reverseSaveBError}
                      </p>
                    )
                  ) : (
                    reverseSubmitError && (
                      <p className="mt-3 text-sm text-(--mc-accent-danger)" role="alert">
                        {reverseSubmitError}
                      </p>
                    )
                  )}
                  <div className="mt-3">
                    {generateReversedExistingCard ? (
                      <button
                        type="submit"
                        disabled={reverseSaveBSaving || !reverseRectoB.trim() || !reverseVersoB.trim()}
                        className="rounded bg-(--mc-accent-success) px-3 pt-1 pb-1.5 text-sm font-medium text-white transition-opacity disabled:opacity-50 hover:opacity-90"
                      >
                        {reverseSaveBSaving ? (tc('saving') !== 'saving' ? tc('saving') : 'Saving…') : tc('save')}
                      </button>
                    ) : (
                      <button
                        type="submit"
                        disabled={reverseSubmitSaving || !reverseRectoB.trim() || !reverseVersoB.trim()}
                        className="rounded bg-(--mc-accent-primary) px-3 pt-1 pb-1.5 text-sm font-medium text-white transition-opacity disabled:opacity-50 hover:opacity-90"
                      >
                        {reverseSubmitSaving ? (tc('creating') !== 'creating' ? tc('creating') : 'Creating…') : (ta('generateReversedCard') !== 'generateReversedCard' ? ta('generateReversedCard') : 'Create reversed card')}
                      </button>
                    )}
                  </div>
                </form>
              </div>
            </div>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={closeGenerateReversedModal}
                className="rounded border border-(--mc-border-subtle) px-3 pt-1 pb-1.5 text-sm font-medium text-(--mc-text-secondary) hover:bg-(--mc-bg-card-back)"
              >
                {tc('close') !== 'close' ? tc('close') : 'Close'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showEditDeck && deck && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-(--mc-overlay)"
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-deck-title"
          onClick={closeEditDeckModal}
        >
          <div
            className="mx-4 w-full max-w-lg rounded-xl border border-(--mc-border-subtle) bg-(--mc-bg-surface) p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="edit-deck-title" className="text-lg font-semibold text-(--mc-text-primary)">
              {ta('editDeckTitle')}
            </h3>
            <form onSubmit={handleUpdateDeck} className="mt-3 space-y-3">
              <div>
                <label htmlFor="edit-deck-title-input" className="mb-1 block text-sm font-medium text-(--mc-text-secondary)">
                  {ta('title')}
                </label>
                <input
                  id="edit-deck-title-input"
                  type="text"
                  value={editDeckTitle}
                  onChange={(e) => setEditDeckTitle(e.target.value)}
                  maxLength={DECK_TITLE_MAX}
                  placeholder={ta('titlePlaceholder')}
                  required
                  className="w-full rounded border border-(--mc-border-subtle) bg-(--mc-bg-page) px-3 py-2 text-sm text-(--mc-text-primary)"
                />
                <p className="mt-0.5 text-xs text-(--mc-text-secondary)">
                  {editDeckTitle.length}/{DECK_TITLE_MAX}
                </p>
              </div>
              <div>
                <label htmlFor="edit-deck-description" className="mb-1 block text-sm font-medium text-(--mc-text-secondary)">
                  {ta('description')}
                </label>
                <textarea
                  id="edit-deck-description"
                  value={editDeckDescription}
                  onChange={(e) => setEditDeckDescription(e.target.value)}
                  maxLength={DECK_DESCRIPTION_MAX}
                  placeholder={ta('descriptionPlaceholder')}
                  rows={3}
                  className="w-full rounded border border-(--mc-border-subtle) bg-(--mc-bg-page) px-3 py-2 text-sm text-(--mc-text-primary)"
                />
                <p className="mt-0.5 text-xs text-(--mc-text-secondary)">
                  {editDeckDescription.length}/{DECK_DESCRIPTION_MAX}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  id="edit-deck-show-knowledge"
                  type="checkbox"
                  checked={editDeckShowKnowledge}
                  onChange={(e) => setEditDeckShowKnowledge(e.target.checked)}
                  className="h-4 w-4 rounded border-(--mc-border-subtle)"
                />
                <label htmlFor="edit-deck-show-knowledge" className="text-sm text-(--mc-text-primary)">
                  {ta('deckShowKnowledgeOnCreate') !== 'deckShowKnowledgeOnCreate' ? ta('deckShowKnowledgeOnCreate') : 'Show knowledge and propose reversed card when creating cards'}
                </label>
              </div>
              <div>
                <span className="mb-2 block text-sm font-medium text-(--mc-text-secondary)">
                  {ta('editDeckCategoriesLabel')}
                </span>
                <div className="max-h-40 overflow-y-auto rounded border border-(--mc-border-subtle) bg-(--mc-bg-page) p-2">
                  {editDeckCategoriesList.length === 0 ? (
                    <p className="text-xs text-(--mc-text-secondary)">{ta('editDeckCategoriesEmpty')}</p>
                  ) : (
                    <div className="flex flex-wrap gap-x-4 gap-y-1">
                      {editDeckCategoriesList.map((cat) => (
                        <label key={cat.id} className="flex cursor-pointer items-center gap-2 text-sm text-(--mc-text-primary)">
                          <input
                            type="checkbox"
                            checked={editDeckCategoryIds.has(cat.id)}
                            onChange={() => {
                              setEditDeckCategoryIds((prev) => {
                                const next = new Set(prev);
                                if (next.has(cat.id)) next.delete(cat.id);
                                else next.add(cat.id);
                                return next;
                              });
                            }}
                            className="h-4 w-4 rounded border-(--mc-border-subtle)"
                          />
                          {cat.name}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
                <p className="mt-1 text-xs text-(--mc-text-secondary)">{ta('editDeckCategoriesHint')}</p>
              </div>
              {editDeckError && (
                <p className="text-sm text-(--mc-accent-danger)" role="alert">
                  {editDeckError}
                </p>
              )}
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={editDeckSaving || !editDeckTitle.trim()}
                  className="rounded bg-(--mc-accent-primary) px-3 pt-1 pb-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
                >
                  {editDeckSaving ? tc('saving') : tc('save')}
                </button>
                <button
                  type="button"
                  onClick={closeEditDeckModal}
                  className="rounded border border-(--mc-border-subtle) px-3 pt-1 pb-1.5 text-sm font-medium text-(--mc-text-secondary) hover:bg-(--mc-bg-card-back)"
                >
                  {tc('cancel')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {cardDetailsCard && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-(--mc-overlay) p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="card-details-title"
          onClick={closeCardDetailsModal}
        >
          <div
            className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-xl border border-(--mc-border-subtle) bg-(--mc-bg-surface) shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-center justify-between border-b border-(--mc-border-subtle) px-4 py-3">
              <h3 id="card-details-title" className="text-lg font-semibold text-(--mc-text-primary)">
                {ta('cardDetailsTitle')}
              </h3>
              <button
                type="button"
                onClick={closeCardDetailsModal}
                className="rounded p-1 text-(--mc-text-secondary) hover:bg-(--mc-bg-card-back) hover:text-(--mc-text-primary)"
                aria-label={tc('close')}
              >
                ×
              </button>
            </div>
            <div className="min-h-0 overflow-y-auto p-4 space-y-4">
              {cardDetailsLoading ? (
                <p className="text-sm text-(--mc-text-secondary)">{ta('loadingCards')}</p>
              ) : cardDetailsError ? (
                <p className="text-sm text-(--mc-accent-danger)" role="alert">{cardDetailsError}</p>
              ) : (
                <>
                  <section className="rounded-lg border border-(--mc-border-subtle) bg-(--mc-bg-page) p-3">
                    {cardDetailsCard.short_stability_minutes != null ? (
                      <>
                        <h4 className="text-sm font-medium text-(--mc-text-primary) mb-1">{ta('cardDetailsShortFsrs')}</h4>
                        <p className="text-xs text-(--mc-text-secondary) mb-2">{ta('cardDetailsShortFsrsHint')}</p>
                        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                          <dt className="text-(--mc-text-secondary)">{ta('cardDetailsStabilityMinutes')}</dt>
                          <dd className="text-(--mc-text-primary)">{formatCardNumber(cardDetailsCard.short_stability_minutes) === '—' ? '—' : `${Math.round(Number(cardDetailsCard.short_stability_minutes))} min`}</dd>
                          <dt className="text-(--mc-text-secondary)">{ta('cardDetailsLearningReviewCount')}</dt>
                          <dd className="text-(--mc-text-primary)">{cardDetailsCard.learning_review_count ?? '—'}</dd>
                          <dt className="text-(--mc-text-secondary)">{ta('cardDetailsLastReview')}</dt>
                          <dd className="text-(--mc-text-primary)">{cardDetailsCard.last_review ? formatCardDateOrTime(cardDetailsCard.last_review, locale) : '—'}</dd>
                          <dt className="text-(--mc-text-secondary)">{ta('cardDetailsNextReview')}</dt>
                          <dd className="text-(--mc-text-primary)">{formatCardDateOrTime(cardDetailsCard.next_review, locale)}</dd>
                        </dl>
                      </>
                    ) : (
                      <>
                        <h4 className="text-sm font-medium text-(--mc-text-primary) mb-1">{ta('cardDetailsLongFsrs')}</h4>
                        <p className="text-xs text-(--mc-text-secondary) mb-2">{ta('cardDetailsLongFsrsHint')}</p>
                        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                          <dt className="text-(--mc-text-secondary)">{ta('cardDetailsStability')}</dt>
                          <dd className="text-(--mc-text-primary)">{formatCardNumber(cardDetailsCard.stability) === '—' ? '—' : `${formatCardNumber(cardDetailsCard.stability)} days`}</dd>
                          <dt className="text-(--mc-text-secondary)">{ta('cardDetailsDifficulty')}</dt>
                          <dd className="text-(--mc-text-primary)">{formatCardNumber(cardDetailsCard.difficulty)}</dd>
                          <dt className="text-(--mc-text-secondary)">{ta('cardDetailsLastReview')}</dt>
                          <dd className="text-(--mc-text-primary)">{cardDetailsCard.last_review ? formatCardDateOrTime(cardDetailsCard.last_review, locale) : '—'}</dd>
                          <dt className="text-(--mc-text-secondary)">{ta('cardDetailsNextReview')}</dt>
                          <dd className="text-(--mc-text-primary)">{formatCardDateOrTime(cardDetailsCard.next_review, locale)}</dd>
                        </dl>
                        {cardDetailsCard.stability != null && Number.isFinite(Number(cardDetailsCard.stability)) && Number(cardDetailsCard.stability) > 0 && cardDetailsCard.last_review && (() => {
                          const lastMs = new Date(cardDetailsCard.last_review).getTime();
                          const elapsedDays = (Date.now() - lastMs) / (24 * 60 * 60 * 1000);
                          const s = Number(cardDetailsCard.stability);
                          const r = 1 / Math.pow(1 + (0.4 * elapsedDays) / s, 1);
                          return (
                            <p className="mt-2 text-xs text-(--mc-text-secondary)">
                              {ta('cardDetailsRetrievability')}: {(r * 100).toFixed(1)}%
                            </p>
                          );
                        })()}
                        {cardDetailsCard.graduated_from_learning_at && (
                          <p className="mt-2 text-xs text-(--mc-text-secondary)">
                            {ta('cardDetailsShortFsrsGraduated')}: {formatCardDateOrTime(cardDetailsCard.graduated_from_learning_at, locale)}
                          </p>
                        )}
                      </>
                    )}
                  </section>
                  <section className="rounded-lg border border-(--mc-border-subtle) bg-(--mc-bg-page) p-3">
                    <h4 className="text-sm font-medium text-(--mc-text-primary) mb-2">{ta('cardDetailsPrediction')}</h4>
                    <p className="text-sm text-(--mc-text-secondary)">
                      {ta('cardDetailsPredictionNext')}: {formatCardDateOrTime(cardDetailsCard.next_review, locale)}
                    </p>
                  </section>
                  {cardDetailsSummary && (
                    <>
                      <section className="rounded-lg border border-(--mc-border-subtle) bg-(--mc-bg-page) p-3">
                        <h4 className="text-sm font-medium text-(--mc-text-primary) mb-2">{ta('cardDetailsSessions')}</h4>
                        <p className="text-xs text-(--mc-text-secondary) mb-2">
                          {ta('cardDetailsTotalEvents', { vars: { count: String(cardDetailsSummary.totalEvents) } })} · {cardDetailsSummary.bySession.length} {ta('cardDetailsSessionsCount')}
                        </p>
                        {cardDetailsSummary.bySession.length > 0 ? (
                          <ul className="space-y-1 text-xs">
                            {cardDetailsSummary.bySession.slice(0, 10).map((s) => (
                              <li key={s.sessionId} className="text-(--mc-text-secondary)">
                                {s.count} {ta('cardDetailsEvents')} · {formatEventTime(s.lastEventAt, locale)}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-xs text-(--mc-text-muted)">{ta('cardDetailsNoSessions')}</p>
                        )}
                      </section>
                      {cardDetailsHistory.length > 1 && (() => {
                        const events = [...cardDetailsHistory].reverse();
                        const msList = events.map((e) => eventTimeToMs(e.event_time)).filter((m): m is number => m != null);
                        const minMs = Math.min(...msList);
                        const maxMs = Math.max(...msList);
                        const span = maxMs - minMs || 1;
                        return (
                          <section className="rounded-lg border border-(--mc-border-subtle) bg-(--mc-bg-page) p-3">
                            <h4 className="text-sm font-medium text-(--mc-text-primary) mb-2">{ta('cardDetailsTimingGraph')}</h4>
                            <p className="text-xs text-(--mc-text-secondary) mb-3">{ta('cardDetailsTimingGraphHint')}</p>
                            <div className="relative w-full h-10 rounded bg-(--mc-bg-surface) border border-(--mc-border-subtle)">
                              {events.map((evt, i) => {
                                const ms = eventTimeToMs(evt.event_time);
                                if (ms == null) return null;
                                const leftPct = ((ms - minMs) / span) * 100;
                                const label = evt.payload?.rating != null ? `${evt.event_type} (${ta('cardDetailsRating')} ${evt.payload.rating})` : evt.event_type;
                                const color = getTimingEventColor(evt.event_type);
                                return (
                                  <div
                                    key={i}
                                    className="absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full border border-(--mc-bg-base) shadow-sm hover:z-10 hover:scale-125 transition-transform"
                                    style={{ left: `calc(${leftPct}% - 4px)`, backgroundColor: color }}
                                    title={`${label} · ${formatEventTime(evt.event_time, locale)}`}
                                  />
                                );
                              })}
                            </div>
                            <div className="mt-1 flex justify-between text-[10px] text-(--mc-text-muted)">
                              <span>{formatEventTime(minMs, locale)}</span>
                              <span>{formatEventTime(maxMs, locale)}</span>
                            </div>
                            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-(--mc-text-secondary)">
                              {[...new Set(events.map((e) => e.event_type))].map((type) => (
                                <span key={type} className="inline-flex items-center gap-1">
                                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: getTimingEventColor(type) }} /> {type}
                                </span>
                              ))}
                            </div>
                          </section>
                        );
                      })()}
                      {cardDetailsSummary.byDay.length > 0 && (
                        <section className="rounded-lg border border-(--mc-border-subtle) bg-(--mc-bg-page) p-3">
                          <h4 className="text-sm font-medium text-(--mc-text-primary) mb-2">{ta('cardDetailsEventsByDay')}</h4>
                          <div className="flex items-end gap-0.5 overflow-x-auto pb-2" style={{ minHeight: 80 }}>
                            {[...cardDetailsSummary.byDay].reverse().slice(0, 30).map((row) => {
                              const max = Math.max(1, ...cardDetailsSummary!.byDay.map((d) => d.count));
                              const h = max > 0 ? (row.count / max) * 56 : 0;
                              return (
                                <div key={row.day} className="flex flex-1 flex-col items-center gap-0.5" title={`${row.day}: ${row.count}`}>
                                  <div className="w-full min-w-[6px] max-w-[16px] rounded-t bg-(--mc-accent-primary)/70" style={{ height: `${h}px` }} />
                                  <span className="text-[10px] text-(--mc-text-secondary)">{row.count}</span>
                                </div>
                              );
                            })}
                          </div>
                        </section>
                      )}
                    </>
                  )}
                  {cardDetailsHistory.length > 0 && (
                    <section className="rounded-lg border border-(--mc-border-subtle) bg-(--mc-bg-page) p-3">
                      <h4 className="text-sm font-medium text-(--mc-text-primary) mb-2">{ta('cardDetailsRecentEvents')}</h4>
                      <ul className="max-h-32 overflow-y-auto space-y-1 text-xs text-(--mc-text-secondary)">
                        {cardDetailsHistory.slice(0, 25).map((evt, i) => (
                          <li key={i}>
                            {evt.event_type} · {formatEventTime(evt.event_time, locale)}
                            {evt.payload?.rating != null ? ` · ${ta('cardDetailsRating')} ${evt.payload.rating}` : ''}
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}
                  {cardDetailsReviewLogs.length > 0 && (
                    <section className="rounded-lg border border-(--mc-border-subtle) bg-(--mc-bg-page) p-3">
                      <h4 className="text-sm font-medium text-(--mc-text-primary) mb-2">{ta('cardDetailsReviewLogs')}</h4>
                      {cardDetailsReviewLogs.length >= 1 && (() => {
                        const logs = [...cardDetailsReviewLogs].reverse();
                        const msList = logs.map((log) => eventTimeToMs(log.review_time)).filter((m): m is number => m != null);
                        if (msList.length === 0) return null;
                        const minMs = Math.min(...msList);
                        const maxMs = Math.max(...msList);
                        const span = maxMs - minMs || 1;
                        return (
                          <>
                            <p className="text-xs text-(--mc-text-secondary) mb-3">{ta('cardDetailsReviewTimingGraphHint')}</p>
                            <div className="relative w-full h-10 rounded bg-(--mc-bg-surface) border border-(--mc-border-subtle) mb-2">
                              {logs.map((log, i) => {
                                const ms = eventTimeToMs(log.review_time);
                                if (ms == null) return null;
                                const leftPct = ((ms - minMs) / span) * 100;
                                const tooltip = `${formatEventTime(log.review_time, locale)} · ${ta('cardDetailsReviewRating')} ${log.rating} · ${log.scheduled_days}d`;
                                return (
                                  <div
                                    key={log.id}
                                    className="absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full border border-(--mc-bg-base) shadow-sm hover:z-10 hover:scale-125 transition-transform bg-(--mc-accent-primary)"
                                    style={{ left: `calc(${leftPct}% - 4px)` }}
                                    title={tooltip}
                                  />
                                );
                              })}
                            </div>
                            <div className="mb-3 flex justify-between text-[10px] text-(--mc-text-muted)">
                              <span>{formatEventTime(minMs, locale)}</span>
                              <span>{formatEventTime(maxMs, locale)}</span>
                            </div>
                          </>
                        );
                      })()}
                      <div className="max-h-40 overflow-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-left text-(--mc-text-secondary) border-b border-(--mc-border-subtle)">
                              <th className="py-1 pr-2">{ta('cardDetailsReviewDate')}</th>
                              <th className="py-1 pr-2">{ta('cardDetailsReviewRating')}</th>
                              <th className="py-1 pr-2">{ta('cardDetailsReviewInterval')}</th>
                              <th className="py-1 pr-2">{ta('cardDetailsStability')}</th>
                              <th className="py-1 pr-2">{ta('cardDetailsDifficulty')}</th>
                              <th className="py-1 pr-2">{ta('cardDetailsReviewRetrievability')}</th>
                            </tr>
                          </thead>
                          <tbody className="text-(--mc-text-primary)">
                            {cardDetailsReviewLogs.slice(0, 20).map((log) => (
                              <tr key={log.id} className="border-b border-(--mc-border-subtle)/50">
                                <td className="py-1 pr-2">{formatEventTime(log.review_time, locale)}</td>
                                <td className="py-1 pr-2">{log.rating}</td>
                                <td className="py-1 pr-2">{log.scheduled_days}d</td>
                                <td className="py-1 pr-2">
                                  {log.stability_before != null || log.stability_after != null
                                    ? ta('stabilityBeforeAfter', {
                                        vars: {
                                          before: log.stability_before != null ? log.stability_before.toFixed(2) : '—',
                                          after: log.stability_after != null ? log.stability_after.toFixed(2) : '—',
                                        },
                                      })
                                    : '—'}
                                </td>
                                <td className="py-1 pr-2">
                                  {log.difficulty_before != null || log.difficulty_after != null
                                    ? ta('difficultyBeforeAfter', {
                                        vars: {
                                          before: log.difficulty_before != null ? log.difficulty_before.toFixed(1) : '—',
                                          after: log.difficulty_after != null ? log.difficulty_after.toFixed(1) : '—',
                                        },
                                      })
                                    : '—'}
                                </td>
                                <td className="py-1 pr-2">{log.retrievability_before != null ? `${(log.retrievability_before * 100).toFixed(0)}%` : '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </section>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {cardCategoriesModalCard && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-(--mc-overlay)"
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-categories-title"
          onClick={() => setCardCategoriesModalCard(null)}
        >
          <div
            className="mx-4 max-w-md rounded-xl border border-(--mc-border-subtle) bg-(--mc-bg-surface) p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="edit-categories-title" className="text-lg font-semibold text-(--mc-text-primary)">
              {ta('editCardCategories')}
            </h3>
            <p className="mt-1 text-sm text-(--mc-text-secondary)">
              {ta('cardCategories')}: {allCategories.length === 0 ? ta('noCategoriesYet') : null}
            </p>
            {allCategories.length > 0 ? (
              <ul className="mt-3 max-h-48 overflow-y-auto space-y-2">
                {allCategories.map((cat) => (
                  <li key={cat.id} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id={`cat-${cat.id}`}
                      checked={categoryModalSelectedIds.has(cat.id)}
                      onChange={() => toggleCategoryInModal(cat.id)}
                      className="h-4 w-4 rounded border-(--mc-border-subtle)"
                    />
                    <label htmlFor={`cat-${cat.id}`} className="text-sm text-(--mc-text-primary) cursor-pointer">
                      {cat.name}
                    </label>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-(--mc-text-muted)">
                {ta('createFirstCategory')} <Link href={`/${locale}/app/categories`} className="text-(--mc-accent-primary) underline">{ta('categoriesTitle')}</Link>
              </p>
            )}
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={saveCardCategories}
                disabled={categoryModalSaving}
                className="rounded bg-(--mc-accent-primary) px-3 pt-1 pb-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                {categoryModalSaving ? tc('saving') : ta('saveCategories')}
              </button>
              <button
                type="button"
                onClick={() => setCardCategoriesModalCard(null)}
                className="rounded border border-(--mc-border-subtle) px-3 pt-1 pb-1.5 text-sm font-medium text-(--mc-text-secondary) hover:bg-(--mc-bg-card-back)"
              >
                {tc('cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDialog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-(--mc-overlay)"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-dialog-title"
          onClick={() => setConfirmDialog(null)}
        >
          <div
            className="mx-4 max-w-md rounded-lg border border-(--mc-border-subtle) bg-(--mc-bg-surface) p-4 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="confirm-dialog-title" className="text-lg font-semibold text-(--mc-text-primary)">
              {confirmDialog.type === 'bulkDelete' && 'cardIds' in confirmDialog
                ? ta('bulkDeleteConfirmTitle', { vars: { count: String(confirmDialog.cardIds.length) } })
                : confirmDialog.type === 'delete' && ta('deleteCardConfirmTitle')}
              {confirmDialog.type === 'deleteDeck' && ta('deleteDeckConfirmTitle')}
              {confirmDialog.type === 'treatAsNew' && ta('treatAsNewConfirmTitle')}
              {confirmDialog.type === 'expandDelay' && ta('expandDelayConfirmTitle')}
            </h3>
            <p className="mt-2 text-sm text-(--mc-text-secondary)">
              {confirmDialog.type === 'bulkDelete' && 'cardIds' in confirmDialog
                ? ta('bulkDeleteConfirmMessage')
                : confirmDialog.type === 'delete' && ta('deleteCardConfirmMessage')}
              {confirmDialog.type === 'deleteDeck' && ta('deleteDeckConfirmMessage')}
              {confirmDialog.type === 'treatAsNew' && ta('treatAsNewConfirmMessage')}
              {confirmDialog.type === 'expandDelay' && ta('expandDelayConfirmMessage')}
            </p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmDialog(null)}
                disabled={actionLoading}
                className="rounded border border-(--mc-border-subtle) px-4 pt-1.5 pb-2 text-sm font-medium text-(--mc-text-secondary) hover:bg-(--mc-bg-card-back) disabled:opacity-50"
              >
                {tc('cancel')}
              </button>
              <button
                type="button"
                onClick={runConfirmAction}
                disabled={actionLoading}
                className="rounded px-4 pt-1.5 pb-2 text-sm font-medium text-white disabled:opacity-50"
                style={
                  confirmDialog.type === 'delete' ||
                  confirmDialog.type === 'deleteDeck' ||
                  (confirmDialog.type === 'bulkDelete' && 'cardIds' in confirmDialog)
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
                      : confirmDialog.type === 'deleteDeck'
                        ? ta('deleteDeckConfirm')
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
