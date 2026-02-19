'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useLocale } from 'i18n';
import apiClient, { getApiErrorMessage, isRequestCancelled } from '@/lib/api';
import type { Deck, Card, ReviewResult } from '@/types';
import type { Rating } from '@/types';
import { useTranslation } from '@/hooks/useTranslation';

const SESSION_NEW_LIMIT = 20;
const SESSION_MAX = 50; // cap a single session so it’s not endless

const LAST_STUDIED_KEY = (deckId: string) => `memoon_last_studied_${deckId}`;

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
  | 'short_loop_decision'
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
    Promise.all([
      apiClient.get<{ success: boolean; data?: Deck }>(`/api/decks/${id}`, { signal }),
      apiClient.get<{ success: boolean; data?: Card[] }>(`/api/decks/${id}/cards/due`, { signal }),
      apiClient.get<{ success: boolean; data?: Card[] }>(`/api/decks/${id}/cards/new?limit=${SESSION_NEW_LIMIT}`, { signal }),
    ])
      .then(([deckRes, dueRes, newRes]) => {
        if (!deckRes.data?.success || !deckRes.data.data) {
          setError(ta('deckNotFound'));
          return;
        }
        setDeck(deckRes.data.data);
        const due = dueRes.data?.success && Array.isArray(dueRes.data.data) ? dueRes.data.data : [];
        const newCards = newRes.data?.success && Array.isArray(newRes.data.data) ? newRes.data.data : [];
        const seen = new Set(due.map((c) => c.id));
        const extraNew = newCards.filter((c) => !seen.has(c.id));
        const combined = [...due, ...extraNew].slice(0, SESSION_MAX);
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
  }, [id]);

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
        const decision = res.data?.data?.shortLoopDecision;
        reviewedCardIdsRef.current = [...reviewedCardIdsRef.current, card.id];
        setQueue((prev) => {
          const rest = prev.slice(1);
          if (decision?.enabled && decision.action === 'reinsert_today') {
            const insertAt = Math.min(3, rest.length);
            return [...rest.slice(0, insertAt), prev[0], ...rest.slice(insertAt)];
          }
          return rest;
        });
        setShowAnswer(false);
        setReviewedCount((n) => n + 1);
        setRatingStats((prev) => ({ ...prev, [rating]: prev[rating] + 1 }));
      })
      .catch(() => {
        setReviewError(ta('failedSaveReview'));
      })
      .finally(() => setSubmitting(false));
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

  const card = queue[0];
  const sessionDone = queue.length === 0 && reviewedCount > 0;
  const noCards = queue.length === 0 && reviewedCount === 0;

  if (noCards) {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={goToDeck}
          className="text-sm font-medium text-(--mc-text-secondary) hover:text-(--mc-text-primary)"
        >
          ← {ta('backToDeck')}
        </button>
        <div className="mc-study-surface rounded-xl border p-8 text-center shadow-sm">
          <p className="text-(--mc-text-primary)">{ta('noCardsToStudy')}</p>
          <p className="mt-1 text-sm text-(--mc-text-secondary)">
            {ta('addCardsOrComeBack')}
          </p>
          <button
            type="button"
            onClick={goToDeck}
            className="mt-4 inline-block rounded bg-(--mc-accent-success) px-4 py-2 text-sm font-medium text-white hover:opacity-90"
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
          className="text-sm font-medium text-(--mc-text-secondary) hover:text-(--mc-text-primary)"
        >
          ← {ta('backToDeck')}
        </button>
        <div className="mc-study-surface rounded-xl border p-8 text-center shadow-sm">
          <p className="font-medium text-(--mc-text-primary)">{ta('sessionComplete')}</p>
          <p className="mt-1 text-sm text-(--mc-text-secondary)">
            {ta('reviewedCount', { count: reviewedCount })}
          </p>
          <p className="mt-1 text-sm text-(--mc-text-secondary)">
            Session confidence: {confidencePercent}% ({ta('good')} + {ta('easy')})
          </p>
          <p className="mt-1 text-sm text-(--mc-text-secondary)">Time spent: {formatDuration(elapsedSeconds)}</p>
          <div className="mt-4 grid grid-cols-2 gap-2 text-left text-sm sm:grid-cols-4">
            <div className="rounded border border-(--mc-accent-danger)/40 bg-(--mc-accent-danger)/10 px-3 py-2">
              <p className="text-(--mc-accent-danger)">{ta('again')}</p>
              <p className="font-medium text-(--mc-text-primary)">{ratingStats[1]}</p>
            </div>
            <div className="rounded border border-(--mc-accent-warning)/40 bg-(--mc-accent-warning)/10 px-3 py-2">
              <p className="text-(--mc-accent-warning)">{ta('hard')}</p>
              <p className="font-medium text-(--mc-text-primary)">{ratingStats[2]}</p>
            </div>
            <div className="rounded border border-(--mc-border-subtle) bg-(--mc-bg-surface) px-3 py-2">
              <p className="text-(--mc-text-secondary)">{ta('good')}</p>
              <p className="font-medium text-(--mc-text-primary)">{ratingStats[3]}</p>
            </div>
            <div className="rounded border border-(--mc-accent-success)/40 bg-(--mc-accent-success)/10 px-3 py-2">
              <p className="text-(--mc-accent-success)">{ta('easy')}</p>
              <p className="font-medium text-(--mc-text-primary)">{ratingStats[4]}</p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={goToDeck}
              className="inline-block rounded bg-(--mc-accent-primary) px-4 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              {ta('manageReviewedCardsCount', { vars: { count: String(reviewedCount) } })}
            </button>
            <button
              type="button"
              onClick={goToDeck}
              className="inline-block rounded border border-(--mc-border-subtle) px-4 py-2 text-sm font-medium text-(--mc-text-secondary) hover:bg-(--mc-bg-card-back)"
            >
              {ta('backToDeck')}
            </button>
            <button
              type="button"
              onClick={goToStudySessions}
              className="inline-block rounded border border-(--mc-border-subtle) px-4 py-2 text-sm font-medium text-(--mc-text-secondary) hover:bg-(--mc-bg-card-back)"
            >
              {ta('viewStudySessions')}
            </button>
            <button
              type="button"
              onClick={goToStudyHealth}
              className="inline-block rounded border border-(--mc-border-subtle) px-4 py-2 text-sm font-medium text-(--mc-text-secondary) hover:bg-(--mc-bg-card-back)"
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
            className="text-sm font-medium text-(--mc-text-secondary) hover:text-(--mc-text-primary)"
          >
            ← {ta('exitStudy')}
          </button>
          {reviewedCount > 0 && (
            <button
              type="button"
              onClick={goToDeck}
              className="text-sm text-(--mc-accent-primary) hover:underline"
            >
              {ta('manageReviewedCards')} ({reviewedCount})
            </button>
          )}
        </div>
        <div className="flex min-w-0 flex-1 items-center justify-end gap-2 text-sm text-(--mc-text-secondary)">
          <select
            value={intensityMode}
            onChange={(e) => handleIntensityModeChange(e.target.value as StudyIntensityMode)}
            className="rounded border border-(--mc-border-subtle) bg-(--mc-bg-surface) px-2 py-1 text-xs"
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

      <div
        className={`min-h-[280px] rounded-xl border p-8 shadow-sm transition-all duration-200 flex flex-col ${
          showAnswer ? 'mc-study-card-back' : 'mc-study-card-front'
        }`}
      >
        <div className="flex justify-end">
          <label className="flex items-center gap-2 text-sm text-(--mc-text-secondary)">
            <input
              type="checkbox"
              checked={needManagement}
              onChange={(e) => setNeedManagement(e.target.checked)}
              className="rounded border-(--mc-border-subtle)"
            />
            {ta('needManagement')}
          </label>
        </div>
        <div className="flex flex-1 flex-col justify-center">
          <p className="whitespace-pre-wrap text-lg leading-relaxed text-(--mc-text-primary)">
            {showAnswer ? card.verso : card.recto}
          </p>
          {card.comment && showAnswer && (
            <p className="mt-3 text-sm text-(--mc-text-secondary)">{card.comment}</p>
          )}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleToggleImportant}
            className="rounded border border-(--mc-border-subtle) px-2 py-1 text-xs text-(--mc-text-secondary) hover:bg-(--mc-bg-card-back)"
          >
            {card.is_important ? ta('importantCard') : ta('markAsImportant')}
          </button>
          {needManagement && showAnswer && (
            <>
              <button
                type="button"
                onClick={() => setShowFlagMenu(!showFlagMenu)}
                className="rounded border border-(--mc-accent-warning)/50 px-2 py-1 text-xs text-(--mc-accent-warning) hover:bg-(--mc-accent-warning)/10"
              >
                {ta('addNote')}
              </button>
              <button
                type="button"
                onClick={() => goToManageCard(card.id)}
                className="rounded border border-(--mc-accent-primary) px-2 py-1 text-xs text-(--mc-accent-primary) hover:bg-(--mc-accent-primary)/10"
              >
                {ta('immediateManagement')}
              </button>
            </>
          )}
        </div>
        {showFlagMenu && needManagement && showAnswer && (
          <div className="mt-3 rounded border border-(--mc-border-subtle) bg-(--mc-bg-surface) p-3">
            <p className="mb-2 text-xs font-medium text-(--mc-text-secondary)">{ta('managementReason')}</p>
            <div className="flex flex-wrap gap-2">
              {MANAGEMENT_REASONS.map(({ value, labelKey }) => (
                <button
                  key={value}
                  type="button"
                  disabled={flagSubmitting}
                  onClick={() => handleSubmitFlag(value)}
                  className="rounded border border-(--mc-border-subtle) px-2 py-1 text-xs hover:bg-(--mc-bg-card-back) disabled:opacity-50"
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
              className="mt-2 w-full rounded border border-(--mc-border-subtle) bg-(--mc-bg-surface) px-2 py-1 text-sm text-(--mc-text-primary)"
            />
          </div>
        )}
      </div>

      {reviewError && (
        <p className="text-sm text-(--mc-accent-danger)" role="alert">
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
            className="w-full rounded-lg border-2 border-(--mc-border-subtle) py-3 text-sm font-medium text-(--mc-text-primary) hover:bg-(--mc-bg-card-back) transition-colors duration-200"
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
                    ? 'border-(--mc-accent-danger)/50 bg-(--mc-accent-danger)/10 text-(--mc-accent-danger) hover:bg-(--mc-accent-danger)/20'
                    : value === 2
                      ? 'border-(--mc-accent-warning)/50 bg-(--mc-accent-warning)/10 text-(--mc-accent-warning) hover:bg-(--mc-accent-warning)/20'
                      : value === 4
                        ? 'border-(--mc-accent-success)/50 bg-(--mc-accent-success)/10 text-(--mc-accent-success) hover:bg-(--mc-accent-success)/20'
                        : 'border-(--mc-border-subtle) bg-(--mc-bg-surface) text-(--mc-text-primary) hover:bg-(--mc-bg-card-back)'
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
    </div>
  );
}
