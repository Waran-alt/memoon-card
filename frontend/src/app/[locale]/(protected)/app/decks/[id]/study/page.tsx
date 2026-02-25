'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useLocale } from 'i18n';
import apiClient, { getApiErrorMessage, isRequestCancelled } from '@/lib/api';
import type { Deck, Card, ReviewResult } from '@/types';
import type { Rating } from '@/types';
import { useTranslation } from '@/hooks/useTranslation';

const SESSION_NEW_LIMIT = 20;
const SESSION_MAX = 50; // cap a single session so it’s not endless

/** Inject one "easy" (higher R) due card every N cards to break long runs of hard cards */
const EASY_INJECTION_INTERVAL = 5;
/** First HARD_RATIO of due list (already sorted by R asc) = hard pool, rest = easy pool */
const HARD_RATIO = 0.6;
/** Max new cards allowed in one session (cap) */
const NEW_CARDS_PER_SESSION_MAX = 10;
/** Insert one new card every M due cards (light interleave). 0 = append all new at end. */
const NEW_INTERLEAVE_EVERY = 10;

const LAST_STUDIED_KEY = (deckId: string) => `memoon_last_studied_${deckId}`;

/**
 * Interleave easy cards into the due list. Due is sorted by R ascending (hardest first).
 * We split by position: first HARD_RATIO = hard, rest = easy; then every EASY_INJECTION_INTERVAL inject one easy.
 */
function interleaveEasyCards(due: Card[]): Card[] {
  if (due.length <= EASY_INJECTION_INTERVAL) return [...due];
  const hardCount = Math.max(1, Math.floor(due.length * HARD_RATIO));
  const hardPool = due.slice(0, hardCount);
  const easyPool = due.slice(hardCount);
  if (easyPool.length === 0) return [...hardPool];
  const result: Card[] = [];
  let hi = 0;
  let ei = 0;
  let count = 0;
  while (hi < hardPool.length || ei < easyPool.length) {
    if (count > 0 && count % EASY_INJECTION_INTERVAL === 0 && ei < easyPool.length) {
      result.push(easyPool[ei++]);
    } else if (hi < hardPool.length) {
      result.push(hardPool[hi++]);
    } else {
      result.push(easyPool[ei++]);
    }
    count += 1;
  }
  return result;
}

/**
 * Cap new cards and optionally interleave with due. When NEW_INTERLEAVE_EVERY > 0, insert one new card every M due cards.
 */
function mergeNewWithDue(interleavedDue: Card[], extraNew: Card[]): Card[] {
  const capped = extraNew.slice(0, NEW_CARDS_PER_SESSION_MAX);
  if (NEW_INTERLEAVE_EVERY <= 0 || capped.length === 0) {
    return [...interleavedDue, ...capped].slice(0, SESSION_MAX);
  }
  const result: Card[] = [];
  let di = 0;
  let ni = 0;
  let dueCount = 0;
  while (di < interleavedDue.length || ni < capped.length) {
    while (dueCount < NEW_INTERLEAVE_EVERY && di < interleavedDue.length) {
      result.push(interleavedDue[di++]);
      dueCount += 1;
    }
    if (ni < capped.length) {
      result.push(capped[ni++]);
      dueCount = 0;
    } else if (di < interleavedDue.length) {
      result.push(interleavedDue[di++]);
      dueCount += 1;
    }
  }
  return result.slice(0, SESSION_MAX);
}

const RATING_VALUES: Rating[] = [1, 2, 3, 4];
type RatingStats = Record<Rating, number>;
const INITIAL_RATING_STATS: RatingStats = { 1: 0, 2: 0, 3: 0, 4: 0 };
type StudyIntensityMode = 'light' | 'default' | 'intensive';
type StudyEventType =
  | 'session_start'
  | 'session_end'
  | 'card_shown'
  | 'answer_revealed'
  | 'rating_submitted'
  | 'importance_toggled';

