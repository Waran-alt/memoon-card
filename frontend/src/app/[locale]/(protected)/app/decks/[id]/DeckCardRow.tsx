'use client';

import { memo } from 'react';
import type { Card } from '@/types';
import type { TranslationOptions } from '@/hooks/useTranslation';
import { formatCardDateOrTime, previewCardRecto } from './deckDetailHelpers';

export type DeckCardRowT = (key: string, options?: TranslationOptions) => string;

export type DeckCardRowProps = {
  card: Card;
  globalIndex: number;
  revealed: boolean;
  selected: boolean;
  locale: string;
  ta: DeckCardRowT;
  tc: DeckCardRowT;
  getNeighborCard: (neighborId: string) => Card | undefined;
  openingReverseCardId: string | null;
  onToggleSelect: (cardId: string) => void;
  onReveal: (cardId: string) => void;
  onHideCard: (cardId: string) => void;
  onEdit: (card: Card) => void;
  onInspect: (card: Card) => void;
  onOpenLinked: (sourceCard: Card, neighborId: string) => void;
  onUnlink: (cardId: string, otherCardId: string) => void;
};

export const DeckCardRow = memo(function DeckCardRow({
  card,
  globalIndex,
  revealed,
  selected,
  locale,
  ta,
  tc,
  getNeighborCard,
  openingReverseCardId,
  onToggleSelect,
  onReveal,
  onHideCard,
  onEdit,
  onInspect,
  onOpenLinked,
  onUnlink,
}: DeckCardRowProps) {
  return (
    <li className="mc-study-surface relative rounded-xl border border-(--mc-border-subtle) p-4 shadow-sm transition-colors duration-150 hover:bg-(--mc-bg-card-back)/40">
      {!revealed ? (
        <div className="flex items-center gap-3">
          <label className="flex shrink-0 cursor-pointer">
            <input
              type="checkbox"
              checked={selected}
              onChange={() => onToggleSelect(card.id)}
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
            onClick={() => onReveal(card.id)}
            className="shrink-0 rounded border border-(--mc-border-subtle) px-3 pt-1 pb-1.5 text-sm font-medium text-(--mc-text-secondary) hover:bg-(--mc-bg-card-back) hover:text-(--mc-text-primary)"
          >
            {ta('revealCard')}
          </button>
        </div>
      ) : (
        <>
          <button
            type="button"
            onClick={() => onHideCard(card.id)}
            title={ta('hideCardTitle') !== 'hideCardTitle' ? ta('hideCardTitle') : undefined}
            className="absolute right-2 top-2 z-10 rounded border border-(--mc-border-subtle) bg-(--mc-bg-surface) px-2 py-1 text-xs font-medium text-(--mc-text-secondary) shadow-sm transition-colors hover:bg-(--mc-bg-card-back) hover:text-(--mc-text-primary)"
            aria-label={ta('hideCard')}
          >
            {ta('hideCard')}
          </button>
          <div className="flex items-start gap-3">
            <label className="flex shrink-0 cursor-pointer">
              <input
                type="checkbox"
                checked={selected}
                onChange={() => onToggleSelect(card.id)}
                aria-label={ta('cards')}
                className="h-5 w-5 rounded border-(--mc-border-subtle)"
              />
              <span className="sr-only">{ta('cards')}</span>
            </label>
            <div className="min-w-0 flex-1 space-y-2">
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
          {(card.linked_card_ids?.length ?? 0) > 0 && (
            <div className="mt-2 rounded-lg border border-(--mc-border-subtle) bg-(--mc-bg-page)/60 p-2.5">
              <p className="mb-2 text-xs font-medium text-(--mc-text-secondary)">
                {ta('linkedCardsDirect') !== 'linkedCardsDirect' ? ta('linkedCardsDirect') : 'Direct links'}
              </p>
              <ul className="space-y-2">
                {card.linked_card_ids!.map((nid) => {
                  const nb = getNeighborCard(nid);
                  return (
                    <li
                      key={nid}
                      className="flex flex-wrap items-center gap-2 border-b border-(--mc-border-subtle)/60 pb-2 text-sm last:border-0 last:pb-0"
                    >
                      <span
                        className="min-w-0 flex-1 truncate text-(--mc-text-primary)"
                        title={nb ? previewCardRecto(nb.recto, 200) : undefined}
                      >
                        {nb
                          ? previewCardRecto(nb.recto)
                          : ta('linkedCardOtherDeck') !== 'linkedCardOtherDeck'
                            ? ta('linkedCardOtherDeck')
                            : 'Another deck (not in this list)'}
                      </span>
                      <button
                        type="button"
                        onClick={() => onOpenLinked(card, nid)}
                        disabled={openingReverseCardId === nid}
                        className="shrink-0 rounded border border-(--mc-accent-primary) px-2 py-1 text-xs font-medium text-(--mc-accent-primary) transition-colors hover:bg-(--mc-accent-primary)/10 disabled:opacity-50"
                      >
                        {openingReverseCardId === nid
                          ? tc('loading')
                          : ta('openLinkedCard') !== 'openLinkedCard'
                            ? ta('openLinkedCard')
                            : 'Open'}
                      </button>
                      <button
                        type="button"
                        onClick={() => onUnlink(card.id, nid)}
                        className="shrink-0 rounded border border-(--mc-border-subtle) px-2 py-1 text-xs font-medium text-(--mc-text-secondary) hover:bg-(--mc-bg-card-back)"
                      >
                        {ta('unlinkCard') !== 'unlinkCard' ? ta('unlinkCard') : 'Unlink'}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onEdit(card)}
              className="rounded-lg border border-(--mc-border-subtle) px-3 pt-1 pb-1.5 text-sm font-medium text-(--mc-text-secondary) transition-colors hover:bg-(--mc-bg-card-back) hover:text-(--mc-text-primary)"
            >
              {ta('editCard')}
            </button>
            <button
              type="button"
              onClick={() => onInspect(card)}
              title={ta('inspectCard')}
              aria-label={ta('inspectCard')}
              className="rounded-lg border border-(--mc-border-subtle) px-3 pt-1 pb-1.5 text-sm font-medium text-(--mc-text-secondary) transition-colors hover:bg-(--mc-bg-card-back) hover:text-(--mc-text-primary)"
            >
              {ta('inspectCard')}
            </button>
          </div>
        </>
      )}
    </li>
  );
});
