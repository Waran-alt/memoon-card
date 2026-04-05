'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useLocale } from 'i18n';
import apiClient, { getApiErrorMessage, isRequestCancelled } from '@/lib/api';
import type { Deck, Card, ReviewResult } from '@/types';
import type { Rating } from '@/types';
import { useTranslation } from '@/hooks/useTranslation';
import { useConnectionState } from '@/hooks/useConnectionState';
import { retryWithBackoff, addToPendingQueue } from '@/lib/studySync';
import { useConnectionSyncStore } from '@/store/connectionSync.store';
import { parseSessionSize, getSessionLimit, type SessionSizeKey } from '@/lib/sessionSize';
import { useUserStudySettings } from '@/hooks/useUserStudySettings';
import { STUDY_INTERVAL } from '@memoon-card/shared';
import { Check, Hourglass, Rocket, Wind, X } from 'lucide-react';
import { CardFormFields } from '../CardFormFields';

/** When remaining queue size is at or below this, fetch more due cards (up to session ceiling). */
const QUEUE_LOW_WATER = 5;
/** Minimum time (ms) between showing the two cards of a reverse pair; uses STUDY_INTERVAL.MIN_INTERVAL_MINUTES. */
const REVERSE_PAIR_MIN_TIME_MS = STUDY_INTERVAL.MIN_INTERVAL_MINUTES * 60 * 1000;

const STUDY_SESSION_STORAGE_KEY_PREFIX = 'memoon_study_session_';
const STUDY_SESSION_MAX_AGE_MS = 2 * 60 * 60 * 1000; // 2 hours

/** Pictos : Lucide (ISC, https://lucide.dev/license) — couleur via le bouton. */
const RATING_ICON_CLASS = 'h-6 w-6 shrink-0';

function StudyRatingGlyph({ rating }: { rating: Rating }) {
  const stroke = 2;
  switch (rating) {
    case 1:
      return <X className={RATING_ICON_CLASS} strokeWidth={stroke} aria-hidden />;
    case 2:
      return <Hourglass className={RATING_ICON_CLASS} strokeWidth={stroke} aria-hidden />;
    case 3:
      return <Check className={RATING_ICON_CLASS} strokeWidth={stroke} aria-hidden />;
    case 4:
      return (
        <span
          className={`relative inline-flex ${RATING_ICON_CLASS} items-center justify-center`}
          aria-hidden
        >
          <Wind
            className="absolute -left-0.5 bottom-0 h-3.5 w-3.5 opacity-75"
            strokeWidth={1.5}
            aria-hidden
          />
          <Rocket className="relative h-5 w-5" strokeWidth={stroke} aria-hidden />
        </span>
      );
    default:
      return null;
  }
}

const RATING_BUTTON_CLASS: Record<Rating, string> = {
  1: 'border-(--mc-accent-danger) text-(--mc-accent-danger) hover:bg-(--mc-accent-danger)/12',
  2: 'border-(--mc-accent-warning) text-(--mc-accent-warning) hover:bg-(--mc-accent-warning)/12',
  3: 'border-(--mc-accent-success) text-(--mc-accent-success) hover:bg-(--mc-accent-success)/12',
  4: 'border-(--mc-accent-primary) text-(--mc-accent-primary) hover:bg-(--mc-accent-primary)/12',
};

/** Format ms as m:ss or h:mm:ss for study timers. */
function formatStudyDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '0:00';
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

interface SavedStudyQueue {
  deckId: string;
  reviewedCardIds: string[];
  queue: Card[];
  reviewedCount: number;
  sessionSize: SessionSizeKey;
  savedAt: number;
}