function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds.toString().padStart(2, '0')}s`;
}

function formatShort(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export default function StudyPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { locale } = useLocale();
  const { t: tc } = useTranslation('common', locale);
  const { t: ta } = useTranslation('app', locale);
  const id = typeof params.id === 'string' ? params.id : '';
  const atRiskOnly = searchParams.get('atRiskOnly') === 'true' || searchParams.get('atRiskOnly') === '1';
  const [deck, setDeck] = useState<Deck | null>(null);
  const [queue, setQueue] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAnswer, setShowAnswer] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [reviewError, setReviewError] = useState('');
  const [reviewedCount, setReviewedCount] = useState(0);
  const [ratingStats, setRatingStats] = useState<RatingStats>(INITIAL_RATING_STATS);
  const [sessionStartedAt] = useState(() => Date.now());
  const [cardStartedAt, setCardStartedAt] = useState(() => Date.now());
  const [tick, setTick] = useState(0);
  const sessionCardIdsRef = useRef<string[]>([]);
  const reviewedCardIdsRef = useRef<string[]>([]);
  const sessionIdRef = useRef<string | null>(null);
  const revealedAtRef = useRef<number | null>(null);
  const sequenceRef = useRef(0);
  const [intensityMode, setIntensityMode] = useState<StudyIntensityMode>('default');
  const [needManagement, setNeedManagement] = useState(false);
  const [showFlagMenu, setShowFlagMenu] = useState(false);
  const [flagCustomReason, setFlagCustomReason] = useState('');
  const [flagSubmitting, setFlagSubmitting] = useState(false);
  const [showingReview, setShowingReview] = useState(false);
  const [lastReviewResult, setLastReviewResult] = useState<ReviewResult | null>(null);
  const [lastRating, setLastRating] = useState<Rating | null>(null);

  const nextSequence = useCallback(() => {
    sequenceRef.current += 1;
    return sequenceRef.current;
  }, []);

  const emitStudyEvent = useCallback((
    eventType: StudyEventType,
    payload?: Record<string, unknown>,
    cardId?: string
  ) => {
    const sessionId = sessionIdRef.current ?? undefined;
    const occurredAtClient = Date.now();
    const sequenceInSession = nextSequence();
    void apiClient.post('/api/study/events', {
      events: [
        {
          eventType,
          clientEventId: crypto.randomUUID(),
          sessionId,
          deckId: id,
          cardId,
          occurredAtClient,
          sequenceInSession,
          payload,
        },
      ],
    }).catch(() => {
      // best effort telemetry
    });
  }, [id, nextSequence]);

  const currentCardId = queue[0]?.id;
  const queueSize = queue.length;

  useEffect(() => {
    if (currentCardId) {
      setCardStartedAt(Date.now());
      revealedAtRef.current = null;
      setNeedManagement(false);
      setShowFlagMenu(false);
      setFlagCustomReason('');
      emitStudyEvent('card_shown', { queueSize }, currentCardId);
    }
  }, [currentCardId, queueSize, emitStudyEvent]);

  useEffect(() => {
    if (queue.length === 0) return;
    const interval = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(interval);
  }, [queue.length]);

  useEffect(() => {
    if (!id) return;
    const ac = new AbortController();
    const signal = ac.signal;
    setLoading(true);
    setError('');
    const dueUrl = atRiskOnly ? `/api/decks/${id}/cards/due?atRiskOnly=true` : `/api/decks/${id}/cards/due`;
    const requests: [
      Promise<{ data?: { success: boolean; data?: Deck } }>,
      Promise<{ data?: { success: boolean; data?: Card[] } }>,
      Promise<{ data?: { success: boolean; data?: Card[] } }> | null
    ] = [
      apiClient.get<{ success: boolean; data?: Deck }>(`/api/decks/${id}`, { signal }),
      apiClient.get<{ success: boolean; data?: Card[] }>(dueUrl, { signal }),
      atRiskOnly ? null : apiClient.get<{ success: boolean; data?: Card[] }>(`/api/decks/${id}/cards/new?limit=${SESSION_NEW_LIMIT}`, { signal }),
    ];
    const promise = requests[2] != null
      ? Promise.all([requests[0], requests[1], requests[2]]).then(([deckRes, dueRes, newRes]) => ({
          deckRes,
          dueRes,
          newCards: newRes?.data?.success && Array.isArray(newRes.data.data) ? newRes.data.data : [],
        }))
      : Promise.all([requests[0], requests[1]]).then(([deckRes, dueRes]) => ({
          deckRes,
          dueRes,
          newCards: [] as Card[],
        }));
    promise
      .then(({ deckRes, dueRes, newCards }) => {
        if (!deckRes.data?.success || !deckRes.data.data) {
          setError(ta('deckNotFound'));
          return;
        }
        setDeck(deckRes.data.data);
        const due = dueRes.data?.success && Array.isArray(dueRes.data.data) ? dueRes.data.data : [];
        const interleavedDue = interleaveEasyCards(due);
        const seen = new Set(interleavedDue.map((c) => c.id));
        const extraNew = newCards.filter((c) => !seen.has(c.id));
        const combined = mergeNewWithDue(interleavedDue, extraNew);
        sessionCardIdsRef.current = combined.map((c) => c.id);
        reviewedCardIdsRef.current = [];
        sessionIdRef.current = combined.length > 0 ? crypto.randomUUID() : null;
        sequenceRef.current = 0;
        setQueue(combined);
        if (combined.length > 0) {
          emitStudyEvent('session_start', { cardCount: combined.length });
        }
      })
      .catch((err) => {
        if (!isRequestCancelled(err)) setError(getApiErrorMessage(err, ta('failedLoadCards')));
      })
      .finally(() => setLoading(false));
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, atRiskOnly]);

  useEffect(() => {
    if (!id) return;
    apiClient
      .get<{ success: boolean; data?: { intensityMode?: StudyIntensityMode } }>('/api/cards/settings/study-intensity')
      .then((res) => {
        if (res.data?.success && res.data.data?.intensityMode) {
          setIntensityMode(res.data.data.intensityMode);
        }
      })
      .catch(() => {
        // keep default
      });
  }, [id]);

  function goToDeck() {
    try {
      const ids = reviewedCardIdsRef.current;
      if (ids?.length && typeof window !== 'undefined') {
        window.sessionStorage.setItem(LAST_STUDIED_KEY(id), JSON.stringify({ ids, at: Date.now() }));
      }
    } catch {
      // ignore
    }
    emitStudyEvent('session_end', { reviewedCount });
    router.push(`/${locale}/app/decks/${id}`);
  }

  function goToStudySessions() {
    emitStudyEvent('session_end', { reviewedCount });
    router.push(`/${locale}/app/study-sessions`);
  }

  function goToStudyHealth() {
    emitStudyEvent('session_end', { reviewedCount });
    router.push(`/${locale}/app/study-health`);
  }

  function goToManageCard(cardId: string) {
    router.push(`/${locale}/app/decks/${id}?manageCard=${cardId}`);
  }

  const MANAGEMENT_REASONS: { value: string; labelKey: string }[] = [
    { value: 'wrong_content', labelKey: 'needManagementReasonWrongContent' },
    { value: 'duplicate', labelKey: 'needManagementReasonDuplicate' },
    { value: 'typo', labelKey: 'needManagementReasonTypo' },
    { value: 'need_split', labelKey: 'needManagementReasonNeedSplit' },
    { value: 'other', labelKey: 'needManagementReasonOther' },
  ];

  async function handleSubmitFlag(reasonValue: string) {
    const c = queue[0];
    if (!c || flagSubmitting) return;
    setFlagSubmitting(true);
    const finalReason = reasonValue === 'other' ? flagCustomReason.trim() || 'other' : reasonValue;
    try {
      await apiClient.post(`/api/cards/${c.id}/flag`, {
        reason: finalReason.slice(0, 50),
        note: flagCustomReason.trim() || undefined,
        sessionId: sessionIdRef.current ?? undefined,
      });
      setShowFlagMenu(false);
      setFlagCustomReason('');
    } catch {
      // best effort
    } finally {
      setFlagSubmitting(false);
    }
  }

  function handleRate(rating: Rating) {
    const card = queue[0];
    if (!card || submitting) return;
    setSubmitting(true);
    setReviewError('');
    const shownAt = cardStartedAt;
    const revealedAt = revealedAtRef.current ?? undefined;
    const sessionId = sessionIdRef.current ?? undefined;
    const payload: {
      rating: Rating;
      shownAt?: number;
      revealedAt?: number;
      sessionId?: string;
      sequenceInSession?: number;
      clientEventId?: string;
      intensityMode?: StudyIntensityMode;
    } = {
      rating,
      ...(shownAt && { shownAt }),
      ...(revealedAt && { revealedAt }),
      ...(sessionId && { sessionId }),
      sequenceInSession: nextSequence(),
      clientEventId: crypto.randomUUID(),
      intensityMode,
    };
    apiClient
      .post<{ success: boolean; data?: ReviewResult }>(`/api/cards/${card.id}/review`, payload)
      .then((res) => {
        const result = res.data?.data;
        reviewedCardIdsRef.current = [...reviewedCardIdsRef.current, card.id];
        setLastReviewResult(result ?? null);
        setLastRating(rating);
        setShowingReview(true);
      })
      .catch(() => {
        setReviewError(ta('failedSaveReview'));
      })
      .finally(() => setSubmitting(false));
  }

  function handleDismissReview() {
    const result = lastReviewResult;
    const rating = lastRating;
    setLastReviewResult(null);
    setLastRating(null);
    setShowingReview(false);
    setShowAnswer(false);
    if (result == null || rating == null) return;
    setQueue((prev) => (prev.length === 0 ? prev : prev.slice(1)));
    setReviewedCount((n) => n + 1);
    setRatingStats((prev) => ({ ...prev, [rating]: prev[rating] + 1 }));
  }

  function handleToggleImportant() {
    const card = queue[0];
    if (!card) return;
    const nextImportant = !card.is_important;
    void apiClient
      .patch<{ success: boolean; data?: Card }>(`/api/cards/${card.id}/importance`, {
        isImportant: nextImportant,
      })
      .then((res) => {
        const updated = res.data?.data;
        if (!updated) return;
        setQueue((prev) => prev.map((c) => (c.id === updated.id ? { ...c, is_important: updated.is_important } : c)));
        emitStudyEvent('importance_toggled', { isImportant: updated.is_important }, card.id);
      })
      .catch(() => {
        // non-blocking action
      });
  }

  function handleIntensityModeChange(nextMode: StudyIntensityMode) {
    setIntensityMode(nextMode);
    void apiClient
      .put('/api/cards/settings/study-intensity', { intensityMode: nextMode })
      .catch(() => {
        // keep optimistic UI
      });
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

  const card = queue[0];
  const sessionDone = queue.length === 0 && reviewedCount > 0;
  const noCards = queue.length === 0 && reviewedCount === 0;

  if (noCards) {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={goToDeck}
          className="text-sm font-medium text-[var(--mc-text-secondary)] hover:text-[var(--mc-text-primary)]"
        >
          ← {ta('backToDeck')}
        </button>
        <div className="mc-study-surface rounded-xl border p-8 text-center shadow-sm">
          <p className="text-[var(--mc-text-primary)]">{ta('noCardsToStudy')}</p>
          <p className="mt-1 text-sm text-[var(--mc-text-secondary)]">
            {ta('addCardsOrComeBack')}
          </p>
          <button
            type="button"
            onClick={goToDeck}
            className="mt-4 inline-block rounded bg-[var(--mc-accent-success)] px-4 pt-1.5 pb-2 text-sm font-medium text-white hover:opacity-90"
          >
            {ta('backToDeck')}
          </button>
        </div>
      </div>
    );
  }

  if (sessionDone) {
    const total = Math.max(1, reviewedCount);
    const goodOrEasy = ratingStats[3] + ratingStats[4];
    const confidencePercent = Math.round((goodOrEasy / total) * 100);
    const elapsedSeconds = Math.max(0, Math.floor((Date.now() - sessionStartedAt) / 1000));
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={goToDeck}
          className="text-sm font-medium text-[var(--mc-text-secondary)] hover:text-[var(--mc-text-primary)]"
        >
          ← {ta('backToDeck')}
        </button>
        <div className="mc-study-surface rounded-xl border p-8 text-center shadow-sm">
          <p className="font-medium text-[var(--mc-text-primary)]">{ta('sessionComplete')}</p>
          <p className="mt-1 text-sm text-[var(--mc-text-secondary)]">
            {ta('reviewedCount', { count: reviewedCount })}
          </p>
          <p className="mt-1 text-sm text-[var(--mc-text-secondary)]">
            Session confidence: {confidencePercent}% ({ta('good')} + {ta('easy')})
          </p>
          <p className="mt-1 text-sm text-[var(--mc-text-secondary)]">Time spent: {formatDuration(elapsedSeconds)}</p>
          <div className="mt-4 grid grid-cols-2 gap-2 text-left text-sm sm:grid-cols-4">
            <div className="rounded border border-[var(--mc-accent-danger)/40] bg-[var(--mc-accent-danger)/10] px-3 pt-1.5 pb-2">
              <p className="text-[var(--mc-accent-danger)]">{ta('again')}</p>
              <p className="font-medium text-[var(--mc-text-primary)]">{ratingStats[1]}</p>
            </div>
            <div className="rounded border border-[var(--mc-accent-warning)/40] bg-[var(--mc-accent-warning)/10] px-3 pt-1.5 pb-2">
              <p className="text-[var(--mc-accent-warning)]">{ta('hard')}</p>
              <p className="font-medium text-[var(--mc-text-primary)]">{ratingStats[2]}</p>
            </div>
            <div className="rounded border border-[var(--mc-border-subtle)] bg-[var(--mc-bg-surface)] px-3 pt-1.5 pb-2">
              <p className="text-[var(--mc-text-secondary)]">{ta('good')}</p>
              <p className="font-medium text-[var(--mc-text-primary)]">{ratingStats[3]}</p>
            </div>
            <div className="rounded border border-[var(--mc-accent-success)/40] bg-[var(--mc-accent-success)]/10 px-3 pt-1.5 pb-2">
              <p className="text-[var(--mc-accent-success)]">{ta('easy')}</p>
              <p className="font-medium text-[var(--mc-text-primary)]">{ratingStats[4]}</p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={goToDeck}
              className="inline-block rounded bg-[var(--mc-accent-primary)] px-4 pt-1.5 pb-2 text-sm font-medium text-white hover:opacity-90"
            >
              {ta('manageReviewedCardsCount', { vars: { count: String(reviewedCount) } })}
            </button>
            <button
              type="button"
              onClick={goToDeck}
              className="inline-block rounded border border-[var(--mc-border-subtle)] px-4 pt-1.5 pb-2 text-sm font-medium text-[var(--mc-text-secondary)] hover:bg-[var(--mc-bg-card-back)]"
            >
              {ta('backToDeck')}
            </button>
            <button
              type="button"
              onClick={goToStudySessions}
              className="inline-block rounded border border-[var(--mc-border-subtle)] px-4 pt-1.5 pb-2 text-sm font-medium text-[var(--mc-text-secondary)] hover:bg-[var(--mc-bg-card-back)]"
            >
              {ta('viewStudySessions')}
            </button>
            <button
              type="button"
              onClick={goToStudyHealth}
              className="inline-block rounded border border-[var(--mc-border-subtle)] px-4 pt-1.5 pb-2 text-sm font-medium text-[var(--mc-text-secondary)] hover:bg-[var(--mc-bg-card-back)]"
            >
              {ta('viewStudyHealthDashboard')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mc-study-page mx-auto max-w-2xl space-y-6">
      {/* Focus anchor: peripheral elements are visually de-emphasized while studying */}
      <div className="flex items-center justify-between gap-3 opacity-70 transition-opacity duration-200">
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={goToDeck}
            className="text-sm font-medium text-[var(--mc-text-secondary)] hover:text-[var(--mc-text-primary)]"
          >
            ← {ta('exitStudy')}
          </button>
          {reviewedCount > 0 && (
            <button
              type="button"
              onClick={goToDeck}
              className="text-sm text-[var(--mc-accent-primary)] hover:underline"
            >
              {ta('manageReviewedCards')} ({reviewedCount})
            </button>
          )}
        </div>
        <div className="flex min-w-0 flex-1 items-center justify-end gap-2 text-sm text-[var(--mc-text-secondary)]">
          <select
            value={intensityMode}
            onChange={(e) => handleIntensityModeChange(e.target.value as StudyIntensityMode)}
            className="rounded border border-[var(--mc-border-subtle)] bg-[var(--mc-bg-surface)] px-2 py-1 text-xs"
            title={ta('studyIntensityDefault')}
          >
            <option value="light">{ta('studyIntensityLight')}</option>
            <option value="default">{ta('studyIntensityDefault')}</option>
            <option value="intensive">{ta('studyIntensityIntensive')}</option>
          </select>
          <span>
            {ta('leftReviewed', {
              vars: {
                left: queue.length,
                reviewed: reviewedCount,
                leftLabel: ta('cardsLeft', { count: queue.length }),
                reviewedLabel: ta('cardsReviewed', { count: reviewedCount }),
              },
            })}
          </span>
          <span className="tabular-nums" title={ta('timeOnCard')}>
            {formatShort(Math.max(0, Math.floor((Date.now() - cardStartedAt) / 1000)))}
          </span>
          <span className="tabular-nums" title={ta('timeSession')}>
            {formatShort(Math.max(0, Math.floor((Date.now() - sessionStartedAt) / 1000)))}
          </span>
        </div>
      </div>

      {showingReview && lastReviewResult ? (
        <div className="min-h-[280px] rounded-xl border border-[var(--mc-border-subtle)] bg-[var(--mc-bg-surface)] p-8 shadow-sm flex flex-col justify-center items-center gap-4">
          {lastReviewResult.learningState && (
            <p className="text-sm text-[var(--mc-text-secondary)] text-center">
              {lastReviewResult.learningState.phase === 'learning' && (
                <>
                  {ta('studyReviewLearning')}
                  {lastReviewResult.learningState.nextReviewTomorrow
                    ? ` · ${ta('studyReviewNextTomorrow')}`
                    : lastReviewResult.learningState.nextReviewInMinutes != null
                      ? ` · ${ta('studyReviewNextInMin', { vars: { min: String(lastReviewResult.learningState.nextReviewInMinutes) } })}`
                      : ''}
              </>
              )}
              {lastReviewResult.learningState.phase === 'graduated' && (
                <>
                  {ta('studyReviewGraduated')}
                  {lastReviewResult.learningState.nextReviewInDays != null && (
                    <> · {lastReviewResult.learningState.nextReviewInDays >= 1
                      ? ta('studyReviewNextInDays', { vars: { days: String(Math.round(lastReviewResult.learningState.nextReviewInDays)) } })
                      : ta('studyReviewNextInMin', { vars: { min: String(Math.round((lastReviewResult.learningState.nextReviewInDays ?? 0) * 24 * 60)) } })}
                    </>
                  )}
                </>
              )}
            </p>
          )}
          {!lastReviewResult.learningState && (
            <p className="text-sm text-[var(--mc-text-secondary)] text-center">{lastReviewResult.message}</p>
          )}
          <button
            type="button"
            onClick={handleDismissReview}
            className="rounded-lg bg-[var(--mc-accent-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            {ta('studyReviewNext')}
          </button>
        </div>
      ) : (
      <div
        className={`min-h-[280px] rounded-xl border p-8 shadow-sm transition-all duration-200 flex flex-col ${
          showAnswer ? 'mc-study-card-back' : 'mc-study-card-front'
        }`}
      >
        <div className="flex justify-end">
          <label className="flex items-center gap-2 text-sm text-[var(--mc-text-secondary)]">
            <input
              type="checkbox"
              checked={needManagement}
              onChange={(e) => setNeedManagement(e.target.checked)}
              className="rounded border-[var(--mc-border-subtle)]"
            />
            {ta('needManagement')}
          </label>
        </div>
        <div className="flex flex-1 flex-col justify-center">
          <p className="whitespace-pre-wrap text-lg leading-relaxed text-[var(--mc-text-primary)]">
            {showAnswer ? card.verso : card.recto}
          </p>
          {card.comment && showAnswer && (
            <p className="mt-3 text-sm text-[var(--mc-text-secondary)]">{card.comment}</p>
          )}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleToggleImportant}
            className="rounded border border-[var(--mc-border-subtle)] px-2 py-1 text-xs text-[var(--mc-text-secondary)] hover:bg-[var(--mc-bg-card-back)]"
          >
            {card.is_important ? ta('importantCard') : ta('markAsImportant')}
          </button>
          {needManagement && showAnswer && (
            <>
              <button
                type="button"
                onClick={() => setShowFlagMenu(!showFlagMenu)}
                className="rounded border border-[var(--mc-accent-warning)/50] px-2 py-1 text-xs text-[var(--mc-accent-warning)] hover:bg-[var(--mc-accent-warning)/10]"
              >
                {ta('addNote')}
              </button>
              <button
                type="button"
                onClick={() => goToManageCard(card.id)}
                className="rounded border border-[var(--mc-accent-primary)] px-2 py-1 text-xs text-[var(--mc-accent-primary)] hover:bg-[var(--mc-accent-primary)/10]"
              >
                {ta('immediateManagement')}
              </button>
            </>
          )}
        </div>
        {showFlagMenu && needManagement && showAnswer && (
          <div className="mt-3 rounded border border-[var(--mc-border-subtle)] bg-[var(--mc-bg-surface)] p-3">
            <p className="mb-2 text-xs font-medium text-[var(--mc-text-secondary)]">{ta('managementReason')}</p>
            <div className="flex flex-wrap gap-2">
              {MANAGEMENT_REASONS.map(({ value, labelKey }) => (
                <button
                  key={value}
                  type="button"
                  disabled={flagSubmitting}
                  onClick={() => handleSubmitFlag(value)}
                  className="rounded border border-[var(--mc-border-subtle)] px-2 py-1 text-xs hover:bg-[var(--mc-bg-card-back)] disabled:opacity-50"
                >
                  {ta(labelKey)}
                </button>
              ))}
            </div>
            <input
              type="text"
              value={flagCustomReason}
              onChange={(e) => setFlagCustomReason(e.target.value)}
              placeholder={ta('managementReasonCustomPlaceholder')}
              className="mt-2 w-full rounded border border-[var(--mc-border-subtle)] bg-[var(--mc-bg-surface)] px-2 py-1 text-sm text-[var(--mc-text-primary)]"
            />
          </div>
        )}
      </div>
      )}

      {!showingReview && (
        <>
      {reviewError && (
        <p className="text-sm text-[var(--mc-accent-danger)]" role="alert">
          {reviewError}
        </p>
      )}
      <div className="flex flex-col gap-3">
        {!showAnswer ? (
          <button
            type="button"
            onClick={() => {
              revealedAtRef.current = Date.now();
              setShowAnswer(true);
              emitStudyEvent('answer_revealed', { elapsedMs: Date.now() - cardStartedAt }, card.id);
            }}
            className="w-full rounded-lg border-2 border-[var(--mc-border-subtle)] py-3 text-sm font-medium text-[var(--mc-text-primary)] hover:bg-[var(--mc-bg-card-back)] transition-colors duration-200"
          >
            {ta('showAnswer')}
          </button>
        ) : (
          <div className="grid grid-cols-4 gap-2">
            {RATING_VALUES.map((value) => (
              <button
                key={value}
                type="button"
                disabled={submitting}
                onClick={() => handleRate(value as Rating)}
                className={`rounded-lg border py-3 text-sm font-medium transition-colors duration-200 ${
                  value === 1
                    ? 'border-[var(--mc-accent-danger)/50] bg-[var(--mc-accent-danger)/10] text-[var(--mc-accent-danger)] hover:bg-[var(--mc-accent-danger)/20]'
                    : value === 2
                      ? 'border-[var(--mc-accent-warning)/50] bg-[var(--mc-accent-warning)/10] text-[var(--mc-accent-warning)] hover:bg-[var(--mc-accent-warning)/20]'
                      : value === 4
                        ? 'border-[var(--mc-accent-success)/50] bg-[var(--mc-accent-success)/10] text-[var(--mc-accent-success)] hover:bg-[var(--mc-accent-success)/20]'
                        : 'border-[var(--mc-border-subtle)] bg-[var(--mc-bg-surface)] text-[var(--mc-text-primary)] hover:bg-[var(--mc-bg-card-back)]'
                } disabled:opacity-50`}
              >
                {value === 1
                  ? ta('again')
                  : value === 2
                    ? ta('hard')
                    : value === 3
                      ? ta('good')
                      : ta('easy')}
              </button>
            ))}
          </div>
        )}
      </div>
        </>
      )}
    </div>
  );
}
