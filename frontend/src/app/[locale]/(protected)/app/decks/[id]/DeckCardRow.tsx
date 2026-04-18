'use client';

import { memo } from 'react';
import type { Card } from '@/types';
import type { TranslationOptions } from '@/hooks/useTranslation';
import { ExpandableCategoryChips } from './ExpandableCategoryChips';
import { IconChartBar, IconCog6Tooth, IconEye, IconEyeSlash } from './DeckUiIcons';
import { CardHtmlContent } from '@/components/CardHtmlContent';

export type DeckCardRowT = (key: string, options?: TranslationOptions) => string;

/** Tile width in the flex-wrap grid (parent `ul` centers rows). */
export const DECK_CARD_ROW_TILE_CLASS = 'w-full max-w-[16.5rem] shrink-0 sm:max-w-[18rem]';

/** Outer “trading card” shell — same weight as before (thin border + ring). */
const cardShellClass =
  'rounded-2xl border border-(--mc-border-subtle) bg-(--mc-bg-surface)/90 p-3 shadow-md ring-1 ring-black/5 dark:ring-white/10 sm:p-4';

/** Inner face panels (stacked with gap, distinct from the shell). */
const facePanelClass =
  'rounded-xl border border-(--mc-border-subtle) px-4 py-3 sm:px-4 sm:py-3.5';

const faceLabelClass =
  'text-[0.65rem] font-semibold uppercase tracking-wider text-(--mc-text-muted)';

const iconActionClass =
  'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-(--mc-border-subtle) bg-(--mc-bg-page)/50 text-(--mc-text-secondary) transition-colors hover:bg-(--mc-bg-card-back) hover:text-(--mc-text-primary)';

export type DeckCardRowProps = {
  card: Card;
  globalIndex: number;
  revealed: boolean;
  selected: boolean;
  ta: DeckCardRowT;
  /** When false (e.g. active search), list cards stay expanded and collapse is hidden. */
  allowCollapse: boolean;
  onToggleSelect: (cardId: string) => void;
  onReveal: (cardId: string) => void;
  onCollapseCard: (cardId: string) => void;
  onEdit: (card: Card) => void;
  onInspect: (card: Card) => void;
  /** Click-to-filter on category chips. When omitted, chips render read-only. */
  onSelectCategoryFilter?: (categoryId: string) => void;
  /** Highlights the chip matching the deck-level category filter. */
  activeCategoryFilterId?: string | null;
};