function getSavedStudyQueue(deckId: string): SavedStudyQueue | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(`${STUDY_SESSION_STORAGE_KEY_PREFIX}${deckId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SavedStudyQueue;
    if (parsed.savedAt < Date.now() - STUDY_SESSION_MAX_AGE_MS) return null;
    if (parsed.deckId !== deckId || !Array.isArray(parsed.queue) || !Array.isArray(parsed.reviewedCardIds)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveStudyQueue(
  deckId: string,
  reviewedCardIds: string[],
  queue: Card[],
  reviewedCount: number,
  sessionSize: SessionSizeKey
): void {
  if (typeof window === 'undefined') return;
  try {
    const state: SavedStudyQueue = {
      deckId,
      reviewedCardIds,
      queue,
      reviewedCount,
      sessionSize,
      savedAt: Date.now(),
    };
    sessionStorage.setItem(`${STUDY_SESSION_STORAGE_KEY_PREFIX}${deckId}`, JSON.stringify(state));
  } catch {
    // ignore
  }
}

function clearStudyQueue(deckId: string): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(`${STUDY_SESSION_STORAGE_KEY_PREFIX}${deckId}`);
  } catch {
    // ignore
  }
}

/** Fisher–Yates shuffle so card order varies each session (avoids position bias). */
function shuffleCards<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** True if two cards share a direct undirected link. */
function areDirectlyLinked(a: Card, b: Card): boolean {
  if (!a || !b) return false;
  return !!(a.linked_card_ids?.includes(b.id) || b.linked_card_ids?.includes(a.id));
}

/**
 * Reorder queue so directly linked cards are not shown too close together initially.
 */
function separateLinkedCards(queue: Card[]): Card[] {
  if (queue.length <= 1) return queue;
  let arr = [...queue];
  const n = arr.length;
  const half = Math.ceil(n / 2);
  const minGap = Math.max(1, Math.min(5, half));
  const maxIterations = arr.length;
  for (let iter = 0; iter < maxIterations; iter++) {
    let moved = false;
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length && j - i <= minGap; j++) {
        if (areDirectlyLinked(arr[i], arr[j])) {
          const removed = arr[j];
          arr.splice(j, 1);
          const insertAt = Math.min(i + minGap, arr.length);
          arr.splice(insertAt, 0, removed);
          moved = true;
          break;
        }
      }
      if (moved) break;
    }
    if (!moved) break;
  }
  return arr;
}

export default function StudyPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { locale } = useLocale();
  const { t: tc } = useTranslation('common', locale);
  const { t: ta } = useTranslation('app', locale);
  const id = typeof params.id === 'string' ? params.id : '';
  const [deck, setDeck] = useState<Deck | null>(null);
  const [queue, setQueue] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showQuestion, setShowQuestion] = useState(false);
  const [showAnswer, setShowAnswer] = useState(false);
  const [needManage, setNeedManage] = useState(false);
  const [flagSubmitting, setFlagSubmitting] = useState(false);
  const [showOtherNoteInput, setShowOtherNoteInput] = useState(false);
  const [otherNote, setOtherNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [editingCard, setEditingCard] = useState<Card | null>(null);
  const [editRecto, setEditRecto] = useState('');
  const [editVerso, setEditVerso] = useState('');
  const [editComment, setEditComment] = useState('');
  const [editError, setEditError] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [reviewError, setReviewError] = useState('');
  const [reviewedCount, setReviewedCount] = useState(0);
  const reviewedCardIdsRef = useRef<string[]>([]);
  /** When each card was last shown (for linked-card gap and review payload). */
  const lastShownAtRef = useRef<Record<string, number>>({});
  const queueRef = useRef<Card[]>([]);
  queueRef.current = queue;
  const prefetchAbortRef = useRef<AbortController | null>(null);

  const { setHadFailure } = useConnectionState();
  const { learningMinIntervalMinutes } = useUserStudySettings();

  /** Thinking time: question reveal → answer reveal (ms), frozen once answer is shown. */
  const [thinkingElapsedMs, setThinkingElapsedMs] = useState(0);
  /** Timestamp when user clicked "Show answer" for the current card. */
  const answerRevealedAtRef = useRef<number | null>(null);
  /** When the user revealed the question (thinking timer starts). */
  const questionRevealedAtRef = useRef<number | null>(null);

  const sessionSize = parseSessionSize(searchParams.get('sessionSize'));
  const sessionLimit = getSessionLimit(sessionSize);

  const FLAG_REASONS: { code: string; labelKey: string }[] = [
    { code: 'wrong_content', labelKey: 'needManagementReasonWrongContent' },
    { code: 'duplicate', labelKey: 'needManagementReasonDuplicate' },
    { code: 'typo', labelKey: 'needManagementReasonTypo' },
    { code: 'need_split', labelKey: 'needManagementReasonNeedSplit' },
    { code: 'other', labelKey: 'needManagementReasonOther' },
  ];

  const currentCard = queue[0];

  useEffect(() => {
    setNeedManage(false);
    setShowOtherNoteInput(false);
    setOtherNote('');
    setShowQuestion(false);
    setShowAnswer(false);
    setThinkingElapsedMs(0);
    answerRevealedAtRef.current = null;
    questionRevealedAtRef.current = null;
  }, [currentCard?.id]);

  const reversePairMinGapMs = Math.max(
    REVERSE_PAIR_MIN_TIME_MS,
    learningMinIntervalMinutes * 60 * 1000
  );

  // Enforce min time gap between reverse-pair cards (≥ 1 min or user's learning_min_interval_minutes); if none can be shown, clear queue
  useEffect(() => {
    if (queue.length === 0) return;
    const now = Date.now();
    const isBlocked = (c: Card) => {
      const neighbors = c.linked_card_ids ?? [];
      for (const nid of neighbors) {
        const t = lastShownAtRef.current[nid];
        if (t != null && now - t < reversePairMinGapMs) return true;
      }
      return false;
    };
    if (!isBlocked(queue[0])) return;
    const idx = queue.findIndex((c) => !isBlocked(c));
    if (idx === -1) {
      setQueue([]);
      return;
    }
    if (idx === 0) return;
    const reordered = [queue[idx], ...queue.slice(0, idx), ...queue.slice(idx + 1)];
    setQueue(reordered);
  }, [queue, reversePairMinGapMs]);

  // Thinking timer: runs after question reveal until answer reveal (then stays fixed).
  useEffect(() => {
    const tick = () => {
      const start = questionRevealedAtRef.current;
      if (start == null) {
        setThinkingElapsedMs(0);
        return;
      }
      const end = answerRevealedAtRef.current ?? Date.now();
      setThinkingElapsedMs(Math.max(0, end - start));
    };
    tick();
    const interval = setInterval(tick, 250);
    return () => clearInterval(interval);
  }, [currentCard?.id, showQuestion, showAnswer]);

  useEffect(() => {
    if (!id) return;
    const size = parseSessionSize(searchParams.get('sessionSize'));
    const limit = getSessionLimit(size);
    const ac = new AbortController();
    setLoading(true);
    setError('');

    const saved = getSavedStudyQueue(id);
    // Only restore if there are still cards to review; otherwise start fresh
    const canRestore = saved && saved.queue.length > 0;
    if (saved && !canRestore) clearStudyQueue(id);

    if (canRestore) {
      apiClient
        .get<{ success: boolean; data?: Deck }>(`/api/decks/${id}`, { signal: ac.signal })
        .then((deckRes) => {
          if (!deckRes.data?.success || !deckRes.data.data) {
            setError(ta('deckNotFound'));
            return;
          }
          setDeck(deckRes.data.data);
          lastShownAtRef.current = {};
          setQueue(separateLinkedCards(saved.queue));
          setReviewedCount(saved.reviewedCount);
          reviewedCardIdsRef.current = saved.reviewedCardIds;
          setHadFailure(false);
        })
        .catch((err) => {
          if (!isRequestCancelled(err)) setError(getApiErrorMessage(err, ta('failedLoadCards')));
        })
        .finally(() => setLoading(false));
      return () => ac.abort();
    }

    Promise.all([
      apiClient.get<{ success: boolean; data?: Deck }>(`/api/decks/${id}`, { signal: ac.signal }),
      apiClient.get<{ success: boolean; data?: Card[] }>(`/api/decks/${id}/cards/study?limit=${limit}`, { signal: ac.signal }).catch(() =>
        apiClient.get<{ success: boolean; data?: Card[] }>(`/api/decks/${id}/cards`, { signal: ac.signal }).then((r) => {
          const cards = r.data?.data ?? [];
          const now = new Date().toISOString();
          const due = cards.filter((c) => c.next_review && c.next_review <= now);
          const newCards = cards.filter((c) => c.stability == null);
          return { data: { success: true, data: [...due, ...newCards].slice(0, limit) } };
        })
      ),
    ])
      .then(([deckRes, studyRes]) => {
        if (!deckRes.data?.success || !deckRes.data.data) {
          setError(ta('deckNotFound'));
          return;
        }
        setDeck(deckRes.data.data);
        const list = studyRes.data?.success && Array.isArray(studyRes.data.data) ? studyRes.data.data : [];
        lastShownAtRef.current = {};
        setQueue(separateLinkedCards(shuffleCards(list).slice(0, limit)));
        reviewedCardIdsRef.current = [];
        setHadFailure(false); // clear so "Connection lost" doesn't stick after a successful load
      })
      .catch((err) => {
        if (!isRequestCancelled(err)) setError(getApiErrorMessage(err, ta('failedLoadCards')));
      })
      .finally(() => setLoading(false));
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ta() is stable enough for error messages; including it causes infinite re-fetch loop
  }, [id, searchParams.get('sessionSize')]);

  /** Top up queue when it runs low, staying under the session-size ceiling. */
  useEffect(() => {
    if (!id || !deck || loading) return;
    if (queue.length === 0 || queue.length > QUEUE_LOW_WATER) return;
    const ceiling = getSessionLimit(sessionSize);
    const slots = ceiling - queue.length;
    if (slots <= 0) return;

    prefetchAbortRef.current?.abort();
    const ac = new AbortController();
    prefetchAbortRef.current = ac;

    const excludeIds = [...new Set([...reviewedCardIdsRef.current, ...queueRef.current.map((c) => c.id)])];
    const params = new URLSearchParams({ limit: String(slots) });
    excludeIds.forEach((cid) => params.append('excludeCardIds', cid));

    void apiClient
      .get<{ success: boolean; data?: Card[] }>(`/api/decks/${id}/cards/study?${params.toString()}`, { signal: ac.signal })
      .catch(() =>
        apiClient.get<{ success: boolean; data?: Card[] }>(`/api/decks/${id}/cards`, { signal: ac.signal }).then((r) => {
          const cards = r.data?.data ?? [];
          const now = new Date().toISOString();
          const due = cards.filter((c) => c.next_review && c.next_review <= now);
          const newCards = cards.filter((c) => c.stability == null);
          const filtered = [...due, ...newCards].filter((c) => !excludeIds.includes(c.id)).slice(0, slots);
          return { data: { success: true, data: filtered } };
        })
      )
      .then((res) => {
        if (ac.signal.aborted) return;
        const fresh = res.data?.success && Array.isArray(res.data.data) ? res.data.data : [];
        setQueue((prev) => {
          const seen = new Set(prev.map((c) => c.id));
          const extra = fresh.filter((c) => !seen.has(c.id));
          if (extra.length === 0) return prev;
          return separateLinkedCards([...prev, ...shuffleCards(extra)]);
        });
      })
      .catch((err) => {
        if (!isRequestCancelled(err)) {
          /* keep studying with remaining cards */
        }
      });

    return () => ac.abort();
  }, [id, deck, loading, queue.length, sessionSize]);

  useEffect(() => {
    if (!id || !deck || (queue.length === 0 && reviewedCount === 0)) return;
    saveStudyQueue(id, reviewedCardIdsRef.current, queue, reviewedCount, sessionSize);
  }, [id, deck, queue, reviewedCount, sessionSize]);

  function goToDeck() {
    clearStudyQueue(id);
    router.push(`/${locale}/app/decks/${id}`);
  }

  async function handleSubmitRating(rating: Rating) {
    const card = currentCard;
    if (!card || submitting) return;
    setSubmitting(true);
    setReviewError('');
    const now = Date.now();
    const shownAt = lastShownAtRef.current[card.id] ?? questionRevealedAtRef.current ?? now;
    const revealedAt = answerRevealedAtRef.current ?? (showAnswer ? now : undefined);
    const ratedAt = now;
    const thinkingDurationMs =
      shownAt != null && revealedAt != null ? Math.max(0, Math.round(revealedAt - shownAt)) : undefined;
    const payload = {
      rating,
      shownAt,
      revealedAt,
      ratedAt,
      thinkingDurationMs,
      clientEventId: crypto.randomUUID(),
    };
    try {
      try {
        await retryWithBackoff(() =>
          apiClient.post<{ success: boolean; data?: ReviewResult }>(`/api/cards/${card.id}/review`, payload)
        );
      } catch {
        try {
          await retryWithBackoff(() =>
            apiClient.post<{ success: boolean; data?: ReviewResult[] }>('/api/reviews/batch', {
              reviews: [{ cardId: card.id, rating }],
            })
          );
        } catch {
          setHadFailure(true);
          addToPendingQueue({ type: 'review', url: `/api/cards/${card.id}/review`, payload });
          useConnectionSyncStore.getState().refreshPendingCount();
          setReviewError(ta('failedSaveReview'));
          setSubmitting(false);
          return;
        }
      }
      reviewedCardIdsRef.current = [...reviewedCardIdsRef.current, card.id];
      setReviewedCount((n) => n + 1);
      setQueue((prev) => separateLinkedCards(prev.slice(1)));
      setShowAnswer(false);
      setHadFailure(false);
    } catch {
      setHadFailure(true);
      addToPendingQueue({ type: 'review', url: `/api/cards/${card.id}/review`, payload });
      useConnectionSyncStore.getState().refreshPendingCount();
      setReviewError(ta('failedSaveReview'));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleFlagCard(reason: string, note?: string) {
    if (!currentCard || flagSubmitting) return;
    setFlagSubmitting(true);
    try {
      await apiClient.post(`/api/cards/${currentCard.id}/flag`, {
        reason,
        note: note || undefined,
      });
      setNeedManage(false);
    } catch {
      setReviewError(ta('failedSaveReview'));
    } finally {
      setFlagSubmitting(false);
    }
  }

  function openEditModal() {
    if (!currentCard) return;
    setEditingCard(currentCard);
    setEditRecto(currentCard.recto);
    setEditVerso(currentCard.verso);
    setEditComment(currentCard.comment ?? '');
    setEditError('');
  }

  function closeEditModal() {
    setEditingCard(null);
    setEditError('');
  }

  async function handleEditCardSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingCard) return;
    const recto = editRecto.trim();
    const verso = editVerso.trim();
    if (!recto || !verso) {
      setEditError(ta('frontBackRequired'));
      return;
    }
    setEditSaving(true);
    setEditError('');
    try {
      const res = await apiClient.put<{ success: boolean; data?: Card }>(`/api/cards/${editingCard.id}`, {
        recto,
        verso,
        comment: editComment.trim() || undefined,
      });
      if (res.data?.success && res.data.data) {
        setQueue((prev) =>
          prev.map((c) => (c.id === editingCard.id ? { ...c, ...res.data!.data! } : c))
        );
        closeEditModal();
      } else {
        setEditError(tc('invalidResponse'));
      }
    } catch (err) {
      setEditError(getApiErrorMessage(err, ta('failedUpdateCard')));
    } finally {
      setEditSaving(false);
    }
  }

  if (!id) {
    router.replace(`/${locale}/app`);
    return null;
  }

  if (loading) return <p className="text-sm text-(--mc-text-secondary)">{tc('loading')}</p>;
  if (error || !deck) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-(--mc-accent-danger)" role="alert">{error || ta('deckNotFound')}</p>
        <Link href={`/${locale}/app`} className="text-sm font-medium text-(--mc-text-secondary) underline hover:no-underline">
          {ta('backToDecks')}
        </Link>
      </div>
    );
  }

  const sessionDone = queue.length === 0 && reviewedCount > 0;
  const noCards = queue.length === 0 && reviewedCount === 0;

  if (noCards) {
    return (
      <div className="space-y-4">
        <button type="button" onClick={goToDeck} className="text-sm font-medium text-(--mc-text-secondary) hover:text-(--mc-text-primary)">
          ← {ta('backToDeck')}
        </button>
        <div className="mc-study-surface rounded-xl border p-8 text-center shadow-sm">
          <p className="text-(--mc-text-primary)">{ta('noCardsToStudy')}</p>
        </div>
      </div>
    );
  }

  if (sessionDone) {
    return (
      <div className="mc-study-page mx-auto max-w-2xl space-y-6">
        <div className="mc-study-surface rounded-xl border p-8 text-center shadow-sm">
          <p className="text-lg font-medium text-(--mc-text-primary)">{ta('sessionComplete')}</p>
          <p className="mt-2 text-sm text-(--mc-text-secondary)">{ta('reviewedCount', { count: reviewedCount })}</p>
          <p className="mt-4 text-sm text-(--mc-text-muted)">{ta('studyNoMoreDue')}</p>
          <div className="mt-6">
            <button
              type="button"
              onClick={goToDeck}
              className="rounded-lg bg-(--mc-accent-primary) px-4 py-2 text-sm font-medium text-white opacity-90 hover:opacity-100"
            >
              {ta('backToDeck')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const card = currentCard;
  if (!card) return null;

  return (
    <div className="mc-study-page mx-auto max-w-2xl space-y-6 relative">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={goToDeck} className="text-sm font-medium text-(--mc-text-secondary) hover:text-(--mc-text-primary)">
          ← {ta('exitStudy')}
        </button>
        {showQuestion && (
          <div className="text-sm text-(--mc-text-secondary)">
            <span title={ta('studyTimerThinkingTooltip')}>
              {ta('studyTimerThinking')}
              :{' '}
              <span className="font-mono tabular-nums">{formatStudyDuration(thinkingElapsedMs)}</span>
            </span>
          </div>
        )}
      </div>

      <div className="min-h-[280px] rounded-xl border p-8 shadow-sm">
        {!showQuestion ? (
          <>
            <p className="text-sm text-(--mc-text-secondary)">
              {ta('studyShowQuestionHint')}
            </p>
            <div className="mt-6">
              <button
                type="button"
                onClick={() => {
                  if (!card?.id) return;
                  const at = Date.now();
                  lastShownAtRef.current[card.id] = at;
                  questionRevealedAtRef.current = at;
                  setShowQuestion(true);
                }}
                className="rounded-lg bg-(--mc-accent-primary) px-4 py-2 text-sm font-medium text-white opacity-90 hover:opacity-100"
              >
                {ta('showQuestion')}
              </button>
            </div>
          </>
        ) : !showAnswer ? (
          <>
            <p className="text-xs font-medium uppercase tracking-wide text-(--mc-text-muted)">
              {ta('studyStepQuestion')}
            </p>
            <p className="mt-2 whitespace-pre-wrap text-lg leading-relaxed text-(--mc-text-primary)">
              {card.recto}
            </p>
            <div className="mt-6">
              <button
                type="button"
                onClick={() => {
                  const at = Date.now();
                  answerRevealedAtRef.current = at;
                  setShowAnswer(true);
                }}
                className="rounded-lg bg-(--mc-accent-primary) px-4 py-2 text-sm font-medium text-white opacity-90 hover:opacity-100"
              >
                {ta('showAnswer')}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-xs font-medium uppercase tracking-wide text-(--mc-text-muted)">
              {ta('studyStepQuestion')}
            </p>
            <p className="mt-2 whitespace-pre-wrap text-lg leading-relaxed text-(--mc-text-primary)">
              {card.recto}
            </p>
            <hr className="my-4 border-(--mc-border-subtle)" aria-hidden />
            <p className="text-xs font-medium uppercase tracking-wide text-(--mc-text-muted)">
              {ta('studyStepAnswer')}
            </p>
            <p className="mt-2 whitespace-pre-wrap text-lg leading-relaxed text-(--mc-text-primary)">
              {card.verso}
            </p>
            <p className="mt-3 text-sm text-(--mc-text-muted)">
              {ta('studyThinkingTimeLabel')}
              :{' '}
              <span className="font-mono tabular-nums text-(--mc-text-secondary)">
                {formatStudyDuration(thinkingElapsedMs)}
              </span>
            </p>
            <div className="mt-6 space-y-4">
            <div className="flex flex-wrap gap-2">
              {([1, 2, 3, 4] as Rating[]).map((r) => {
                const label =
                  r === 1 ? ta('again') : r === 2 ? ta('hard') : r === 3 ? ta('good') : ta('easy');
                return (
                  <button
                    key={r}
                    type="button"
                    disabled={submitting}
                    onClick={() => handleSubmitRating(r)}
                    aria-label={label}
                    title={label}
                    className={`flex min-h-11 min-w-11 items-center justify-center rounded-lg border-2 bg-transparent px-3 py-2 transition-colors disabled:opacity-50 ${RATING_BUTTON_CLASS[r]}`}
                  >
                    <StudyRatingGlyph rating={r} />
                  </button>
                );
              })}
            </div>
            <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm text-(--mc-text-secondary)">
              <input
                type="checkbox"
                checked={needManage}
                onChange={(e) => setNeedManage(e.target.checked)}
                className="rounded border-(--mc-border-subtle)"
                aria-label={ta('needManagement')}
              />
              {ta('needManagement')}
            </label>
              {needManage && (
                <div className="space-y-2 rounded border border-(--mc-border-subtle) bg-(--mc-bg-card)/50 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-(--mc-text-secondary)">{ta('addNote')}:</span>
                    {FLAG_REASONS.map(({ code, labelKey }) => (
                      code === 'other' ? (
                        <button
                          key={code}
                          type="button"
                          disabled={flagSubmitting}
                          onClick={() => setShowOtherNoteInput(true)}
                          className="rounded border border-(--mc-border-subtle) px-2 py-1 text-xs font-medium hover:bg-(--mc-bg-card) disabled:opacity-50"
                        >
                          {ta(labelKey)}
                        </button>
                      ) : (
                        <button
                          key={code}
                          type="button"
                          disabled={flagSubmitting}
                          onClick={() => handleFlagCard(code)}
                          className="rounded border border-(--mc-border-subtle) px-2 py-1 text-xs font-medium hover:bg-(--mc-bg-card) disabled:opacity-50"
                        >
                          {ta(labelKey)}
                        </button>
                      )
                    ))}
                  </div>
                  {showOtherNoteInput && (
                    <div className="flex flex-col gap-2 border-t border-(--mc-border-subtle) pt-2">
                      <label className="text-xs font-medium text-(--mc-text-secondary)">
                        {ta('managementReasonCustomPlaceholder')}
                      </label>
                      <textarea
                        value={otherNote}
                        onChange={(e) => setOtherNote(e.target.value)}
                        placeholder={ta('managementReasonCustomPlaceholder')}
                        rows={2}
                        className="w-full rounded border border-(--mc-border-subtle) bg-(--mc-bg-surface) px-2 py-1.5 text-sm text-(--mc-text-primary) resize-y"
                        maxLength={500}
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={flagSubmitting}
                          onClick={async () => {
                            await handleFlagCard('other', otherNote);
                            setShowOtherNoteInput(false);
                            setOtherNote('');
                          }}
                          className="rounded bg-(--mc-accent-primary) px-3 py-1.5 text-sm font-medium text-white opacity-90 hover:opacity-100 disabled:opacity-50"
                        >
                          {tc('save')}
                        </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowOtherNoteInput(false);
                          setOtherNote('');
                        }}
                        className="rounded border border-(--mc-border-subtle) px-3 py-1.5 text-sm font-medium text-(--mc-text-secondary) hover:bg-(--mc-bg-card)"
                      >
                        {tc('cancel')}
                      </button>
                    </div>
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={openEditModal}
                    className="rounded border border-(--mc-accent-primary) bg-(--mc-accent-primary)/10 px-3 py-1.5 text-sm font-medium text-(--mc-accent-primary) hover:bg-(--mc-accent-primary)/20"
                  >
                    {ta('immediateManagement')}
                  </button>
                </div>
              </div>
            )}
            <details className="rounded border border-(--mc-border-subtle) bg-(--mc-bg-card)/50 px-3 py-2 text-sm text-(--mc-text-secondary)">
              <summary className="cursor-pointer font-medium text-(--mc-text-primary)">
                {ta('studyRatingHelpTitle')}
              </summary>
              <p className="mt-2 text-(--mc-text-muted)">{ta('studyRatingHelpIntro')}</p>
              <ul className="mt-2 list-none space-y-1 text-(--mc-text-muted)">
                <li><strong className="text-(--mc-text-secondary)">{ta('again')}:</strong> {ta('studyRatingAgainDesc')}</li>
                <li><strong className="text-(--mc-text-secondary)">{ta('hard')}:</strong> {ta('studyRatingHardDesc')}</li>
                <li><strong className="text-(--mc-text-secondary)">{ta('good')}:</strong> {ta('studyRatingGoodDesc')}</li>
                <li><strong className="text-(--mc-text-secondary)">{ta('easy')}:</strong> {ta('studyRatingEasyDesc')}</li>
              </ul>
            </details>
            </div>
          </>
        )}
      </div>

      {reviewError && (
        <p className="text-sm text-(--mc-accent-danger)" role="alert">{reviewError}</p>
      )}

      {editingCard && (
        <div
          data-testid="edit-modal-overlay"
          className="fixed inset-0 z-50 flex items-center justify-center bg-(--mc-overlay)"
          role="dialog"
          aria-modal="true"
          aria-labelledby="study-edit-card-title"
          onClick={closeEditModal}
        >
          <div
            className="mx-4 w-full max-w-xl rounded-xl border border-(--mc-border-subtle) bg-(--mc-bg-surface) p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="study-edit-card-title" className="text-lg font-semibold text-(--mc-text-primary)">
              {ta('editCardTitle')}
            </h3>
            <form onSubmit={handleEditCardSubmit} className="mt-3">
              <CardFormFields
                idPrefix="study-edit"
                recto={editRecto}
                verso={editVerso}
                comment={editComment}
                onRectoChange={setEditRecto}
                onVersoChange={setEditVerso}
                onCommentChange={setEditComment}
                t={ta}
              />
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
    </div>
  );
}
