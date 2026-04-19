'use client';

/**
 * Re-exports the shared modal close control. Kept here so existing local
 * imports (`./ModalCloseButton`) keep working; new code should import from
 * `@/components/ui/ModalCloseButton` directly.
 */
export {
  ModalCloseButton,
  MODAL_ICON_CLOSE_BUTTON_CLASS,
} from '@/components/ui/ModalCloseButton';
