'use client';

import { IconXMark } from './DeckUiIcons';

/** Icon-only close control — same styling as `CardFollowUpModal` and other deck dialogs. */
export const MODAL_ICON_CLOSE_BUTTON_CLASS =
  'shrink-0 rounded p-1 text-(--mc-text-secondary) hover:bg-(--mc-bg-card-back) hover:text-(--mc-text-primary)';

type Props = {
  onClick: () => void;
  /** Use `tc('close')` from common (or equivalent). */
  ariaLabel: string;
};

export function ModalCloseButton({ onClick, ariaLabel }: Props) {
  return (
    <button type="button" onClick={onClick} className={MODAL_ICON_CLOSE_BUTTON_CLASS} aria-label={ariaLabel}>
      <IconXMark className="h-5 w-5" />
    </button>
  );
}
