'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useLocale } from 'i18n';
import apiClient, { getApiErrorMessage, isRequestCancelled } from '@/lib/api';
import type { Deck, Card, ReviewResult } from '@/types';
import type { Rating } from '@/types';
import { useTranslation } from '@/hooks/useTranslation';
import { useStudyReinsertion } from '@/hooks/useStudyReinsertion';
import { useConnectionState } from '@/hooks/useConnectionState';
import {
  retryWithBackoff,
  addToPendingQueue,
  getPendingCount,
  flushPendingQueue,
  buildStudyEventsBody,
  type StudyEventPayload,
} from '@/lib/studySync';
import { parseSessionSize, getSessionLimit, type SessionSizeKey } from '@/lib/sessionSize';
import { useUserStudySettings } from '@/hooks/useUserStudySettings';
import { STUDY_INTERVAL } from '@memoon-card/shared';

const REINSERT_CHECK_MS = 15_000;
const STUDY_EVENTS_URL = '/api/study/events';
/** Below this (ms), tab hidden is ignored. Above: session pauses; above user threshold: session ends. */
const PAUSE_GRACE_MS = 5000;
/** Minimum time (ms) between showing the two cards of a reverse pair; uses STUDY_INTERVAL.MIN_INTERVAL_MINUTES. */
const REVERSE_PAIR_MIN_TIME_MS = STUDY_INTERVAL.MIN_INTERVAL_MINUTES * 60 * 1000;

const STUDY_SESSION_STORAGE_KEY_PREFIX = 'memoon_study_session_';
const STUDY_SESSION_MAX_AGE_MS = 2 * 60 * 60 * 1000; // 2 hours

interface SavedStudySession {
  deckId: string;
  sessionId: string;
  reviewedCardIds: string[];
  queue: Card[];
  reviewedCount: number;
  sessionSize: SessionSizeKey;
  savedAt: number;
}

