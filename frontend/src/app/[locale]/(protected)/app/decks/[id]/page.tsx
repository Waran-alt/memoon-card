'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useLocale } from 'i18n';
import apiClient, { getApiErrorMessage, isRequestCancelled } from '@/lib/api';
import type { Deck, Card, Category } from '@/types';
import { useTranslation } from '@/hooks/useTranslation';
import { useModalFocusTrap } from '@/hooks/useModalFocusTrap';
import { VALIDATION_LIMITS } from '@memoon-card/shared';
import { CardFormFields } from './CardFormFields';
import { DeckCardRow } from './DeckCardRow';
import { recordDeckCardsListClientTiming } from './deckCardsListRefetchMetrics';
import {
  LAST_STUDIED_KEY,
  formatCardDate,
  formatCardDateOrTime,
  cardMatchesSearch,
  previewCardRecto,
} from './deckDetailHelpers';
import { CategoryBadgePill } from './CategoryBadgePill';
import { IconChartBar } from './DeckUiIcons';
import { CardLinkCombobox } from './CardLinkCombobox';
import { EditCardCategoryPicker } from './EditCardCategoryPicker';
import { CardFollowUpModal } from './CardFollowUpModal';
import type { CardReviewLinkedSeries, CardReviewLogPoint } from './CardReviewHistoryChart';
import { DeckStatsModal } from './DeckStatsModal';
import { CARD_REVIEW_LOGS_FETCH_LIMIT } from './cardStatsConstants';
import { useCreateCardForm } from './useCreateCardForm';
import { isCardFieldEmpty } from '@/lib/cardHtml';
import { CardHtmlContent } from '@/components/CardHtmlContent';

const { DECK_TITLE_MAX, DECK_DESCRIPTION_MAX } = VALIDATION_LIMITS;

/** Above this count, the deck card list is paginated to limit DOM size. */
const CARD_LIST_PAGE_SIZE = 50;

