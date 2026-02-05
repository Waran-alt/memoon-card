'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import apiClient, { getApiErrorMessage } from '@/lib/api';
import type { Deck, Card } from '@/types';
import type { Rating } from '@/types';

const SESSION_NEW_LIMIT = 20;
const SESSION_MAX = 50;

const RATING_OPTIONS: Array<{ value: Rating; label: string }> = [
  { value: 1, label: 'Again' },
  { value: 2, label: 'Hard' },
  { value: 3, label: 'Good' },
  { value: 4, label: 'Easy' },
];

export default function StudyPage() {
  const params = useParams();
  const router = useRouter();
  const id = typeof params.id === 'string' ? params.id : '';
  const [deck, setDeck] = useState<Deck | null>(null);
  const [queue, setQueue] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAnswer, setShowAnswer] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [reviewError, setReviewError] = useState('');
  const [reviewedCount, setReviewedCount] = useState(0);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError('');
    Promise.all([
      apiClient.get<{ success: boolean; data?: Deck }>(`/api/decks/${id}`),
      apiClient.get<{ success: boolean; data?: Card[] }>(`/api/decks/${id}/cards/due`),
      apiClient.get<{ success: boolean; data?: Card[] }>(`/api/decks/${id}/cards/new?limit=${SESSION_NEW_LIMIT}`),
    ])
      .then(([deckRes, dueRes, newRes]) => {
        if (!deckRes.data?.success || !deckRes.data.data) {
          setError('Deck not found');
          return;
        }
        setDeck(deckRes.data.data);
        const due = dueRes.data?.success && Array.isArray(dueRes.data.data) ? dueRes.data.data : [];
        const newCards = newRes.data?.success && Array.isArray(newRes.data.data) ? newRes.data.data : [];
        const seen = new Set(due.map((c) => c.id));
        const extraNew = newCards.filter((c) => !seen.has(c.id));
        const combined = [...due, ...extraNew].slice(0, SESSION_MAX);
        setQueue(combined);
      })
      .catch((err) => setError(getApiErrorMessage(err, 'Failed to load cards')))
      .finally(() => setLoading(false));
  }, [id]);

  function handleRate(rating: Rating) {
    const card = queue[0];
    if (!card || submitting) return;
    setSubmitting(true);
    setReviewError('');
    apiClient
      .post<{ success: boolean }>(`/api/cards/${card.id}/review`, { rating })
      .then(() => {
        setQueue((prev) => prev.slice(1));
        setShowAnswer(false);
        setReviewedCount((n) => n + 1);
      })
      .catch(() => {
        setReviewError('Failed to save review. Try again.');
      })
      .finally(() => setSubmitting(false));
  }

  if (!id) {
    router.replace('/app');
    return null;
  }

  if (loading) {
    return <p className="text-sm text-neutral-500 dark:text-neutral-400">Loading…</p>;
  }

  if (error || !deck) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-red-600 dark:text-red-400" role="alert">
          {error || 'Deck not found'}
        </p>
        <Link
          href="/app"
          className="text-sm font-medium text-neutral-700 underline hover:no-underline dark:text-neutral-300"
        >
          Back to decks
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
        <Link
          href={`/app/decks/${id}`}
          className="text-sm font-medium text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
        >
          ← Back to deck
        </Link>
        <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-8 text-center dark:border-neutral-700 dark:bg-neutral-800/50">
          <p className="text-neutral-700 dark:text-neutral-300">No cards to study right now.</p>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            Add cards to this deck or come back later for due reviews.
          </p>
          <Link
            href={`/app/decks/${id}`}
            className="mt-4 inline-block rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200"
          >
            Back to deck
          </Link>
        </div>
      </div>
    );
  }

  if (sessionDone) {
    return (
      <div className="space-y-4">
        <Link
          href={`/app/decks/${id}`}
          className="text-sm font-medium text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
        >
          ← Back to deck
        </Link>
        <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-8 text-center dark:border-neutral-700 dark:bg-neutral-800/50">
          <p className="font-medium text-neutral-900 dark:text-neutral-100">Session complete</p>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            You reviewed {reviewedCount} card{reviewedCount !== 1 ? 's' : ''}.
          </p>
          <Link
            href={`/app/decks/${id}`}
            className="mt-4 inline-block rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200"
          >
            Back to deck
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <Link
          href={`/app/decks/${id}`}
          className="text-sm font-medium text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
        >
          ← Exit study
        </Link>
        <span className="text-sm text-neutral-500 dark:text-neutral-400">
          {queue.length} left · {reviewedCount} reviewed
        </span>
      </div>

      <div className="rounded-xl border border-neutral-200 bg-white p-8 shadow-sm dark:border-neutral-700 dark:bg-neutral-800/50 min-h-[280px] flex flex-col justify-center">
        <p className="whitespace-pre-wrap text-lg text-neutral-900 dark:text-neutral-100">
          {showAnswer ? card.verso : card.recto}
        </p>
        {card.comment && showAnswer && (
          <p className="mt-3 text-sm text-neutral-500 dark:text-neutral-400">{card.comment}</p>
        )}
      </div>

      {reviewError && (
        <p className="text-sm text-red-600 dark:text-red-400" role="alert">
          {reviewError}
        </p>
      )}
      <div className="flex flex-col gap-3">
        {!showAnswer ? (
          <button
            type="button"
            onClick={() => setShowAnswer(true)}
            className="w-full rounded-lg border-2 border-neutral-900 py-3 text-sm font-medium text-neutral-900 hover:bg-neutral-100 dark:border-neutral-100 dark:text-neutral-100 dark:hover:bg-neutral-800"
          >
            Show answer
          </button>
        ) : (
          <div className="grid grid-cols-4 gap-2">
            {RATING_OPTIONS.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                disabled={submitting}
                onClick={() => handleRate(value)}
                className={`rounded-lg border-2 py-3 text-sm font-medium transition-colors ${
                  value === 1
                    ? 'border-red-300 bg-red-50 text-red-800 hover:bg-red-100 dark:border-red-700 dark:bg-red-900/20 dark:text-red-200 dark:hover:bg-red-900/30'
                    : value === 4
                      ? 'border-green-300 bg-green-50 text-green-800 hover:bg-green-100 dark:border-green-700 dark:bg-green-900/20 dark:text-green-200 dark:hover:bg-green-900/30'
                      : 'border-neutral-300 bg-neutral-50 text-neutral-800 hover:bg-neutral-100 dark:border-neutral-600 dark:bg-neutral-800/50 dark:text-neutral-200 dark:hover:bg-neutral-700/50'
                } disabled:opacity-50`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