function getSavedStudySession(deckId: string): SavedStudySession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(`${STUDY_SESSION_STORAGE_KEY_PREFIX}${deckId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SavedStudySession;
    if (parsed.savedAt < Date.now() - STUDY_SESSION_MAX_AGE_MS) return null;
    if (parsed.deckId !== deckId || !Array.isArray(parsed.queue) || !Array.isArray(parsed.reviewedCardIds)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveStudySession(
  deckId: string,
  sessionId: string,
  reviewedCardIds: string[],
  queue: Card[],
  reviewedCount: number,
  sessionSize: SessionSizeKey
): void {
  if (typeof window === 'undefined') return;
  try {
    const state: SavedStudySession = {
      deckId,
      sessionId,
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

function clearStudySession(deckId: string): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(`${STUDY_SESSION_STORAGE_KEY_PREFIX}${deckId}`);
  } catch {
    // ignore
  }
}

/** Normalize review response: support both camelCase and snake_case learning state for API compatibility. */
function getLearningNextReviewMinutes(result: unknown): number | null {
  if (result == null || typeof result !== 'object') return null;
  const r = result as Record<string, unknown>;
  const learning = (r.learningState ?? r.learning_state) as Record<string, unknown> | undefined;
  if (!learning || typeof learning !== 'object') return null;
  if (learning.phase !== 'learning') return null;
  const min = learning.nextReviewInMinutes ?? learning.next_review_in_minutes;
  return typeof min === 'number' && min >= 0 ? min : null;
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

/** True if two cards form a reverse pair (same content, recto/verso swapped). */
function isReversePair(a: Card, b: Card): boolean {
  return !!(a && b && (a.reverse_card_id === b.id || b.reverse_card_id === a.id));
}

/**
 * Reorder queue so the two cards of each reverse pair are in different halves of the queue.
 * Avoids reviewing the same information (recto/verso) twice in quick succession and getting inflated intervals.
 */
function separateReversedPairs(queue: Card[]): Card[] {
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
        if (isReversePair(arr[i], arr[j])) {
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
  const [showAnswer, setShowAnswer] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [reviewError, setReviewError] = useState('');
  const [reviewedCount, setReviewedCount] = useState(0);
  const sessionIdRef = useRef(crypto.randomUUID());
  const sequenceRef = useRef(0);
  const reviewedCardIdsRef = useRef<string[]>([]);
  /** When each card was last shown (for reverse-pair 1‑min gap). */
  const lastShownAtRef = useRef<Record<string, number>>({});
  /** Delay (ms) before considering a card "actually shown" for events and replay. */
  const CARD_SHOWN_CONFIRM_MS = 200;
  const cardShownTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queueRef = useRef<Card[]>([]);
  queueRef.current = queue;

  const reinsertion = useStudyReinsertion<Card>(() => Date.now(), REINSERT_CHECK_MS);
  const injectReadyRef = useRef(reinsertion.injectReadyIntoQueue);
  injectReadyRef.current = reinsertion.injectReadyIntoQueue;

  const { isOnline, hadFailure, setHadFailure } = useConnectionState();
  const [pendingCount, setPendingCount] = useState(0);
  const [extendLoading, setExtendLoading] = useState(false);
  /** When session is done: true = show extend buttons, false = hide, null = still checking */
  const [hasMoreCardsToStudy, setHasMoreCardsToStudy] = useState<boolean | null>(null);
  /** When session is done and we have more cards: number of cards available for extend (used to show only feasible options). */
  const [availableCardsCount, setAvailableCardsCount] = useState<number | null>(null);
  const { awayMinutes, learningMinIntervalMinutes } = useUserStudySettings();

  const [isPaused, setIsPaused] = useState(false);
  const [sessionEndedByAway, setSessionEndedByAway] = useState(false);
  const hiddenAtRef = useRef<number | null>(null);
  const totalPausedMsRef = useRef(0);
  const sessionStartRef = useRef<number | null>(null);

  const sessionSize = parseSessionSize(searchParams.get('sessionSize'));
  const sessionLimit = getSessionLimit(sessionSize);

  const nextSequence = useCallback(() => {
    sequenceRef.current += 1;
    return sequenceRef.current;
  }, []);

  const sendStudyEvents = useCallback(
    async (events: StudyEventPayload[]) => {
      if (events.length === 0) return;
      const body = buildStudyEventsBody(events);
      try {
        await retryWithBackoff(() => apiClient.post(STUDY_EVENTS_URL, body));
        setHadFailure(false);
      } catch {
        setHadFailure(true);
        addToPendingQueue({ type: 'events', url: STUDY_EVENTS_URL, payload: body });
        setPendingCount(getPendingCount());
      }
    },
    [setHadFailure]
  );

  const emitStudyEvent = useCallback(
    (eventType: string, payload?: Record<string, unknown>, cardId?: string) => {
      const event: StudyEventPayload = {
        eventType,
        clientEventId: crypto.randomUUID(),
        sessionId: sessionIdRef.current ?? undefined,
        deckId: id || undefined,
        cardId,
        occurredAtClient: Date.now(),
        sequenceInSession: nextSequence(),
        payload,
      };
      void sendStudyEvents([event]);
    },
    [id, nextSequence, sendStudyEvents]
  );

  const currentCard = queue[0];
  const sessionStartEmittedRef = useRef(false);
  const sessionEndEmittedRef = useRef(false);

  const reversePairMinGapMs = Math.max(
    REVERSE_PAIR_MIN_TIME_MS,
    learningMinIntervalMinutes * 60 * 1000
  );

  useEffect(() => {
    if (queue.length > 0 && !sessionStartEmittedRef.current) {
      sessionStartEmittedRef.current = true;
      emitStudyEvent('session_start', { cardCount: queue.length });
    }
  }, [queue.length, emitStudyEvent]);

  // Emit card_shown and record lastShownAt only after the card has been on screen for CARD_SHOWN_CONFIRM_MS (e.g. 200ms).
  // If the queue is reordered before that (e.g. blocked card swapped), we never emit — the user never saw it.
  useEffect(() => {
    if (cardShownTimeoutRef.current != null) {
      clearTimeout(cardShownTimeoutRef.current);
      cardShownTimeoutRef.current = null;
    }
    if (!currentCard?.id) return;
    const cardId = currentCard.id;
    cardShownTimeoutRef.current = setTimeout(() => {
      cardShownTimeoutRef.current = null;
      if (queueRef.current[0]?.id !== cardId) return;
      emitStudyEvent('card_shown', { queueSize: queueRef.current.length }, cardId);
      lastShownAtRef.current[cardId] = Date.now();
    }, CARD_SHOWN_CONFIRM_MS);
    return () => {
      if (cardShownTimeoutRef.current != null) {
        clearTimeout(cardShownTimeoutRef.current);
        cardShownTimeoutRef.current = null;
      }
    };
  }, [currentCard?.id, emitStudyEvent]);

  // Enforce min time gap between the two cards of a reverse pair (≥ 1 min, or user's Short-FSRS min interval); if no card can be shown, end session
  useEffect(() => {
    if (queue.length === 0) return;
    const now = Date.now();
    const isBlocked = (c: Card) => {
      if (!c.reverse_card_id) return false;
      const t = lastShownAtRef.current[c.reverse_card_id];
      if (t == null) return false;
      return (now - t) < reversePairMinGapMs;
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

  // Session start time for chrono (stops while paused)
  useEffect(() => {
    if (queue.length > 0 && sessionStartRef.current == null) {
      sessionStartRef.current = Date.now();
    }
  }, [queue.length]);

  // Pause/resume/auto-end: < 5s nothing; 5s–threshold pause and offer resume; > threshold end session.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const thresholdMs = awayMinutes * 60 * 1000;
    const handleVisibility = () => {
      const active = queue.length > 0 || reviewedCount > 0;
      if (!active || sessionEndedByAway) return;
      if (document.hidden) {
        hiddenAtRef.current = Date.now();
        emitStudyEvent('tab_hidden', { at: Date.now() });
      } else {
        const hiddenAt = hiddenAtRef.current;
        hiddenAtRef.current = null;
        emitStudyEvent('tab_visible', { at: Date.now() });
        if (hiddenAt == null) return;
        const duration = Date.now() - hiddenAt;
        if (duration < PAUSE_GRACE_MS) return;
        if (duration >= thresholdMs) {
          if (!sessionEndEmittedRef.current) {
            sessionEndEmittedRef.current = true;
            emitStudyEvent('session_end', { reviewedCount, reason: 'away_too_long', awayMs: duration });
          }
          clearStudySession(id);
          setSessionEndedByAway(true);
          return;
        }
        totalPausedMsRef.current += duration;
        setIsPaused(true);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [id, queue.length, reviewedCount, sessionEndedByAway, awayMinutes, emitStudyEvent]);

  useEffect(() => {
    if (!id) return;
    const size = parseSessionSize(searchParams.get('sessionSize'));
    const limit = getSessionLimit(size);
    const ac = new AbortController();
    setLoading(true);
    setError('');

    const saved = getSavedStudySession(id);
    // Only restore if there are still cards to review; otherwise start fresh (avoids showing "session ended" immediately)
    const canRestore = saved && saved.queue.length > 0;
    if (saved && !canRestore) clearStudySession(id);

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
          setQueue(separateReversedPairs(saved.queue));
          setReviewedCount(saved.reviewedCount);
          sessionIdRef.current = saved.sessionId;
          reviewedCardIdsRef.current = saved.reviewedCardIds;
          sessionStartEmittedRef.current = true;
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
        setQueue(separateReversedPairs(shuffleCards(list).slice(0, limit)));
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

  useEffect(() => {
    const interval = setInterval(() => {
      setQueue((prev) => {
        const next = injectReadyRef.current(prev);
        if (next.length === prev.length && (prev.length === 0 || next[0].id === prev[0].id)) return prev;
        return separateReversedPairs(next);
      });
    }, REINSERT_CHECK_MS);
    return () => clearInterval(interval);
  }, []);

  // When session is done, fetch how many cards are available to study (to show extend buttons and only feasible options)
  // Cards blocked by reverse-pair time gap count as 0 (same rule as during session)
  useEffect(() => {
    if (queue.length > 0 || reviewedCount === 0 || !id) {
      if (queue.length > 0) {
        setHasMoreCardsToStudy(null);
        setAvailableCardsCount(null);
      }
      return;
    }
    const excludeIds = reviewedCardIdsRef.current;
    const ac = new AbortController();
    const params = new URLSearchParams({ limit: '50' });
    excludeIds.forEach((cid) => params.append('excludeCardIds', cid));
    const gapMs = Math.max(REVERSE_PAIR_MIN_TIME_MS, learningMinIntervalMinutes * 60 * 1000);
    const isBlocked = (c: Card) => {
      if (!c.reverse_card_id) return false;
      const t = lastShownAtRef.current[c.reverse_card_id];
      if (t == null) return false;
      return (Date.now() - t) < gapMs;
    };
    apiClient
      .get<{ success: boolean; data?: Card[] }>(`/api/decks/${id}/cards/study?${params.toString()}`, { signal: ac.signal })
      .catch(() =>
        apiClient.get<{ success: boolean; data?: Card[] }>(`/api/decks/${id}/cards`, { signal: ac.signal }).then((r) => {
          const cards = r.data?.data ?? [];
          const now = new Date().toISOString();
          const due = cards.filter((c) => c.next_review && c.next_review <= now);
          const newCards = cards.filter((c) => c.stability == null);
          const filtered = [...due, ...newCards].filter((c) => !excludeIds.includes(c.id)).slice(0, 50);
          return { data: { success: true, data: filtered } };
        })
      )
      .then((res) => {
        const list = res.data?.success && Array.isArray(res.data.data) ? res.data.data : [];
        const unblocked = list.filter((c) => !isBlocked(c));
        setHasMoreCardsToStudy(unblocked.length > 0);
        setAvailableCardsCount(unblocked.length);
      })
      .catch(() => {
        setHasMoreCardsToStudy(false);
        setAvailableCardsCount(0);
      });
    return () => ac.abort();
  }, [id, queue.length, reviewedCount, learningMinIntervalMinutes]);

  useEffect(() => {
    if (!id || !deck || (queue.length === 0 && reviewedCount === 0)) return;
    saveStudySession(id, sessionIdRef.current ?? '', reviewedCardIdsRef.current, queue, reviewedCount, sessionSize);
  }, [id, deck, queue, reviewedCount, sessionSize]);

  function goToDeck() {
    if (reviewedCount > 0 && !sessionEndEmittedRef.current) {
      sessionEndEmittedRef.current = true;
      emitStudyEvent('session_end', { reviewedCount });
    }
    clearStudySession(id);
    router.push(`/${locale}/app/decks/${id}`);
  }

  async function extendSession(size: SessionSizeKey) {
    const excludeIds = reviewedCardIdsRef.current;
    const limit = getSessionLimit(size);
    if (limit < 1) return;
    setExtendLoading(true);
    setReviewError('');
    const ac = new AbortController();
    const timeoutId = setTimeout(() => ac.abort(), 15000);
    try {
      const params = new URLSearchParams({ limit: String(limit) });
      excludeIds.forEach((cid) => params.append('excludeCardIds', cid));
      const res = await apiClient.get<{ success: boolean; data?: Card[] }>(
        `/api/decks/${id}/cards/study?${params.toString()}`,
        { signal: ac.signal }
      ).catch(() =>
        apiClient.get<{ success: boolean; data?: Card[] }>(`/api/decks/${id}/cards`, { signal: ac.signal }).then((r) => {
          const cards = r.data?.data ?? [];
          const now = new Date().toISOString();
          const due = cards.filter((c) => c.next_review && c.next_review <= now);
          const newCards = cards.filter((c) => c.stability == null);
          const filtered = [...due, ...newCards].filter((c) => !excludeIds.includes(c.id)).slice(0, limit);
          return { data: { success: true, data: filtered } };
        })
      );
      const list = res.data?.success && Array.isArray(res.data.data) ? res.data.data : [];
      if (list.length > 0) {
        setQueue(separateReversedPairs(shuffleCards(list)));
        setShowAnswer(false);
        setHadFailure(false);
      }
    } catch (err) {
      if (!isRequestCancelled(err)) setReviewError(getApiErrorMessage(err, ta('failedLoadCards')));
    } finally {
      clearTimeout(timeoutId);
      setExtendLoading(false);
    }
  }

  // session_end is emitted only when leaving (goToDeck), not when queue becomes empty, so user can extend

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const flush = () => {
      flushPendingQueue((url, payload) => apiClient.post(url, payload)).then(({ flushed }) => {
        setPendingCount(getPendingCount());
        if (flushed > 0) setHadFailure(false);
      });
    };
    const onOnline = () => flush();
    window.addEventListener('online', onOnline);
    const initialPending = getPendingCount();
    if (initialPending > 0) setPendingCount(initialPending);
    if (navigator.onLine) flush();
    return () => window.removeEventListener('online', onOnline);
  }, [setHadFailure]);

  async function handleSubmitRating(rating: Rating) {
    const card = currentCard;
    if (!card || submitting) return;
    setSubmitting(true);
    setReviewError('');
    const shownAt = Date.now() - 60 * 1000;
    const revealedAt = showAnswer ? Date.now() : undefined;
    const payload = {
      rating,
      shownAt,
      revealedAt,
      sessionId: sessionIdRef.current,
      sequenceInSession: nextSequence(),
      clientEventId: crypto.randomUUID(),
    };
    /* rating_submitted is created by the backend when the review is saved; no client emit to avoid duplicate in session replay */
    try {
      let result: ReviewResult | undefined;
      try {
        result = await retryWithBackoff(() =>
          apiClient.post<{ success: boolean; data?: ReviewResult }>(`/api/cards/${card.id}/review`, payload).then((r) => r.data?.data)
        );
      } catch {
        try {
          const batchRes = await retryWithBackoff(() =>
            apiClient.post<{ success: boolean; data?: ReviewResult[] }>('/api/reviews/batch', {
              reviews: [{ cardId: card.id, rating }],
              sessionId: sessionIdRef.current ?? undefined,
            })
          );
          result = Array.isArray(batchRes.data?.data) ? batchRes.data.data[0] : undefined;
        } catch {
          setHadFailure(true);
          addToPendingQueue({ type: 'review', url: `/api/cards/${card.id}/review`, payload });
          setPendingCount(getPendingCount());
          setReviewError(ta('failedSaveReview'));
          setSubmitting(false);
          return;
        }
      }
      reviewedCardIdsRef.current = [...reviewedCardIdsRef.current, card.id];
      const nextMin = getLearningNextReviewMinutes(result);
      if (nextMin != null) reinsertion.add(card, nextMin);
      setReviewedCount((n) => n + 1);
      setQueue((prev) => {
        const rest = prev.slice(1);
        return reinsertion.injectReadyIntoQueue(rest);
      });
      setShowAnswer(false);
      setHadFailure(false);
    } catch {
      setHadFailure(true);
      addToPendingQueue({ type: 'review', url: `/api/cards/${card.id}/review`, payload });
      setPendingCount(getPendingCount());
      setReviewError(ta('failedSaveReview'));
    } finally {
      setSubmitting(false);
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

  if (sessionEndedByAway) {
    const endedAwayLabel = ta('studySessionEndedAway') !== 'studySessionEndedAway' ? ta('studySessionEndedAway') : 'Session ended';
    const endedAwayHint = ta('studySessionEndedAwayHint') !== 'studySessionEndedAwayHint' ? ta('studySessionEndedAwayHint') : 'You were away for longer than your limit. Progress has been saved.';
    return (
      <div className="mc-study-page mx-auto max-w-2xl space-y-6">
        <div className="mc-study-surface rounded-xl border p-8 text-center shadow-sm">
          <p className="text-lg font-medium text-(--mc-text-primary)">{endedAwayLabel}</p>
          <p className="mt-2 text-sm text-(--mc-text-secondary)">{endedAwayHint}</p>
          <div className="mt-6">
            <button type="button" onClick={goToDeck} className="rounded-lg bg-(--mc-accent-primary) px-4 py-2 text-sm font-medium text-white opacity-90 hover:opacity-100">
              {ta('backToDeck')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (sessionDone) {
    const allExtendOptions: { key: SessionSizeKey; labelKey: string }[] = [
      { key: 'one', labelKey: 'studyExtendOne' },
      { key: 'small', labelKey: 'studyExtendSmall' },
      { key: 'medium', labelKey: 'studyExtendMedium' },
      { key: 'large', labelKey: 'studyExtendLarge' },
    ];
    const count = availableCardsCount ?? 0;
    const extendOptions = allExtendOptions.filter((opt) => getSessionLimit(opt.key) <= count);
    const showExtendButtons = hasMoreCardsToStudy === true && extendOptions.length > 0;
    const checkingExtend = hasMoreCardsToStudy === null;
    const allCardsReviewed = hasMoreCardsToStudy === false;
    return (
      <div className="mc-study-page mx-auto max-w-2xl space-y-6">
        <div className="mc-study-surface rounded-xl border p-8 text-center shadow-sm">
          <p className="text-lg font-medium text-(--mc-text-primary)">{ta('sessionComplete')}</p>
          <p className="mt-2 text-sm text-(--mc-text-secondary)">{ta('reviewedCount', { count: reviewedCount })}</p>
          {allCardsReviewed && (
            <p className="mt-4 text-base font-medium text-(--mc-accent-primary)">{ta('studyAllCardsReviewed')}</p>
          )}
          {showExtendButtons && (
            <>
              <p className="mt-4 text-sm font-medium text-(--mc-text-secondary)">{ta('studyExtendPrompt')}</p>
              <div className="mt-3 flex flex-wrap justify-center gap-2">
                {extendOptions.map(({ key, labelKey }) => {
                  const label =
                    key === 'one'
                      ? ta(labelKey)
                      : ta(labelKey, { vars: { count: String(getSessionLimit(key)) } });
                  const fallback = key === 'one' ? '1 more card' : key.charAt(0).toUpperCase() + key.slice(1);
                  return (
                    <button
                      key={key}
                      type="button"
                      disabled={extendLoading}
                      onClick={() => extendSession(key)}
                      className="rounded-lg border border-(--mc-border-subtle) bg-(--mc-bg-card) px-3 py-2 text-sm font-medium hover:bg-(--mc-bg-elevated) disabled:opacity-50"
                    >
                      {label !== labelKey ? label : fallback}
                    </button>
                  );
                })}
              </div>
              {reviewError && <p className="mt-2 text-sm text-(--mc-accent-danger)" role="alert">{reviewError}</p>}
            </>
          )}
          {checkingExtend && (
            <p className="mt-4 text-sm text-(--mc-text-muted)">{ta('studyExtendChecking') !== 'studyExtendChecking' ? ta('studyExtendChecking') : 'Checking for more cards…'}</p>
          )}
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <button type="button" onClick={goToDeck} className="rounded-lg bg-(--mc-accent-primary) px-4 py-2 text-sm font-medium text-white opacity-90 hover:opacity-100">
              {ta('backToDeck')}
            </button>
            <Link href={`/${locale}/app/study-sessions`} className="rounded-lg border border-(--mc-border-subtle) px-4 py-2 text-sm font-medium hover:bg-(--mc-bg-card)">
              {ta('viewStudySessions')}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const card = currentCard;
  if (!card) return null;

  const showConnectionBanner = !isOnline || pendingCount > 0 || hadFailure;
  const connectionMessage = !isOnline
    ? (ta('offlineWillRetry') !== 'offlineWillRetry' ? ta('offlineWillRetry') : 'Offline. Data will be sent when back online.')
    : (ta('connectionLostWillRetry') !== 'connectionLostWillRetry' ? ta('connectionLostWillRetry') : 'Connection lost — will retry.');

  return (
    <div className="mc-study-page mx-auto max-w-2xl space-y-6 relative">
      {isPaused && (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-(--mc-bg-page)/90 backdrop-blur-sm" role="dialog" aria-label={ta('studyPausedTitle') !== 'studyPausedTitle' ? ta('studyPausedTitle') : 'Session paused'}>
          <div className="mx-4 rounded-xl border border-(--mc-border-subtle) bg-(--mc-bg-card) p-6 text-center shadow-lg">
            <p className="text-lg font-medium text-(--mc-text-primary)">{ta('studyPausedTitle') !== 'studyPausedTitle' ? ta('studyPausedTitle') : 'Session paused'}</p>
            <p className="mt-2 text-sm text-(--mc-text-secondary)">{ta('studyPausedResumeHint') !== 'studyPausedResumeHint' ? ta('studyPausedResumeHint') : 'The timer stopped. Resume to continue.'}</p>
            <button
              type="button"
              onClick={() => setIsPaused(false)}
              className="mt-4 rounded-lg bg-(--mc-accent-primary) px-4 py-2 text-sm font-medium text-white opacity-90 hover:opacity-100"
            >
              {ta('studyResumeSession') !== 'studyResumeSession' ? ta('studyResumeSession') : 'Resume session'}
            </button>
          </div>
        </div>
      )}
      {showConnectionBanner && (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-(--mc-accent-warning)/50 bg-(--mc-accent-warning)/10 px-3 py-2 text-sm text-(--mc-accent-warning)" role="status">
          <span>{connectionMessage}</span>
          {isOnline && (
            <button
              type="button"
              onClick={() => { setHadFailure(false); setPendingCount(getPendingCount()); }}
              className="shrink-0 rounded px-2 py-1 text-xs font-medium hover:bg-(--mc-accent-warning)/20"
            >
              Dismiss
            </button>
          )}
        </div>
      )}
      <div className="flex items-center justify-between gap-3">
        <button type="button" onClick={goToDeck} className="text-sm font-medium text-(--mc-text-secondary) hover:text-(--mc-text-primary)">
          ← {ta('exitStudy')}
        </button>
        <span className="text-sm text-(--mc-text-secondary)">
          {queue.length} left · {reviewedCount} reviewed
        </span>
      </div>

      <div className="min-h-[280px] rounded-xl border p-8 shadow-sm">
        <p className="whitespace-pre-wrap text-lg leading-relaxed text-(--mc-text-primary)">
          {card.recto}
        </p>
        {showAnswer && (
          <>
            <hr className="my-4 border-(--mc-border-subtle)" aria-hidden />
            <p className="whitespace-pre-wrap text-lg leading-relaxed text-(--mc-text-primary)">
              {card.verso}
            </p>
          </>
        )}
        {!showAnswer ? (
          <div className="mt-6">
            <button
              type="button"
              onClick={() => {
                emitStudyEvent('answer_revealed', undefined, card?.id);
                setShowAnswer(true);
              }}
              className="rounded-lg bg-(--mc-accent-primary) px-4 py-2 text-sm font-medium text-white opacity-90 hover:opacity-100"
            >
              {ta('showAnswer')}
            </button>
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            <div className="flex flex-wrap gap-2">
              {([1, 2, 3, 4] as Rating[]).map((r) => (
                <button
                  key={r}
                  type="button"
                  disabled={submitting}
                  onClick={() => handleSubmitRating(r)}
                  className="rounded border border-(--mc-border-subtle) px-3 py-1.5 text-sm font-medium hover:bg-(--mc-bg-card) disabled:opacity-50"
                >
                  {r === 1 ? ta('again') : r === 2 ? ta('hard') : r === 3 ? ta('good') : ta('easy')}
                </button>
              ))}
            </div>
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
        )}
      </div>

      {reviewError && (
        <p className="text-sm text-(--mc-accent-danger)" role="alert">{reviewError}</p>
      )}
    </div>
  );
}
