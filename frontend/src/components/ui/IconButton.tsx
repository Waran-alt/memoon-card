import type { ButtonHTMLAttributes, ReactNode } from 'react';

import type { ButtonVariant } from './Button';

/**
 * Square icon-only button. Always requires an `aria-label` (or wrapping `aria-labelledby`)
 * because there is no visible text — TS makes this explicit by typing `'aria-label'` as required.
 *
 * Sizes are tuned for accessible tap targets:
 *   - `md` ≈ 40px (default app density),
 *   - `sm` ≈ 36px (toolbar density),
 *   - `xs` ≈ 32px (chart controls / table row actions; pair with parent padding ≥ 44px target).
 */
export type IconButtonSize = 'md' | 'sm' | 'xs';

const sizeClasses: Record<IconButtonSize, string> = {
  md: 'h-10 w-10 [&>svg]:h-5 [&>svg]:w-5',
  sm: 'h-9 w-9 [&>svg]:h-4 [&>svg]:w-4',
  xs: 'h-8 w-8 [&>svg]:h-3.5 [&>svg]:w-3.5',
};

const focusSuccess =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mc-accent-success focus-visible:ring-offset-2 focus-visible:ring-offset-mc-bg-base';
const focusBrand =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mc-accent-primary focus-visible:ring-offset-2 focus-visible:ring-offset-mc-bg-base';
const focusDanger =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mc-accent-danger focus-visible:ring-offset-2 focus-visible:ring-offset-mc-bg-base';

const variants: Record<ButtonVariant, string> = {
  primary: `bg-mc-accent-success text-white hover:opacity-90 ${focusSuccess}`,
  brand: `bg-mc-accent-primary text-white hover:opacity-90 ${focusBrand}`,
  secondary: `border border-mc-border-subtle bg-mc-bg-surface text-mc-text-primary hover:bg-mc-bg-card-back ${focusBrand}`,
  danger: `bg-mc-accent-danger text-white hover:opacity-90 ${focusDanger}`,
  ghost: `text-mc-text-secondary hover:bg-mc-bg-card-back hover:text-mc-text-primary ${focusBrand}`,
};

const base =
  'inline-flex shrink-0 items-center justify-center rounded-lg transition-[background-color,color,border-color,opacity] duration-150 disabled:cursor-not-allowed disabled:opacity-50';

export type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: IconButtonSize;
  children: ReactNode;
  'aria-label': string;
};

export function IconButton({
  variant = 'ghost',
  size = 'sm',
  className = '',
  type = 'button',
  ...props
}: IconButtonProps) {
  return (
    <button
      type={type}
      className={`${base} ${sizeClasses[size]} ${variants[variant]} ${className}`.trim()}
      {...props}
    />
  );
}
