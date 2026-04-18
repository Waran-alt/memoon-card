'use client';

import { useState } from 'react';
import { CategoryBadgePill } from './CategoryBadgePill';

export type ExpandableCategoryChipsCategory = { id: string; name: string };

export type ExpandableCategoryChipsProps = {
  categories: ExpandableCategoryChipsCategory[];
  /** When provided, each chip becomes a button that filters by that category. */
  onSelect?: (categoryId: string) => void;
  /** Highlight the active filter chip; e.g. when this card is matching the deck filter. */
  activeCategoryId?: string | null;
  /** Maximum number of chips to render before collapsing into "+N more". */
  initialLimit?: number;
  /** "+{count} more" expand label (already pluralized by caller). */
  showMoreLabel: (hidden: number) => string;
  /** Collapse-back label. */
  showLessLabel: string;
  /** Accessible label prefix for filter buttons (e.g. "Filter by category"). */
  filterAriaLabel?: (name: string) => string;
};

/**
 * Lists category chips with two affordances:
 *   1. **Expandable overflow**: when there are more chips than `initialLimit`, the
 *      tail collapses into a "+N more" toggle (no tooltip — full inline reveal),
 *      so users can see/copy/click every category without hovering.
 *   2. **Clickable to filter**: when `onSelect` is provided, each chip becomes a
 *      button that calls `onSelect(categoryId)`. The deck page uses this to filter
 *      the visible cards by category.
 *
 * The active filter chip (matching `activeCategoryId`) gets a brand outline so it's
 * easy to spot which one is currently driving the filter.
 */
export function ExpandableCategoryChips({
  categories,
  onSelect,
  activeCategoryId = null,
  initialLimit = 3,
  showMoreLabel,
  showLessLabel,
  filterAriaLabel,
}: ExpandableCategoryChipsProps) {
  const [expanded, setExpanded] = useState(false);
  if (categories.length === 0) return null;

  const limit = Math.max(1, initialLimit);
  const overflow = categories.length - limit;
  const visible = expanded || overflow <= 0 ? categories : categories.slice(0, limit);

  const renderChip = (cat: ExpandableCategoryChipsCategory) => {
    const isActive = activeCategoryId === cat.id;
    if (onSelect) {
      const activeClass = isActive
        ? 'border-(--mc-accent-primary) text-(--mc-text-primary) ring-1 ring-(--mc-accent-primary)/40'
        : 'hover:border-(--mc-accent-primary) hover:text-(--mc-text-primary)';
      return (
        <button
          key={cat.id}
          type="button"
          onClick={() => onSelect(cat.id)}
          className="inline-flex max-w-full items-center"
          aria-pressed={isActive}
          aria-label={filterAriaLabel ? filterAriaLabel(cat.name) : undefined}
          title={filterAriaLabel ? filterAriaLabel(cat.name) : undefined}
        >
          <CategoryBadgePill className={`cursor-pointer transition-colors ${activeClass}`}>
            {cat.name}
          </CategoryBadgePill>
        </button>
      );
    }
    return <CategoryBadgePill key={cat.id}>{cat.name}</CategoryBadgePill>;
  };

  return (
    <div className="flex flex-wrap items-center gap-1">
      {visible.map(renderChip)}
      {overflow > 0 ? (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="inline-flex items-center rounded-full border border-dashed border-(--mc-border-subtle) bg-transparent px-2 py-0.5 text-[11px] font-medium text-(--mc-text-secondary) transition-colors hover:bg-(--mc-bg-card-back) hover:text-(--mc-text-primary)"
          aria-expanded={expanded}
        >
          {expanded ? showLessLabel : showMoreLabel(overflow)}
        </button>
      ) : null}
    </div>
  );
}
