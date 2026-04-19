'use client';

/**
 * Shared icon-only modal close control. Lives in `components/ui` so any modal
 * (deck dialogs, study, settings, categories, …) can render the same X button
 * without re-importing route-scoped helpers.
 *
 * The X glyph is inlined so this component is self-contained — DeckUiIcons
 * stays the canonical source for deck-specific icons elsewhere.
 */

/** Icon-only close control — same styling across every dialog header. */
export const MODAL_ICON_CLOSE_BUTTON_CLASS =
  'shrink-0 rounded p-1 text-(--mc-text-secondary) hover:bg-(--mc-bg-card-back) hover:text-(--mc-text-primary)';

type Props = {
  onClick: () => void;
  /** Translated label, typically `tc('close')`. */
  ariaLabel: string;
  /** Optional override (e.g. add `ml-auto` when there's no title block beside it). */
  className?: string;
};

export function ModalCloseButton({ onClick, ariaLabel, className }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={className ? `${MODAL_ICON_CLOSE_BUTTON_CLASS} ${className}` : MODAL_ICON_CLOSE_BUTTON_CLASS}
      aria-label={ariaLabel}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-5 w-5"
        aria-hidden="true"
      >
        <path d="M6 18 18 6M6 6l12 12" />
      </svg>
    </button>
  );
}
