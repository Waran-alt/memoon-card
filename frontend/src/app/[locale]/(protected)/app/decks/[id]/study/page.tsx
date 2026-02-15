'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useLocale } from 'i18n';
import apiClient, { getApiErrorMessage, isRequestCancelled } from '@/lib/api';
import type { Deck, Card } from '@/types';
import type { Rating } from '@/types';
import { useTranslation } from '@/hooks/useTranslation';

const SESSION_NEW_LIMIT = 20;
const SESSION_MAX = 50; // cap a single session so it’s not endless

const LAST_STUDIED_KEY = (deckId: string) => `memoon_last_studied_${deckId}`;

const RATING_VALUES: Rating[] = [1, 2, 3, 4];
type RatingStats = Record<Rating, number>;
const INITIAL_RATING_STATS: RatingStats = { 1: 0, 2: 0, 3: 0, 4: 0 };

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

  useEffect(() => {
    if (queue[0]?.id) {
      setCardStartedAt(Date.now());
      revealedAtRef.current = null;
    }
  }, [queue[0]?.id]);

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
        setQueue(combined);
      })
      .catch((err) => {
        if (!isRequestCancelled(err)) setError(getApiErrorMessage(err, ta('failedLoadCards')));
      })
      .finally(() => setLoading(false));
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  function goToDeck() {
    try {
      const ids = reviewedCardIdsRef.current;
      if (ids?.length && typeof window !== 'undefined') {
        window.sessionStorage.setItem(LAST_STUDIED_KEY(id), JSON.stringify(ids));
      }
    } catch {
      // ignore
    }
    router.push(`/${locale}/app/decks/${id}`);
  }

  function handleRate(rating: Rating) {
    const card = queue[0];
    if (!card || submitting) return;
    setSubmitting(true);
    setReviewError('');
    const shownAt = cardStartedAt;
    const revealedAt = revealedAtRef.current ?? undefined;
    const sessionId = sessionIdRef.current ?? undefined;
    const payload: { rating: Rating; shownAt?: number; revealedAt?: number; sessionId?: string } = {
      rating,
      ...(shownAt && { shownAt }),
      ...(revealedAt && { revealedAt }),
      ...(sessionId && { sessionId }),
    };
    apiClient
      .post<{ success: boolean }>(`/api/cards/${card.id}/review`, payload)
      .then(() => {
        reviewedCardIdsRef.current = [...reviewedCardIdsRef.current, card.id];
        setQueue((prev) => prev.slice(1));
        setShowAnswer(false);
        setReviewedCount((n) => n + 1);
        setRatingStats((prev) => ({ ...prev, [rating]: prev[rating] + 1 }));
      })
      .catch(() => {
        setReviewError(ta('failedSaveReview'));
      })
      .finally(() => setSubmitting(false));
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
            Add cards to this deck or come back later for due reviews.
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
        className={`min-h-[280px] rounded-xl border p-8 shadow-sm transition-all duration-200 flex flex-col justify-center ${
          showAnswer ? 'mc-study-card-back' : 'mc-study-card-front'
        }`}
      >
        <p className="whitespace-pre-wrap text-lg leading-relaxed text-(--mc-text-primary)">
          {showAnswer ? card.verso : card.recto}
        </p>
        {card.comment && showAnswer && (
          <p className="mt-3 text-sm text-(--mc-text-secondary)">{card.comment}</p>
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