export const DeckCardRow = memo(function DeckCardRow({
  card,
  globalIndex,
  revealed,
  selected,
  ta,
  allowCollapse,
  onToggleSelect,
  onReveal,
  onCollapseCard,
  onEdit,
  onInspect,
  onSelectCategoryFilter,
  activeCategoryFilterId = null,
}: DeckCardRowProps) {
  const cardTitle = ta('cardLabel', { vars: { n: String(globalIndex) } });
  /** Only on list cards; last/next review live in the card stats modal. */
  const listFooterStatus = !card.last_review ? ta('cardStatusNew') : '';

  /** Top-left inside the card; stays above the masked overlay (z-20). */
  const checkboxInCard = (
    <label
      className="absolute left-2.5 top-2.5 z-20 flex cursor-pointer rounded-md bg-(--mc-bg-surface)/95 p-0.5 shadow-sm backdrop-blur-sm"
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <input
        type="checkbox"
        checked={selected}
        onChange={() => onToggleSelect(card.id)}
        aria-label={ta('cardLabel', { vars: { n: String(globalIndex) } })}
        className="h-5 w-5 rounded border-(--mc-border-subtle)"
      />
      <span className="sr-only">{ta('cards')}</span>
    </label>
  );

  /** Card index — always bottom-left of the shell (revealed: in footer row). */
  const cardNumberClass =
    'text-left text-xs font-medium text-(--mc-text-muted)';

  const cardFooter = (opts: { schedule?: string }) => (
    <div className="mt-1 flex flex-wrap items-end justify-between gap-x-3 gap-y-1 border-t border-(--mc-border-subtle)/70 pt-3">
      <span className={`min-w-0 shrink ${cardNumberClass}`}>{cardTitle}</span>
      {opts.schedule != null && opts.schedule !== '' && (
        <span className="max-w-full text-right text-xs text-(--mc-text-secondary)">{opts.schedule}</span>
      )}
    </div>
  );

  return (
    <li className={`list-none ${DECK_CARD_ROW_TILE_CLASS}`}>
      <div className="w-full">
        {!revealed ? (
          <div className={`relative min-h-48 min-w-0 overflow-hidden ${cardShellClass}`}>
            {checkboxInCard}
            <span
              className={`pointer-events-none absolute bottom-2.5 left-2.5 z-20 max-w-[calc(100%-1.25rem)] truncate ${cardNumberClass} drop-shadow-[0_1px_1px_var(--mc-bg-base)]`}
            >
              {cardTitle}
            </span>
            <button
              type="button"
              onClick={() => onReveal(card.id)}
              className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-(--mc-bg-surface)/90 backdrop-blur-[1px] transition-colors hover:bg-(--mc-bg-surface)/95"
              aria-label={ta('revealCard')}
            >
              <IconEye className="h-10 w-10 text-(--mc-text-secondary) sm:h-11 sm:w-11" />
            </button>
          </div>
        ) : (
          <div className={`relative min-w-0 ${cardShellClass} space-y-3`}>
            {checkboxInCard}
            <div className="flex min-h-9 flex-wrap items-center justify-end gap-1.5 pl-10">
              {allowCollapse && (
                <button
                  type="button"
                  onClick={() => onCollapseCard(card.id)}
                  className={iconActionClass}
                  title={ta('hideCardTitle') !== 'hideCardTitle' ? ta('hideCardTitle') : undefined}
                  aria-label={ta('hideCard')}
                >
                  <IconEyeSlash className="h-4 w-4" />
                </button>
              )}
              <button
                type="button"
                onClick={() => onInspect(card)}
                className={iconActionClass}
                title={ta('inspectCard')}
                aria-label={ta('inspectCard')}
              >
                <IconChartBar className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => onEdit(card)}
                className={iconActionClass}
                title={ta('editCard')}
                aria-label={ta('editCard')}
              >
                <IconCog6Tooth className="h-4 w-4" />
              </button>
            </div>

            <div className="flex flex-col gap-2">
              <div className={`${facePanelClass} mc-study-card-front`}>
                <p className={faceLabelClass}>{ta('recto')}</p>
                <CardHtmlContent
                  html={card.recto}
                  className="mt-2 wrap-break-word text-sm text-(--mc-text-primary)"
                />
              </div>
              <div className={`${facePanelClass} mc-study-card-back`}>
                <p className={faceLabelClass}>{ta('verso')}</p>
                <CardHtmlContent
                  html={card.verso}
                  className="mt-2 wrap-break-word text-sm text-(--mc-text-primary)"
                />
              </div>
            </div>

            {card.comment && (
              <div className="text-xs text-(--mc-text-muted)">
                <span className="font-medium text-(--mc-text-secondary)">{ta('commentOptional')}: </span>
                <CardHtmlContent html={card.comment} className="mt-0.5 text-(--mc-text-muted)" />
              </div>
            )}

            {(card.categories?.length ?? 0) > 0 && (
              <ExpandableCategoryChips
                categories={card.categories!}
                onSelect={onSelectCategoryFilter}
                activeCategoryId={activeCategoryFilterId}
                showMoreLabel={(count) => ta('categoryChipsShowMore', { vars: { count: String(count) } })}
                showLessLabel={ta('categoryChipsShowLess')}
                filterAriaLabel={(name) =>
                  ta('categoryChipsFilterByAria', { vars: { name } })
                }
              />
            )}

            {cardFooter({ schedule: listFooterStatus })}
          </div>
        )}
      </div>
    </li>
  );
});
