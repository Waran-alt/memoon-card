import { Loader2 } from 'lucide-react';

/**
 * Inline spinner for in-button "loading" feedback. Always pair with text (the spinner is
 * `aria-hidden`); use the parent button's `disabled` state to communicate "in progress" to
 * assistive tech, and consider wrapping the parent surface with `aria-busy` or `aria-live`
 * if no text changes during the operation.
 */
export type SpinnerProps = {
  size?: 'xs' | 'sm' | 'md';
  className?: string;
};

const sizeClasses: Record<NonNullable<SpinnerProps['size']>, string> = {
  xs: 'h-3 w-3',
  sm: 'h-4 w-4',
  md: 'h-5 w-5',
};

export function Spinner({ size = 'sm', className = '' }: SpinnerProps) {
  return (
    <Loader2
      aria-hidden
      className={`shrink-0 animate-spin ${sizeClasses[size]} ${className}`.trim()}
    />
  );
}