type ConfirmType = 'delete' | 'treatAsNew';
type ConfirmDialogState =
  | { type: ConfirmType; cardId: string }
  | { type: 'bulkDelete'; cardIds: string[] }
  | { type: 'deleteDeck' }
  | { type: 'unlink'; cardId: string; otherCardId: string }
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
  const cardsRef = useRef<Card[]>([]);
  cardsRef.current = cards;
  const [cardsLoading, setCardsLoading] = useState(false);
  const [cardsError, setCardsError] = useState('');
  const {
    showCreateCard,
    createRecto,
    createVerso,
    createComment,
    createKnowledgeContent,
    showReversedZone,
    createRectoB,
    createVersoB,
    createCommentB,
    creating,
    creatingA,
    creatingB,
    createError,
    createErrorB,
    openCreateModal,
    closeCreateModal,
    addReversedZone,
    setCreateRecto,
    setCreateVerso,
    setCreateComment,
    setCreateKnowledgeContent,
    setCreateRectoB,
    setCreateVersoB,
    setCreateCommentB,
    setCreateError,
    setCreateErrorB,
    setCreating,
    setCreatingA,
    setCreatingB,
  } = useCreateCardForm();
  const [userSettings, setUserSettings] = useState<{ knowledge_enabled?: boolean } | null>(null);
  const [revealedCardIds, setRevealedCardIds] = useState<Set<string>>(new Set());
  const [editingCard, setEditingCard] = useState<Card | null>(null);
  const [editRecto, setEditRecto] = useState('');
  const [editVerso, setEditVerso] = useState('');
  const [editComment, setEditComment] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');
  const [editSaveSuccessMessage, setEditSaveSuccessMessage] = useState('');
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState>(null);
  const [selectedCardIds, setSelectedCardIds] = useState<Set<string>>(new Set());
  const [actionLoading, setActionLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [appliedSearchQuery, setAppliedSearchQuery] = useState('');
  const [cardListPage, setCardListPage] = useState(0);
  const [lastStudiedIds, setLastStudiedIds] = useState<Set<string>>(new Set());
  const [showOnlyReviewed, setShowOnlyReviewed] = useState(false);
  const [reviewedBannerDismissed, setReviewedBannerDismissed] = useState(false);
  type StudyStats = { dueCount: number; newCount: number; flaggedCount: number; criticalCount: number; highRiskCount: number };
  const [studyStats, setStudyStats] = useState<StudyStats | null>(null);
  const [editModalCategories, setEditModalCategories] = useState<Category[]>([]);
  const [editModalSelectedIds, setEditModalSelectedIds] = useState<Set<string>>(new Set());
  const [editModalShowLinkedCards, setEditModalShowLinkedCards] = useState(false);
  const [showEditDeck, setShowEditDeck] = useState(false);
  const [showDeckStatsModal, setShowDeckStatsModal] = useState(false);
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
  const [generateReversedCopyCategories, setGenerateReversedCopyCategories] = useState(true);
  const [generateReversedCopyKnowledge, setGenerateReversedCopyKnowledge] = useState(true);
  const [linkedCardCache, setLinkedCardCache] = useState<Record<string, Card>>({});
  const linkedCardCacheRef = useRef(linkedCardCache);
  linkedCardCacheRef.current = linkedCardCache;
  const [editLinkSelectedId, setEditLinkSelectedId] = useState('');
  const [editLinkSaving, setEditLinkSaving] = useState(false);
  const [editLinkError, setEditLinkError] = useState('');
  const [cardDetailsCard, setCardDetailsCard] = useState<Card | null>(null);
  const [cardDetailsReviewLogs, setCardDetailsReviewLogs] = useState<CardReviewLogPoint[]>([]);
  const [cardDetailsLinkedSeries, setCardDetailsLinkedSeries] = useState<CardReviewLinkedSeries[]>(
    []
  );
  const [cardDetailsCompareLinked, setCardDetailsCompareLinked] = useState(false);
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
    if (!id || !deck) return;
    const ac = new AbortController();
    setCardsLoading(true);
    setCardsError('');
    const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
    apiClient
      .get<{ success: boolean; data?: Card[] }>(`/api/decks/${id}/cards`, { signal: ac.signal })
      .then((res) => {
        const elapsed = typeof performance !== 'undefined' ? performance.now() - t0 : 0;
        if (res.data?.success && Array.isArray(res.data.data)) {
          recordDeckCardsListClientTiming('initial_load', elapsed, true);
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
        if (!isRequestCancelled(err)) {
          const elapsed = typeof performance !== 'undefined' ? performance.now() - t0 : 0;
          recordDeckCardsListClientTiming('initial_load', elapsed, false);
          setCardsError(getApiErrorMessage(err, ta('failedLoadCards')));
        }
      })
      .finally(() => setCardsLoading(false));
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, deck]);

  const revealOne = useCallback((cardId: string) => {
    setRevealedCardIds((prev) => new Set(prev).add(cardId));
  }, []);

  const collapseCardInList = useCallback((cardId: string) => {
    setRevealedCardIds((prev) => {
      const next = new Set(prev);
      next.delete(cardId);
      return next;
    });
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

  const listViewResetKey = useMemo(
    () =>
      `${appliedSearchQuery.trim()}|${showOnlyReviewed}|${[...lastStudiedIds].sort().join(',')}`,
    [appliedSearchQuery, showOnlyReviewed, lastStudiedIds]
  );

  useEffect(() => {
    setCardListPage(0);
  }, [listViewResetKey]);

  const cardListTotalPages = Math.max(1, Math.ceil(displayCards.length / CARD_LIST_PAGE_SIZE));

  useEffect(() => {
    setCardListPage((p) => Math.min(p, cardListTotalPages - 1));
  }, [cardListTotalPages]);

  const needsCardListPagination = displayCards.length > CARD_LIST_PAGE_SIZE;
  const cardListEffectivePage = Math.min(cardListPage, cardListTotalPages - 1);

  const visibleDisplayCards = useMemo(() => {
    if (!needsCardListPagination) return displayCards;
    const start = cardListEffectivePage * CARD_LIST_PAGE_SIZE;
    return displayCards.slice(start, start + CARD_LIST_PAGE_SIZE);
  }, [displayCards, needsCardListPagination, cardListEffectivePage]);

  const cardGlobalIndexById = useMemo(() => {
    const m = new Map<string, number>();
    cards.forEach((c, i) => m.set(c.id, i + 1));
    return m;
  }, [cards]);

  /** Reload deck cards from API after mutations (strategy A). Returns the fresh list, or null on failure. */
  const refetchDeckCardsList = useCallback(async (reason: string): Promise<Card[] | null> => {
    if (!id) return null;
    const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
    try {
      const res = await apiClient.get<{ success: boolean; data?: Card[] }>(`/api/decks/${id}/cards`);
      const elapsed = typeof performance !== 'undefined' ? performance.now() - t0 : 0;
      const ok = res.data?.success === true && Array.isArray(res.data.data);
      recordDeckCardsListClientTiming(reason, elapsed, ok);
      if (ok) {
        const list = res.data!.data!;
        setCards(list);
        return list;
      }
      return null;
    } catch (err) {
      const elapsed = typeof performance !== 'undefined' ? performance.now() - t0 : 0;
      if (!isRequestCancelled(err)) {
        recordDeckCardsListClientTiming(reason, elapsed, false);
      }
      return null;
    }
  }, [id]);

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
    setEditSaveSuccessMessage('');
    setEditLinkSelectedId('');
    setEditLinkError('');
    // Align with Tailwind lg: when form + linked column are side-by-side, show linked cards by default.
    const wide =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(min-width: 1024px)').matches;
    setEditModalShowLinkedCards(wide);
    setEditModalSelectedIds(new Set(card.category_ids ?? []));
    apiClient.get<{ success: boolean; data?: Category[] }>('/api/users/me/categories').then((res) => {
      if (res.data?.success && Array.isArray(res.data.data)) setEditModalCategories(res.data.data);
      else setEditModalCategories([]);
    }).catch(() => setEditModalCategories([]));
  }, []);

  const manageCardId = searchParams.get('manageCard');
  const hasOpenedManageCardRef = useRef(false);
  const selectAllCheckboxRef = useRef<HTMLInputElement>(null);
  const editFormBaselineRef = useRef<{
    recto: string;
    verso: string;
    comment: string;
    categoryIdsKey: string;
  } | null>(null);
  const createModalPanelRef = useRef<HTMLDivElement>(null);
  const editModalShellRef = useRef<HTMLDivElement>(null);
  const generateReversedModalPanelRef = useRef<HTMLDivElement>(null);
  const editDeckModalPanelRef = useRef<HTMLDivElement>(null);
  const cardDetailsModalPanelRef = useRef<HTMLDivElement>(null);
  const confirmDialogPanelRef = useRef<HTMLDivElement>(null);

  useModalFocusTrap(showCreateCard, createModalPanelRef);
  useModalFocusTrap(!!editingCard, editModalShellRef);
  useModalFocusTrap(!!generateReversedSourceCard, generateReversedModalPanelRef);
  useModalFocusTrap(showEditDeck && !!deck, editDeckModalPanelRef);
  useModalFocusTrap(!!cardDetailsCard, cardDetailsModalPanelRef);
  useModalFocusTrap(!!confirmDialog, confirmDialogPanelRef);

  const allDisplayedSelected =
    displayCards.length > 0 && displayCards.every((c) => selectedCardIds.has(c.id));
  const someDisplayedSelected =
    displayCards.length > 0 && displayCards.some((c) => selectedCardIds.has(c.id));
  const selectAllIndeterminate = someDisplayedSelected && !allDisplayedSelected;

  const editModalLinkedCardIds = useMemo(() => {
    if (!editingCard) return [];
    return (
      cards.find((c) => c.id === editingCard.id)?.linked_card_ids ??
      editingCard.linked_card_ids ??
      []
    );
  }, [editingCard, cards]);

  const editLinkCandidates = useMemo(() => {
    if (!editingCard) return [];
    const linked = editModalLinkedCardIds;
    return cards.filter((c) => c.id !== editingCard.id && !linked.includes(c.id));
  }, [cards, editingCard, editModalLinkedCardIds]);

  useEffect(() => {
    if (!editingCard || !editModalShowLinkedCards) return;
    const ids =
      cardsRef.current.find((c) => c.id === editingCard.id)?.linked_card_ids ??
      editingCard.linked_card_ids ??
      [];
    for (const nid of ids) {
      if (cardsRef.current.some((c) => c.id === nid)) continue;
      if (linkedCardCacheRef.current[nid]) continue;
      void apiClient.get<{ success: boolean; data?: Card }>(`/api/cards/${nid}`).then((res) => {
        if (res.data?.success && res.data.data) {
          const data = res.data.data;
          setLinkedCardCache((p) => (p[data.id] ? p : { ...p, [data.id]: data }));
        }
      });
    }
  }, [editingCard, editModalShowLinkedCards]);

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
    setEditSaveSuccessMessage('');
    setEditLinkSelectedId('');
    setEditLinkError('');
    setEditLinkSaving(false);
    setEditModalCategories([]);
    setEditModalSelectedIds(new Set());
    setEditModalShowLinkedCards(false);
  }, []);

  useEffect(() => {
    if (!editingCard) {
      editFormBaselineRef.current = null;
      return;
    }
    editFormBaselineRef.current = {
      recto: editingCard.recto,
      verso: editingCard.verso,
      comment: editingCard.comment ?? '',
      categoryIdsKey: JSON.stringify([...(editingCard.category_ids ?? [])].sort()),
    };
  }, [editingCard]);

  const isEditFormDirty = useCallback(() => {
    const b = editFormBaselineRef.current;
    if (!b || !editingCard) return false;
    const key = JSON.stringify([...editModalSelectedIds].sort());
    return (
      editRecto !== b.recto ||
      editVerso !== b.verso ||
      editComment !== b.comment ||
      key !== b.categoryIdsKey
    );
  }, [editingCard, editRecto, editVerso, editComment, editModalSelectedIds]);

  useEffect(() => {
    if (!editSaveSuccessMessage) return;
    if (isEditFormDirty()) setEditSaveSuccessMessage('');
  }, [editRecto, editVerso, editComment, editModalSelectedIds, isEditFormDirty, editSaveSuccessMessage]);

  const requestCloseEditModal = useCallback(() => {
    if (isEditFormDirty()) {
      const msg =
        ta('discardEditChanges') !== 'discardEditChanges'
          ? ta('discardEditChanges')
          : 'Discard unsaved changes?';
      if (typeof window !== 'undefined' && !window.confirm(msg)) return;
    }
    closeEditModal();
  }, [closeEditModal, isEditFormDirty, ta]);

  const confirmDiscardEditIfDirty = useCallback(() => {
    if (!isEditFormDirty()) return true;
    const msg =
      ta('discardEditChanges') !== 'discardEditChanges'
        ? ta('discardEditChanges')
        : 'Discard unsaved changes?';
    if (typeof window === 'undefined') return true;
    return window.confirm(msg);
  }, [isEditFormDirty, ta]);

  const switchEditToLinkedCard = useCallback(
    (neighbor: Card) => {
      if (!confirmDiscardEditIfDirty()) return;
      const fresh = cards.find((c) => c.id === neighbor.id) ?? neighbor;
      openEditModal(fresh);
    },
    [cards, confirmDiscardEditIfDirty, openEditModal]
  );

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

  const openCardDetailsModal = useCallback((card: Card) => {
    setCardDetailsCard(card);
    setCardDetailsReviewLogs([]);
    setCardDetailsLinkedSeries([]);
    setCardDetailsCompareLinked(false);
    setCardDetailsError('');
    setCardDetailsLoading(true);
    const linkedIds = card.linked_card_ids ?? [];
    void (async () => {
      try {
        const [cardRes, logsRes] = await Promise.all([
          apiClient.get<{ success: boolean; data?: Card }>(`/api/cards/${card.id}`),
          apiClient.get<{ success: boolean; data?: CardReviewLogPoint[] }>(
            `/api/cards/${card.id}/review-logs?limit=${CARD_REVIEW_LOGS_FETCH_LIMIT}`
          ),
        ]);
        if (cardRes.data?.success && cardRes.data.data) setCardDetailsCard(cardRes.data.data);
        if (logsRes.data?.success && Array.isArray(logsRes.data.data)) {
          setCardDetailsReviewLogs(logsRes.data.data);
        }
        const linked: CardReviewLinkedSeries[] = [];
        for (const lid of linkedIds) {
          const [cR, lR] = await Promise.all([
            apiClient.get<{ success: boolean; data?: Card }>(`/api/cards/${lid}`),
            apiClient.get<{ success: boolean; data?: CardReviewLogPoint[] }>(
              `/api/cards/${lid}/review-logs?limit=${CARD_REVIEW_LOGS_FETCH_LIMIT}`
            ),
          ]);
          const recto = cR.data?.data?.recto ?? '';
          linked.push({
            cardId: lid,
            label: previewCardRecto(recto, 48),
            logs: lR.data?.success && Array.isArray(lR.data.data) ? lR.data.data : [],
          });
        }
        setCardDetailsLinkedSeries(linked);
      } catch {
        setCardDetailsError(ta('cardDetailsLoadError'));
      } finally {
        setCardDetailsLoading(false);
      }
    })();
  }, [ta]);

  const closeCardDetailsModal = useCallback(() => {
    setCardDetailsCard(null);
    setCardDetailsReviewLogs([]);
    setCardDetailsLinkedSeries([]);
    setCardDetailsCompareLinked(false);
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
    setEditSaveSuccessMessage('');
    if (isCardFieldEmpty(editRecto) || isCardFieldEmpty(editVerso)) {
      setEditError(ta('frontBackRequired'));
      return;
    }
    setEditSaving(true);
    apiClient
      .put<{ success: boolean; data?: Card }>(`/api/cards/${editingCard.id}`, {
        recto: editRecto,
        verso: editVerso,
        comment: isCardFieldEmpty(editComment) ? undefined : editComment,
      })
      .then(async (res) => {
        if (res.data?.success && res.data.data) {
          const updated = res.data.data;
          await apiClient.put(`/api/cards/${editingCard.id}/categories`, {
            categoryIds: Array.from(editModalSelectedIds),
          });
          const refetchedList = await refetchDeckCardsList('edit_card');
          if (refetchedList === null) setCardsError(ta('failedLoadCards'));
          const catIds = Array.from(editModalSelectedIds);
          const merged: Card = {
            ...updated,
            category_ids: catIds,
            categories: editModalCategories.filter((c) => editModalSelectedIds.has(c.id)),
          };
          setEditingCard(merged);
          setEditRecto(updated.recto);
          setEditVerso(updated.verso);
          setEditComment(updated.comment ?? '');
          setEditSaveSuccessMessage(
            ta('editCardSaved') !== 'editCardSaved' ? ta('editCardSaved') : 'Card saved.'
          );
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
        .then(async () => {
          const refetchedList = await refetchDeckCardsList('bulk_delete');
          if (refetchedList === null) setCardsError(ta('failedLoadCards'));
          setRevealedCardIds((prev) => {
            const next = new Set(prev);
            ids.forEach((delId) => next.delete(delId));
            return next;
          });
          setSelectedCardIds((prev) => {
            const next = new Set(prev);
            ids.forEach((delId) => next.delete(delId));
            return next;
          });
          if (editingCard && ids.includes(editingCard.id)) closeEditModal();
        })
        .catch(() => {})
        .finally(() => {
          setActionLoading(false);
          setConfirmDialog(null);
        });
      return;
    }
    if (confirmDialog.type === 'unlink') {
      const { cardId, otherCardId } = confirmDialog;
      setActionLoading(true);
      apiClient
        .delete<{ success: boolean; data?: Card }>(`/api/cards/${cardId}/links/${otherCardId}`)
        .then(async (res) => {
          if (res.data?.success && res.data.data) {
            const refetchedList = await refetchDeckCardsList('unlink');
            if (refetchedList === null) setCardsError(ta('failedLoadCards'));
          }
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
        .then(async () => {
          const refetchedList = await refetchDeckCardsList('delete_card');
          if (refetchedList === null) setCardsError(ta('failedLoadCards'));
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
          closeEditModal();
        })
        .catch(() => {})
        .finally(done);
      return;
    }
    if (confirmDialog.type === 'treatAsNew') {
      apiClient
        .post<{ success: boolean; data?: Card }>(`/api/cards/${cardId}/reset-stability`)
        .then(async (res) => {
          if (res.data?.success && res.data.data) {
            const refetchedList = await refetchDeckCardsList('treat_as_new');
            if (refetchedList === null) setCardsError(ta('failedLoadCards'));
          }
        })
        .catch(() => {})
        .finally(done);
      return;
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

  const toggleCardSelection = useCallback((cardId: string) => {
    setSelectedCardIds((prev) => {
      const next = new Set(prev);
      if (next.has(cardId)) next.delete(cardId);
      else next.add(cardId);
      return next;
    });
  }, []);

  const getNeighborCard = useCallback((neighborId: string) => {
    return cardsRef.current.find((c) => c.id === neighborId) ?? linkedCardCacheRef.current[neighborId];
  }, []);

  const requestDeleteCard = useCallback((cardId: string) => {
    setConfirmDialog({ type: 'delete', cardId });
  }, []);

  const requestUnlinkCards = useCallback((cardId: string, otherCardId: string) => {
    setConfirmDialog({ type: 'unlink', cardId, otherCardId });
  }, []);

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
      .then(async (results) => {
        const anyOk = results.some((r) => r.data?.success && r.data.data);
        if (anyOk) {
          const refetchedList = await refetchDeckCardsList('bulk_treat_as_new');
          if (refetchedList === null) setCardsError(ta('failedLoadCards'));
        }
        setSelectedCardIds(new Set());
      })
      .catch(() => {})
      .finally(() => setActionLoading(false));
  }

  function handleCreateCard(e: React.FormEvent) {
    e.preventDefault();
    setCreateError('');
    if (isCardFieldEmpty(createRecto) || isCardFieldEmpty(createVerso)) {
      setCreateError(ta('frontBackRequired'));
      return;
    }
    const useBulk = showReversedZone || createKnowledgeContent.trim() !== '';
    if (showReversedZone) {
      if (isCardFieldEmpty(createRectoB) || isCardFieldEmpty(createVersoB)) {
        setCreateError(ta('frontBackRequiredBoth') !== 'frontBackRequiredBoth' ? ta('frontBackRequiredBoth') : 'Front and back are required for both cards.');
        return;
      }
    }
    const categoryIds = deck?.categories?.map((c) => c.id) ?? [];
    setCreating(true);
    if (useBulk) {
      const cardsPayload = showReversedZone
        ? [
            { recto: createRecto, verso: createVerso, comment: isCardFieldEmpty(createComment) ? null : createComment, category_ids: categoryIds },
            {
              recto: createRectoB,
              verso: createVersoB,
              comment: isCardFieldEmpty(createCommentB) ? null : createCommentB,
              category_ids: categoryIds,
            },
          ]
        : [{ recto: createRecto, verso: createVerso, comment: isCardFieldEmpty(createComment) ? null : createComment, category_ids: categoryIds }];
      apiClient
        .post<{ success: boolean; data?: Card | Card[] }>(`/api/decks/${id}/cards/bulk`, {
          knowledge: { content: createKnowledgeContent.trim() || null },
          cards: cardsPayload,
        })
        .then(async (res) => {
          if (res.data?.success && res.data.data) {
            const data = res.data.data;
            const newCards = Array.isArray(data) ? data : [data];
            const refetchedList = await refetchDeckCardsList('create_bulk');
            if (refetchedList === null) setCardsError(ta('failedLoadCards'));
            setRevealedCardIds((prev) => new Set([...prev, ...newCards.map((c) => c.id)]));
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
          recto: createRecto,
          verso: createVerso,
          comment: isCardFieldEmpty(createComment) ? undefined : createComment,
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
            const newId = res.data!.data!.id;
            const refetchedList = await refetchDeckCardsList('create_card');
            if (refetchedList === null) setCardsError(ta('failedLoadCards'));
            setRevealedCardIds((prev) => new Set(prev).add(newId));
            const cardToEdit = refetchedList?.find((c) => c.id === newId) ?? newCard;
            closeCreateModal();
            openEditModal(cardToEdit);
          } else {
            setCreateError(tc('invalidResponse'));
          }
        })
        .catch((err) => setCreateError(getApiErrorMessage(err, ta('failedCreateCard'))))
        .finally(() => setCreating(false));
    }
  }

  /** Simple form: create card A and linked reverse B (verso↔recto), or bulk+knowledge when that UI is enabled. */
  async function handleCreateWithAutoReverse() {
    setCreateError('');
    if (isCardFieldEmpty(createRecto) || isCardFieldEmpty(createVerso)) {
      setCreateError(ta('frontBackRequired'));
      return;
    }
    const categoryIds = deck?.categories?.map((c) => c.id) ?? [];
    const knowledgeUiOn = !!(userSettings?.knowledge_enabled && deck?.show_knowledge_on_card_creation);
    setCreating(true);
    try {
      if (knowledgeUiOn) {
        const res = await apiClient.post<{ success: boolean; data?: Card | Card[] }>(`/api/decks/${id}/cards/bulk`, {
          knowledge: { content: createKnowledgeContent.trim() || null },
          cards: [
            { recto: createRecto, verso: createVerso, comment: isCardFieldEmpty(createComment) ? null : createComment, category_ids: categoryIds },
            { recto: createVerso, verso: createRecto, comment: isCardFieldEmpty(createComment) ? null : createComment, category_ids: categoryIds },
          ],
        });
        if (res.data?.success && res.data.data) {
          const data = res.data.data;
          const newCards = Array.isArray(data) ? data : [data];
          const refetchedList = await refetchDeckCardsList('create_bulk_auto_reverse');
          if (refetchedList === null) setCardsError(ta('failedLoadCards'));
          setRevealedCardIds((prev) => new Set([...prev, ...newCards.map((c) => c.id)]));
          closeCreateModal();
        } else {
          setCreateError(tc('invalidResponse'));
        }
        return;
      }
      const res = await apiClient.post<{ success: boolean; data?: Card }>(`/api/decks/${id}/cards`, {
        recto: createRecto,
        verso: createVerso,
        comment: isCardFieldEmpty(createComment) ? undefined : createComment,
      });
      if (!res.data?.success || !res.data.data) {
        setCreateError(tc('invalidResponse'));
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
      const r = await apiClient.post<{ success: boolean; data?: Card }>(`/api/cards/${cardA.id}/reversed`, {
        card_b: { recto: createVerso, verso: createRecto, comment: isCardFieldEmpty(createComment) ? null : createComment },
        copy_categories: true,
        copy_knowledge: true,
      });
      if (r.data?.success && r.data.data) {
        const cardB = r.data.data;
        const refetchedList = await refetchDeckCardsList('create_with_reversed_pair');
        if (refetchedList === null) setCardsError(ta('failedLoadCards'));
        setRevealedCardIds((prev) => new Set([...prev, cardA.id, cardB.id]));
        closeCreateModal();
      } else {
        setCreateError(ta('failedGenerateReversedCard'));
      }
    } catch (err) {
      setCreateError(getApiErrorMessage(err, ta('failedCreateCard')));
    } finally {
      setCreating(false);
    }
  }

  function handleCreateCardAOnly(e: React.FormEvent) {
    e.preventDefault();
    setCreateError('');
    if (isCardFieldEmpty(createRecto) || isCardFieldEmpty(createVerso)) {
      setCreateError(ta('frontBackRequired'));
      return;
    }
    setCreatingA(true);
    apiClient
      .post<{ success: boolean; data?: Card }>(`/api/decks/${id}/cards`, {
        recto: createRecto,
        verso: createVerso,
        comment: isCardFieldEmpty(createComment) ? undefined : createComment,
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
          const refetchedList = await refetchDeckCardsList('create_card_a_only');
          if (refetchedList === null) setCardsError(ta('failedLoadCards'));
          setRevealedCardIds((prev) => new Set(prev).add(newCard.id));
          const cardToEdit = refetchedList?.find((c) => c.id === newCard.id) ?? newCard;
          closeCreateModal();
          openEditModal(cardToEdit);
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
    if (isCardFieldEmpty(createRecto) || isCardFieldEmpty(createVerso)) {
      setCreateError(ta('frontBackRequired'));
      return;
    }
    if (isCardFieldEmpty(createRectoB) || isCardFieldEmpty(createVersoB)) {
      setCreateErrorB(ta('frontBackRequiredBoth') !== 'frontBackRequiredBoth' ? ta('frontBackRequiredBoth') : 'Front and back are required for both cards.');
      return;
    }
    setCreatingB(true);
    apiClient
      .post<{ success: boolean; data?: Card }>(`/api/decks/${id}/cards`, {
        recto: createRecto,
        verso: createVerso,
        comment: isCardFieldEmpty(createComment) ? undefined : createComment,
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
            card_b: { recto: createRectoB, verso: createVersoB, comment: isCardFieldEmpty(createCommentB) ? null : createCommentB },
            copy_categories: true,
            copy_knowledge: true,
          })
          .then(async (r) => {
            if (r.data?.success && r.data.data) {
              const newBId = r.data.data.id;
              const refetchedList = await refetchDeckCardsList('create_card_then_reversed_b');
              if (refetchedList === null) setCardsError(ta('failedLoadCards'));
              setRevealedCardIds((prev) => new Set([...prev, cardA.id, newBId]));
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

  function openGenerateReversedModal(card: Card) {
    setEditingCard(null);
    setReverseSubmitError('');
    setGenerateReversedExistingCard(null);
    setGenerateReversedSourceCard(card);
    setGenerateReversedCopyCategories(true);
    setGenerateReversedCopyKnowledge(true);
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

  async function handleSaveReverseCardA(e: React.FormEvent) {
    e.preventDefault();
    const source = generateReversedSourceCard;
    if (!source) return;
    if (isCardFieldEmpty(reverseRectoA) || isCardFieldEmpty(reverseVersoA)) {
      setReverseSaveAError(ta('frontBackRequired') !== 'frontBackRequired' ? ta('frontBackRequired') : 'Front and back are required.');
      return;
    }
    setReverseSaveAError('');
    setReverseSaveASaving(true);
    try {
      const res = await apiClient.put<{ success: boolean; data?: Card }>(`/api/cards/${source.id}`, {
        recto: reverseRectoA,
        verso: reverseVersoA,
        comment: isCardFieldEmpty(reverseCommentA) ? undefined : reverseCommentA,
      });
      if (res.data?.success && res.data.data) {
        const updated = res.data.data;
        const refetchedList = await refetchDeckCardsList('reverse_modal_save_a');
        if (refetchedList === null) setCardsError(ta('failedLoadCards'));
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
    if (isCardFieldEmpty(reverseRectoB) || isCardFieldEmpty(reverseVersoB)) {
      setReverseSaveBError(ta('frontBackRequired') !== 'frontBackRequired' ? ta('frontBackRequired') : 'Front and back are required.');
      return;
    }
    setReverseSaveBError('');
    setReverseSaveBSaving(true);
    try {
      const res = await apiClient.put<{ success: boolean; data?: Card }>(`/api/cards/${existingB.id}`, {
        recto: reverseRectoB,
        verso: reverseVersoB,
        comment: isCardFieldEmpty(reverseCommentB) ? undefined : reverseCommentB,
      });
      if (res.data?.success && res.data.data) {
        const updated = res.data.data;
        const refetchedList = await refetchDeckCardsList('reverse_modal_save_b');
        if (refetchedList === null) setCardsError(ta('failedLoadCards'));
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
    if (isCardFieldEmpty(reverseRectoB) || isCardFieldEmpty(reverseVersoB)) {
      setReverseSubmitError(ta('frontBackRequired') !== 'frontBackRequired' ? ta('frontBackRequired') : 'Front and back are required.');
      return;
    }
    setReverseSubmitError('');
    setReverseSubmitSaving(true);
    try {
      const res = await apiClient.post<{ success: boolean; data?: Card }>(`/api/cards/${source.id}/reversed`, {
        card_b: { recto: reverseRectoB, verso: reverseVersoB, comment: isCardFieldEmpty(reverseCommentB) ? null : reverseCommentB },
        copy_categories: generateReversedCopyCategories,
        copy_knowledge: generateReversedCopyKnowledge,
      });
      if (res.data?.success && res.data.data) {
        const newCard = res.data.data;
        const refetchedList = await refetchDeckCardsList('reverse_modal_create_b');
        if (refetchedList === null) setCardsError(ta('failedLoadCards'));
        setRevealedCardIds((prev) => new Set(prev).add(newCard.id));
        const cardToEdit = refetchedList?.find((c) => c.id === newCard.id) ?? newCard;
        closeGenerateReversedModal();
        openEditModal(cardToEdit);
      } else {
        setReverseSubmitError(ta('failedGenerateReversedCard') !== 'failedGenerateReversedCard' ? ta('failedGenerateReversedCard') : 'Could not create reversed card.');
      }
    } catch (err) {
      setReverseSubmitError(getApiErrorMessage(err, ta('failedGenerateReversedCard') !== 'failedGenerateReversedCard' ? ta('failedGenerateReversedCard') : 'Could not create reversed card.'));
    } finally {
      setReverseSubmitSaving(false);
    }
  }

  async function handleSubmitEditLink(e: React.FormEvent) {
    e.preventDefault();
    if (!editingCard || !editLinkSelectedId) return;
    setEditLinkSaving(true);
    setEditLinkError('');
    try {
      const res = await apiClient.post<{ success: boolean; data?: Card }>(`/api/cards/${editingCard.id}/links`, {
        otherCardId: editLinkSelectedId,
      });
      if (res.data?.success && res.data.data) {
        const refetchedList = await refetchDeckCardsList('link_cards');
        if (refetchedList === null) setCardsError(ta('failedLoadCards'));
        setEditLinkSelectedId('');
      } else {
        setEditLinkError(tc('invalidResponse'));
      }
    } catch (err) {
      setEditLinkError(
        getApiErrorMessage(err, ta('failedLinkCard') !== 'failedLinkCard' ? ta('failedLinkCard') : 'Could not link cards.')
      );
    } finally {
      setEditLinkSaving(false);
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
        <p className="text-sm text-(--mc-accent-danger)" role="alert" aria-live="polite">
          {error || ta('deckNotFound')}
        </p>
        <Link
          href={`/${locale}/app`}
          className="text-sm font-medium text-(--mc-text-secondary)"
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
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
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
                  <> · <span title={ta('deckStudyOverdueTooltip')}>{(ta('deckStudyOverdueCount', { vars: { count: String(studyStats.highRiskCount) } }))}</span></>
                )}
                {studyStats.flaggedCount > 0 && (
                  <>
                    {' · '}
                    {(ta('deckStudyFlaggedCount', { vars: { count: String(studyStats.flaggedCount) } }))}
                    {' — '}
                    <Link
                      href={`/${locale}/app/flagged-cards${id ? `?deckId=${encodeURIComponent(id)}` : ''}`}
                      className="font-medium text-(--mc-accent-primary)"
                    >
                      {ta('deckStudyManageFlagged')}
                    </Link>
                  </>
                )}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => setShowDeckStatsModal(true)}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-(--mc-border-subtle) bg-(--mc-bg-page)/50 text-(--mc-text-secondary) transition-colors hover:bg-(--mc-bg-card-back) hover:text-(--mc-text-primary) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--mc-accent-primary) focus-visible:ring-offset-2 focus-visible:ring-offset-(--mc-bg-base)"
            title={ta('deckStatsOpen')}
            aria-label={ta('deckStatsOpen')}
          >
            <IconChartBar className="h-4 w-4" />
          </button>
        </div>
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
              title={ta('studyOverdueOnlyTooltip')}
              className="rounded-lg border border-(--mc-accent-warning) bg-(--mc-accent-warning)/10 px-4 pt-1.5 pb-2 text-sm font-medium text-(--mc-accent-warning) shadow-sm transition-colors duration-200 hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--mc-accent-warning) focus-visible:ring-offset-2 focus-visible:ring-offset-(--mc-bg-base)"
            >
              {ta('studyOverdueOnly')}
            </Link>
          )}
          <button
            type="button"
            onClick={openCreateModal}
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
        <p className="text-sm text-(--mc-accent-danger)" role="alert" aria-live="polite">
          {cardsError}
        </p>
      )}

      <DeckStatsModal
        open={showDeckStatsModal}
        onClose={() => setShowDeckStatsModal(false)}
        deckId={id}
        deckTitle={deck.title}
        locale={locale}
        cardsTotal={cards.length}
        cardsLoading={cardsLoading}
        studyStats={studyStats}
        ta={ta}
        tc={tc}
      />

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
            ref={createModalPanelRef}
            className={`mx-4 w-full max-h-[85vh] overflow-y-auto rounded-xl border border-(--mc-border-subtle) bg-(--mc-bg-surface) p-5 shadow-xl ${showReversedZone ? 'max-w-3xl' : 'max-w-xl'}`}
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
                      <p className="mt-3 text-sm text-(--mc-accent-danger)" role="alert" aria-live="polite">
                        {createError}
                      </p>
                    )}
                    <div className="mt-3">
                      <button
                        type="submit"
                        disabled={creatingA || isCardFieldEmpty(createRecto) || isCardFieldEmpty(createVerso)}
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
                      <p className="mt-3 text-sm text-(--mc-accent-danger)" role="alert" aria-live="polite">
                        {createErrorB}
                      </p>
                    )}
                    <div className="mt-3">
                      <button
                        type="submit"
                        disabled={creatingB || isCardFieldEmpty(createRecto) || isCardFieldEmpty(createVerso) || isCardFieldEmpty(createRectoB) || isCardFieldEmpty(createVersoB)}
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
                    onClick={addReversedZone}
                    className="rounded border border-(--mc-accent-primary) bg-transparent px-3 py-1.5 text-sm font-medium text-(--mc-accent-primary) hover:bg-(--mc-accent-primary)/10"
                  >
                    {ta('addReversedCard') !== 'addReversedCard' ? ta('addReversedCard') : 'Add reversed card'}
                  </button>
                )}
                {createError && (
                  <p className="mt-3 text-sm text-(--mc-accent-danger)" role="alert" aria-live="polite">
                    {createError}
                  </p>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="submit"
                    disabled={creating || isCardFieldEmpty(createRecto) || isCardFieldEmpty(createVerso)}
                    className="rounded bg-(--mc-accent-success) px-3 pt-1 pb-1.5 text-sm font-medium text-white transition-opacity disabled:opacity-50 hover:opacity-90"
                  >
                    {creating ? tc('creating') : tc('create')}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleCreateWithAutoReverse()}
                    disabled={creating || isCardFieldEmpty(createRecto) || isCardFieldEmpty(createVerso)}
                    className="rounded border border-(--mc-accent-primary) bg-(--mc-bg-surface) px-3 pt-1 pb-1.5 text-sm font-medium text-(--mc-accent-primary) transition-opacity hover:bg-(--mc-accent-primary)/10 disabled:opacity-50"
                  >
                    {creating ? tc('creating') : ta('createWithAutoReversePair')}
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
                  {tc('close')}
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
            onClick={openCreateModal}
            className="mt-3 text-sm font-medium text-(--mc-text-secondary)"
          >
            {ta('newCard')}
          </button>
        </div>
      ) : (
        <>
          {lastStudiedIds.size > 0 && !reviewedBannerDismissed && (
            <div className="mb-4 rounded-lg border border-(--mc-accent-primary)/30 bg-(--mc-accent-primary)/5 p-3">
              <p className="text-sm text-(--mc-text-primary)">
                {ta('manageReviewedBanner', { vars: { count: String(lastStudiedIds.size) } })}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowOnlyReviewed(!showOnlyReviewed)}
                  className="text-sm font-medium text-(--mc-accent-primary)"
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
                  href={`/${locale}/app/study-health`}
                  className="text-sm font-medium text-(--mc-accent-primary)"
                >
                  {ta('viewStudyHealthDashboard')}
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
          <ul className="flex flex-wrap justify-center gap-x-4 gap-y-6 px-2 py-1 sm:gap-x-5 sm:gap-y-7 sm:px-3">
            {displayCards.length === 0 ? (
              <li className="w-full basis-full rounded-xl border border-dashed border-(--mc-border-subtle) bg-(--mc-bg-surface)/50 p-6 text-center text-sm text-(--mc-text-secondary)">
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
                      onClick={openCreateModal}
                      className="rounded bg-(--mc-accent-success) px-3 pt-1 pb-1.5 text-sm font-medium text-white hover:opacity-90"
                    >
                      {ta('newCard')}
                    </button>
                  </div>
                ) : null}
              </li>
            ) : (
              visibleDisplayCards.map((card) => (
                <DeckCardRow
                  key={card.id}
                  card={card}
                  globalIndex={cardGlobalIndexById.get(card.id) ?? 0}
                  revealed={isRevealed(card.id)}
                  selected={selectedCardIds.has(card.id)}
                  ta={ta}
                  onToggleSelect={toggleCardSelection}
                  onReveal={revealOne}
                  onCollapseCard={collapseCardInList}
                  allowCollapse={!appliedSearchQuery.trim()}
                  onEdit={openEditModal}
                  onInspect={openCardDetailsModal}
                />
              ))
            )}
          </ul>
          {needsCardListPagination && displayCards.length > 0 && (
            <nav
              className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-(--mc-border-subtle) pt-4 pl-4"
              aria-label={ta('cardListPaginationNav')}
            >
              <p className="text-sm text-(--mc-text-secondary)">
                {ta('cardListPaginationRange', {
                  vars: {
                    from: String(cardListEffectivePage * CARD_LIST_PAGE_SIZE + 1),
                    to: String(
                      Math.min((cardListEffectivePage + 1) * CARD_LIST_PAGE_SIZE, displayCards.length)
                    ),
                    total: String(displayCards.length),
                  },
                })}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={cardListEffectivePage <= 0}
                  onClick={() => setCardListPage((p) => Math.max(0, p - 1))}
                  className="rounded border border-(--mc-border-subtle) px-3 pt-1 pb-1.5 text-sm font-medium text-(--mc-text-secondary) hover:bg-(--mc-bg-card-back) disabled:opacity-40 disabled:hover:bg-transparent"
                >
                  {ta('cardListPrevPage')}
                </button>
                <span className="text-sm text-(--mc-text-secondary)" aria-live="polite">
                  {ta('cardListPageOf', {
                    vars: {
                      current: String(cardListEffectivePage + 1),
                      total: String(cardListTotalPages),
                    },
                  })}
                </span>
                <button
                  type="button"
                  disabled={cardListEffectivePage >= cardListTotalPages - 1}
                  onClick={() => setCardListPage((p) => p + 1)}
                  className="rounded border border-(--mc-border-subtle) px-3 pt-1 pb-1.5 text-sm font-medium text-(--mc-text-secondary) hover:bg-(--mc-bg-card-back) disabled:opacity-40 disabled:hover:bg-transparent"
                >
                  {ta('cardListNextPage')}
                </button>
              </div>
            </nav>
          )}
        </>
      )}

      {editingCard && (
        <div
          data-testid="edit-modal-overlay"
          className="fixed inset-0 z-50 flex items-center justify-center bg-(--mc-overlay) p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-card-title"
          onClick={requestCloseEditModal}
        >
          <div
            ref={editModalShellRef}
            className="pointer-events-none flex max-h-[90vh] w-full max-w-6xl flex-col items-center gap-3 overflow-y-auto lg:flex-row lg:items-start lg:justify-center lg:gap-4 lg:overflow-visible"
          >
            <div
              className="pointer-events-auto w-full max-w-xl shrink-0 rounded-xl border border-(--mc-border-subtle) bg-(--mc-bg-surface) p-5 shadow-xl"
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
                {editingCard && (
                  <EditCardCategoryPicker
                    key={editingCard.id}
                    idPrefix="edit"
                    categories={editModalCategories}
                    selectedIds={editModalSelectedIds}
                    onToggle={toggleEditModalCategory}
                    sectionLabel={ta('cardCategories')}
                    addSectionLabel={
                      ta('editCategoryAddSection') !== 'editCategoryAddSection'
                        ? ta('editCategoryAddSection')
                        : 'Add categories'
                    }
                    searchPlaceholder={
                      ta('editCategorySearchPlaceholder') !== 'editCategorySearchPlaceholder'
                        ? ta('editCategorySearchPlaceholder')
                        : 'Search categories to add…'
                    }
                    noMatchMessage={
                      ta('editCategoryNoMatch') !== 'editCategoryNoMatch'
                        ? ta('editCategoryNoMatch')
                        : 'No category matches your search.'
                    }
                    noCategoriesMessage={
                      ta('editCategoryNoCategoriesInDeck') !== 'editCategoryNoCategoriesInDeck'
                        ? ta('editCategoryNoCategoriesInDeck')
                        : 'This deck has no categories yet.'
                    }
                    noneSelectedHint={
                      ta('editCategoryNoneSelected') !== 'editCategoryNoneSelected'
                        ? ta('editCategoryNoneSelected')
                        : 'No categories on this card. Search below to add some.'
                    }
                    getRemoveAriaLabel={(name) =>
                      ta('editCategoryRemoveAria') !== 'editCategoryRemoveAria'
                        ? ta('editCategoryRemoveAria', { vars: { name } })
                        : `Remove ${name}`
                    }
                    getAddAriaLabel={(name) =>
                      ta('editCategoryAddAria') !== 'editCategoryAddAria'
                        ? ta('editCategoryAddAria', { vars: { name } })
                        : `Add ${name}`
                    }
                  />
                )}
                {(editSaveSuccessMessage || editError) && (
                  <div className="mt-3 space-y-2">
                    {editSaveSuccessMessage && (
                      <p className="text-sm text-(--mc-accent-success)" role="status" aria-live="polite">
                        {editSaveSuccessMessage}
                      </p>
                    )}
                    {editError && (
                      <p className="text-sm text-(--mc-accent-danger)" role="alert" aria-live="polite">
                        {editError}
                      </p>
                    )}
                  </div>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="submit"
                    disabled={editSaving || isCardFieldEmpty(editRecto) || isCardFieldEmpty(editVerso)}
                    className="rounded bg-(--mc-accent-success) px-3 pt-1 pb-1.5 text-sm font-medium text-white transition-opacity disabled:opacity-50 hover:opacity-90"
                  >
                    {editSaving ? tc('saving') : tc('save')}
                  </button>
                  <button
                    type="button"
                    onClick={requestCloseEditModal}
                    className="rounded border border-(--mc-border-subtle) px-3 pt-1 pb-1.5 text-sm font-medium text-(--mc-text-secondary) hover:bg-(--mc-bg-card-back)"
                  >
                    {tc('cancel')}
                  </button>
                  {editingCard && (
                    <button
                      type="button"
                      disabled={editSaving}
                      onClick={() => requestDeleteCard(editingCard.id)}
                      className="rounded border border-(--mc-accent-danger) px-3 pt-1 pb-1.5 text-sm font-medium text-(--mc-accent-danger) transition-colors hover:bg-(--mc-accent-danger)/10 disabled:opacity-50"
                    >
                      {ta('deleteCard')}
                    </button>
                  )}
                </div>
              </form>
            </div>

            <div
              className="pointer-events-auto flex w-full max-w-xl flex-col gap-3 lg:w-88 lg:max-w-88 lg:shrink-0"
              onClick={(e) => e.stopPropagation()}
            >
              {editingCard && (
                <div className="w-full rounded-xl border border-(--mc-border-subtle) bg-(--mc-bg-surface) p-4 shadow-xl">
                  <button
                    type="button"
                    onClick={() => {
                      if (!confirmDiscardEditIfDirty()) return;
                      openGenerateReversedModal(editingCard);
                      closeEditModal();
                    }}
                    className="w-full rounded-lg border border-(--mc-accent-primary) bg-transparent px-4 py-2.5 text-sm font-medium text-(--mc-accent-primary) transition-colors hover:bg-(--mc-accent-primary)/10"
                  >
                    {ta('createLinkedCard') !== 'createLinkedCard' ? ta('createLinkedCard') : 'Create a linked card'}
                  </button>
                  <p className="mt-2 text-xs text-(--mc-text-secondary) leading-snug">
                    {ta('createLinkedCardHint') !== 'createLinkedCardHint'
                      ? ta('createLinkedCardHint')
                      : 'Opens the editor to add a new card linked to this one (e.g. reversed faces).'}
                  </p>
                </div>
              )}
              <div className="w-full rounded-xl border border-(--mc-border-subtle) bg-(--mc-bg-surface) p-4 shadow-xl">
                <h4 className="text-sm font-semibold text-(--mc-text-primary)">
                  {ta('linkExistingCard') !== 'linkExistingCard' ? ta('linkExistingCard') : 'Link existing card'}
                </h4>
                <p className="mt-1 text-xs text-(--mc-text-secondary) leading-snug">
                  {ta('linkExistingCardHint') !== 'linkExistingCardHint'
                    ? ta('linkExistingCardHint')
                    : 'Only cards in this deck are listed. Each link is between two cards only (not transitive).'}
                </p>
                <form onSubmit={handleSubmitEditLink} className="mt-3 space-y-2">
                  <CardLinkCombobox
                    inputId="edit-link-card-combobox"
                    label={ta('selectCardToLink') !== 'selectCardToLink' ? ta('selectCardToLink') : 'Card to link'}
                    filterPlaceholder={
                      ta('linkCardComboboxFilterPlaceholder') !== 'linkCardComboboxFilterPlaceholder'
                        ? ta('linkCardComboboxFilterPlaceholder')
                        : 'Search…'
                    }
                    noMatchesMessage={
                      ta('linkCardComboboxNoMatches') !== 'linkCardComboboxNoMatches'
                        ? ta('linkCardComboboxNoMatches')
                        : 'No card matches your search.'
                    }
                    rectoLabel={ta('recto')}
                    versoLabel={ta('verso')}
                    clearSelectionLabel={
                      ta('linkCardComboboxClearSelection') !== 'linkCardComboboxClearSelection'
                        ? ta('linkCardComboboxClearSelection')
                        : 'Clear selection'
                    }
                    candidates={editLinkCandidates}
                    selectedId={editLinkSelectedId}
                    onSelect={setEditLinkSelectedId}
                    disabled={editLinkSaving || editLinkCandidates.length === 0}
                  />
                  {editLinkCandidates.length === 0 && (
                    <p className="text-sm text-(--mc-text-secondary)">
                      {ta('noCardsAvailableToLink') !== 'noCardsAvailableToLink'
                        ? ta('noCardsAvailableToLink')
                        : 'No other cards in this deck can be linked.'}
                    </p>
                  )}
                  {editLinkError && (
                    <p className="text-sm text-(--mc-accent-danger)" role="alert" aria-live="polite">
                      {editLinkError}
                    </p>
                  )}
                  <button
                    type="submit"
                    disabled={
                      editLinkSaving || !editLinkSelectedId || editLinkCandidates.length === 0
                    }
                    className="rounded bg-(--mc-accent-primary) px-3 pt-1 pb-1.5 text-sm font-medium text-white transition-opacity disabled:opacity-50 hover:opacity-90"
                  >
                    {editLinkSaving
                      ? tc('loading')
                      : ta('linkSelectedCard') !== 'linkSelectedCard'
                        ? ta('linkSelectedCard')
                        : 'Link'}
                  </button>
                </form>
              </div>
              {editModalLinkedCardIds.length > 0 && (
                <>
                  <button
                    type="button"
                    aria-expanded={editModalShowLinkedCards}
                    aria-controls="edit-modal-linked-cards-panel"
                    onClick={() => setEditModalShowLinkedCards((v) => !v)}
                    className="w-full rounded-xl border border-(--mc-border-subtle) bg-(--mc-bg-surface) px-4 py-3 text-left text-sm font-medium text-(--mc-text-primary) shadow-xl transition-colors hover:bg-(--mc-bg-card-back)"
                  >
                  {editModalShowLinkedCards
                    ? ta('toggleLinkedCardsHide') !== 'toggleLinkedCardsHide'
                      ? ta('toggleLinkedCardsHide')
                      : 'Hide linked cards'
                    : ta('toggleLinkedCardsShow') !== 'toggleLinkedCardsShow'
                      ? ta('toggleLinkedCardsShow')
                      : 'Show linked cards'}
                  </button>
                  {editModalShowLinkedCards && (
                    <div
                      id="edit-modal-linked-cards-panel"
                      className="max-h-[min(60vh,32rem)] overflow-y-auto rounded-xl border border-(--mc-border-subtle) bg-(--mc-bg-surface) p-4 shadow-xl"
                      role="region"
                      aria-label={ta('linkedCardsReadOnlyTitle') !== 'linkedCardsReadOnlyTitle' ? ta('linkedCardsReadOnlyTitle') : 'Linked cards'}
                    >
                      <p className="mb-3 text-sm font-medium text-(--mc-text-primary)">
                        {ta('linkedCardsReadOnlyTitle') !== 'linkedCardsReadOnlyTitle' ? ta('linkedCardsReadOnlyTitle') : 'Linked cards'}
                      </p>
                      <div className="space-y-3">
                        {editModalLinkedCardIds.map((nid) => {
                          const nb = getNeighborCard(nid);
                          return (
                            <div
                              key={nid}
                              className="space-y-2 rounded-lg border border-(--mc-border-subtle) bg-(--mc-bg-page) p-3"
                            >
                              {!nb ? (
                                <p className="text-sm text-(--mc-text-secondary)">{tc('loading')}</p>
                              ) : (
                                <div className="flex gap-2">
                                  <div className="min-w-0 flex-1 space-y-2">
                                    <div>
                                      <p className="text-[0.625rem] font-medium leading-tight tracking-wide text-(--mc-text-muted)">
                                        {ta('recto')}
                                      </p>
                                      <CardHtmlContent
                                        html={nb.recto}
                                        className="mt-1 wrap-break-word text-sm text-(--mc-text-primary)"
                                      />
                                    </div>
                                    <hr
                                      className="border-0 border-t border-(--mc-border-subtle) opacity-60"
                                      aria-hidden="true"
                                    />
                                    <div>
                                      <p className="text-[0.625rem] font-medium leading-tight tracking-wide text-(--mc-text-muted)">
                                        {ta('verso')}
                                      </p>
                                      <CardHtmlContent
                                        html={nb.verso}
                                        className="mt-1 wrap-break-word text-sm text-(--mc-text-primary)"
                                      />
                                    </div>
                                    <hr
                                      className="border-0 border-t border-(--mc-border-subtle) opacity-60"
                                      aria-hidden="true"
                                    />
                                    <div>
                                      <p className="mb-1 text-[0.625rem] font-medium text-(--mc-text-muted)">{ta('cardCategories')}</p>
                                      <div className="flex flex-wrap gap-1">
                                        {(nb.categories?.length ?? 0) > 0
                                          ? nb.categories!.map((c) => (
                                              <CategoryBadgePill key={c.id}>{c.name}</CategoryBadgePill>
                                            ))
                                          : (
                                              <CategoryBadgePill>
                                                {ta('linkedCardNoCategories') !== 'linkedCardNoCategories'
                                                  ? ta('linkedCardNoCategories')
                                                  : 'No category'}
                                              </CategoryBadgePill>
                                            )}
                                      </div>
                                    </div>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => switchEditToLinkedCard(nb)}
                                    className="shrink-0 self-start rounded border border-(--mc-border-subtle) bg-(--mc-bg-surface) p-2 text-(--mc-text-secondary) transition-colors hover:bg-(--mc-bg-card-back) hover:text-(--mc-text-primary)"
                                    title={
                                      ta('linkedCardEditInModal') !== 'linkedCardEditInModal'
                                        ? ta('linkedCardEditInModal')
                                        : 'Edit this linked card'
                                    }
                                    aria-label={
                                      ta('linkedCardEditInModal') !== 'linkedCardEditInModal'
                                        ? ta('linkedCardEditInModal')
                                        : 'Edit this linked card'
                                    }
                                  >
                                    <svg
                                      xmlns="http://www.w3.org/2000/svg"
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth={1.5}
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      className="h-4 w-4"
                                      aria-hidden="true"
                                    >
                                      <path d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
                                    </svg>
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
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
            ref={generateReversedModalPanelRef}
            className="mx-4 w-full max-w-3xl rounded-xl border border-(--mc-border-subtle) bg-(--mc-bg-surface) p-5 shadow-xl max-h-[90vh] overflow-y-auto"
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
                    <p className="mt-3 text-sm text-(--mc-accent-danger)" role="alert" aria-live="polite">
                      {reverseSaveAError}
                    </p>
                  )}
                  <div className="mt-3">
                    <button
                      type="submit"
                      disabled={reverseSaveASaving || isCardFieldEmpty(reverseRectoA) || isCardFieldEmpty(reverseVersoA)}
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
                  {!generateReversedExistingCard && (
                    <div className="mt-3 space-y-2 rounded-lg border border-(--mc-border-subtle)/80 bg-(--mc-bg-page)/40 p-3">
                      <label className="flex cursor-pointer items-start gap-2 text-sm text-(--mc-text-primary)">
                        <input
                          type="checkbox"
                          checked={generateReversedCopyCategories}
                          onChange={(e) => setGenerateReversedCopyCategories(e.target.checked)}
                          className="mt-0.5 h-4 w-4 rounded border-(--mc-border-subtle)"
                        />
                        <span>{ta('copyCategoriesToLinkedCard') !== 'copyCategoriesToLinkedCard' ? ta('copyCategoriesToLinkedCard') : 'Copy categories from card A'}</span>
                      </label>
                      {(!!generateReversedSourceCard?.knowledge_id || userSettings?.knowledge_enabled) && (
                        <label className="flex cursor-pointer items-start gap-2 text-sm text-(--mc-text-primary)">
                          <input
                            type="checkbox"
                            checked={generateReversedCopyKnowledge}
                            onChange={(e) => setGenerateReversedCopyKnowledge(e.target.checked)}
                            className="mt-0.5 h-4 w-4 rounded border-(--mc-border-subtle)"
                          />
                          <span>{ta('copyKnowledgeToLinkedCard') !== 'copyKnowledgeToLinkedCard' ? ta('copyKnowledgeToLinkedCard') : 'Use same knowledge as card A'}</span>
                        </label>
                      )}
                    </div>
                  )}
                  {generateReversedExistingCard ? (
                    reverseSaveBError && (
                      <p className="mt-3 text-sm text-(--mc-accent-danger)" role="alert" aria-live="polite">
                        {reverseSaveBError}
                      </p>
                    )
                  ) : (
                    reverseSubmitError && (
                      <p className="mt-3 text-sm text-(--mc-accent-danger)" role="alert" aria-live="polite">
                        {reverseSubmitError}
                      </p>
                    )
                  )}
                  <div className="mt-3">
                    {generateReversedExistingCard ? (
                      <button
                        type="submit"
                        disabled={reverseSaveBSaving || isCardFieldEmpty(reverseRectoB) || isCardFieldEmpty(reverseVersoB)}
                        className="rounded bg-(--mc-accent-success) px-3 pt-1 pb-1.5 text-sm font-medium text-white transition-opacity disabled:opacity-50 hover:opacity-90"
                      >
                        {reverseSaveBSaving ? (tc('saving') !== 'saving' ? tc('saving') : 'Saving…') : tc('save')}
                      </button>
                    ) : (
                      <button
                        type="submit"
                        disabled={reverseSubmitSaving || isCardFieldEmpty(reverseRectoB) || isCardFieldEmpty(reverseVersoB)}
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
                {tc('close')}
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
            ref={editDeckModalPanelRef}
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
                <p className="text-sm text-(--mc-accent-danger)" role="alert" aria-live="polite">
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
        <CardFollowUpModal
          card={cardDetailsCard}
          reviewLogs={cardDetailsReviewLogs}
          linkedSeries={cardDetailsLinkedSeries}
          compareLinked={cardDetailsCompareLinked}
          onCompareLinkedChange={setCardDetailsCompareLinked}
          loading={cardDetailsLoading}
          error={cardDetailsError}
          locale={locale}
          ta={ta}
          tc={tc}
          panelRef={cardDetailsModalPanelRef}
          onClose={closeCardDetailsModal}
          onEditCard={() => {
            const c = cardDetailsCard;
            if (!c) return;
            closeCardDetailsModal();
            openEditModal(c);
          }}
          onTreatAsNew={() => {
            const c = cardDetailsCard;
            if (!c) return;
            const cid = c.id;
            closeCardDetailsModal();
            setConfirmDialog({ type: 'treatAsNew', cardId: cid });
          }}
          treatAsNewDisabled={!cardDetailsCard.last_review || actionLoading}
          actionLoading={actionLoading}
        />
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
            ref={confirmDialogPanelRef}
            className="mx-4 max-w-md rounded-lg border border-(--mc-border-subtle) bg-(--mc-bg-surface) p-4 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="confirm-dialog-title" className="text-lg font-semibold text-(--mc-text-primary)">
              {confirmDialog.type === 'bulkDelete' && 'cardIds' in confirmDialog
                ? ta('bulkDeleteConfirmTitle', { vars: { count: String(confirmDialog.cardIds.length) } })
                : confirmDialog.type === 'delete' && ta('deleteCardConfirmTitle')}
              {confirmDialog.type === 'deleteDeck' && ta('deleteDeckConfirmTitle')}
              {confirmDialog.type === 'treatAsNew' && ta('treatAsNewConfirmTitle')}
              {confirmDialog.type === 'unlink' &&
                (ta('unlinkLinkConfirmTitle') !== 'unlinkLinkConfirmTitle'
                  ? ta('unlinkLinkConfirmTitle')
                  : 'Remove link?')}
            </h3>
            <p className="mt-2 text-sm text-(--mc-text-secondary)">
              {confirmDialog.type === 'bulkDelete' && 'cardIds' in confirmDialog
                ? ta('bulkDeleteConfirmMessage')
                : confirmDialog.type === 'delete' && ta('deleteCardConfirmMessage')}
              {confirmDialog.type === 'deleteDeck' && ta('deleteDeckConfirmMessage')}
              {confirmDialog.type === 'treatAsNew' && ta('treatAsNewConfirmMessage')}
              {confirmDialog.type === 'unlink' &&
                (ta('unlinkLinkConfirmMessage') !== 'unlinkLinkConfirmMessage'
                  ? ta('unlinkLinkConfirmMessage')
                  : 'The two cards stay in the deck; only the direct link between them is removed.')}
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
                          : confirmDialog.type === 'unlink'
                            ? ta('unlinkConfirm') !== 'unlinkConfirm'
                              ? ta('unlinkConfirm')
                              : 'Unlink'
                            : tc('confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
