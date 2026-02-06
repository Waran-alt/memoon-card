'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useLocale } from 'i18n';
import apiClient, { getApiErrorMessage } from '@/lib/api';
import type { Deck, Card } from '@/types';
import { useTranslation } from '@/hooks/useTranslation';

const CARD_CONTENT_MAX = 5000;
const CARD_COMMENT_MAX = 2000;

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + '…';
}

export default function DeckDetailPage() {
  const params = useParams();
  const router = useRouter();
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

  useEffect(() => {
    if (!id) return;
    queueMicrotask(() => {
      setLoading(true);
      setError('');
    });
    apiClient
      .get<{ success: boolean; data?: Deck }>(`/api/decks/${id}`)
      .then((res) => {
        if (res.data?.success && res.data.data) {
          setDeck(res.data.data);
        } else {
          setError(ta('deckNotFound'));
        }
      })
      .catch((err) => setError(getApiErrorMessage(err, ta('failedLoadDeck'))))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (!id || !deck) return;
    queueMicrotask(() => {
      setCardsLoading(true);
      setCardsError('');
    });
    apiClient
      .get<{ success: boolean; data?: Card[] }>(`/api/decks/${id}/cards`)
      .then((res) => {
        if (res.data?.success && Array.isArray(res.data.data)) {
          setCards(res.data.data);
        }
      })
      .catch((err) => setCardsError(getApiErrorMessage(err, ta('failedLoadCards'))))
      .finally(() => setCardsLoading(false));
  }, [id, deck]);

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
          setCreateRecto('');
          setCreateVerso('');
          setCreateComment('');
          setShowCreateCard(false);
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
    return <p className="text-sm text-neutral-500 dark:text-neutral-400">{tc('loading')}</p>;
  }

  if (error || !deck) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-red-600 dark:text-red-400" role="alert">
          {error || ta('deckNotFound')}
        </p>
        <Link
          href={`/${locale}/app`}
          className="text-sm font-medium text-neutral-700 underline hover:no-underline dark:text-neutral-300"
        >
          {ta('backToDecks')}
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/${locale}/app`}
          className="text-sm font-medium text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
        >
          ← {ta('backToDecks')}
        </Link>
        <h2 className="mt-2 text-xl font-semibold text-neutral-900 dark:text-neutral-100">
          {deck.title}
        </h2>
        {deck.description && (
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            {deck.description}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-sm font-medium text-neutral-700 dark:text-neutral-300">{ta('cards')}</h3>
        <div className="flex shrink-0 gap-2">
          <Link
            href={`/${locale}/app/decks/${id}/study`}
            className="rounded border-2 border-neutral-900 px-4 py-2 text-sm font-medium text-neutral-900 hover:bg-neutral-100 dark:border-neutral-100 dark:text-neutral-100 dark:hover:bg-neutral-800"
          >
            {ta('study')}
          </Link>
          <button
            type="button"
            onClick={() => {
              setShowCreateCard(true);
              setCreateError('');
            }}
            className="rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200"
          >
            {ta('newCard')}
          </button>
        </div>
      </div>

      {cardsError && (
        <p className="text-sm text-red-600 dark:text-red-400" role="alert">
          {cardsError}
        </p>
      )}

      {showCreateCard && (
        <form
          onSubmit={handleCreateCard}
          className="rounded-lg border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-700 dark:bg-neutral-800/50"
        >
          <h4 className="mb-3 text-sm font-medium text-neutral-700 dark:text-neutral-300">
            {ta('createCard')}
          </h4>
          <div className="space-y-3">
            <div>
              <label htmlFor="card-recto" className="block text-sm font-medium mb-1 text-neutral-600 dark:text-neutral-400">
                {ta('recto')}
              </label>
              <textarea
                id="card-recto"
                value={createRecto}
                onChange={(e) => setCreateRecto(e.target.value)}
                maxLength={CARD_CONTENT_MAX}
                placeholder={ta('rectoPlaceholder')}
                required
                rows={2}
                className="w-full rounded border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-600 dark:bg-neutral-900"
              />
              <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                {createRecto.length}/{CARD_CONTENT_MAX}
              </p>
            </div>
            <div>
              <label htmlFor="card-verso" className="block text-sm font-medium mb-1 text-neutral-600 dark:text-neutral-400">
                {ta('verso')}
              </label>
              <textarea
                id="card-verso"
                value={createVerso}
                onChange={(e) => setCreateVerso(e.target.value)}
                maxLength={CARD_CONTENT_MAX}
                placeholder={ta('versoPlaceholder')}
                required
                rows={2}
                className="w-full rounded border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-600 dark:bg-neutral-900"
              />
              <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                {createVerso.length}/{CARD_CONTENT_MAX}
              </p>
            </div>
            <div>
              <label htmlFor="card-comment" className="block text-sm font-medium mb-1 text-neutral-600 dark:text-neutral-400">
                {ta('commentOptional')}
              </label>
              <textarea
                id="card-comment"
                value={createComment}
                onChange={(e) => setCreateComment(e.target.value)}
                maxLength={CARD_COMMENT_MAX}
                placeholder={ta('commentPlaceholder')}
                rows={1}
                className="w-full rounded border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-600 dark:bg-neutral-900"
              />
              <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                {createComment.length}/{CARD_COMMENT_MAX}
              </p>
            </div>
            {createError && (
              <p className="text-sm text-red-600 dark:text-red-400" role="alert">
                {createError}
              </p>
            )}
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={creating || !createRecto.trim() || !createVerso.trim()}
                className="rounded bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
              >
                {creating ? tc('creating') : tc('create')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowCreateCard(false);
                  setCreateRecto('');
                  setCreateVerso('');
                  setCreateComment('');
                  setCreateError('');
                }}
                className="rounded border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-100 dark:border-neutral-600 dark:text-neutral-300 dark:hover:bg-neutral-800"
              >
                {tc('cancel')}
              </button>
            </div>
          </div>
        </form>
      )}

      {cardsLoading ? (
        <p className="text-sm text-neutral-500 dark:text-neutral-400">{ta('loadingCards')}</p>
      ) : !showCreateCard && cards.length === 0 ? (
        <div className="rounded-lg border border-dashed border-neutral-300 p-8 text-center dark:border-neutral-700">
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            {ta('noCardsYet')}
          </p>
          <button
            type="button"
            onClick={() => setShowCreateCard(true)}
            className="mt-3 text-sm font-medium text-neutral-700 underline hover:no-underline dark:text-neutral-300"
          >
            {ta('newCard')}
          </button>
        </div>
      ) : (
        <ul className="space-y-3">
          {cards.map((card) => (
            <li
              key={card.id}
              className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-700 dark:bg-neutral-800/50"
            >
              <p className="font-medium text-neutral-900 dark:text-neutral-100">
                {truncate(card.recto, 80)}
              </p>
              <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
                {truncate(card.verso, 80)}
              </p>
              {card.comment && (
                <p className="mt-1 text-xs text-neutral-400 dark:text-neutral-500">
                  {truncate(card.comment, 60)}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
