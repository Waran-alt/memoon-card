import { forwardRef } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type ButtonSize = 'md' | 'sm' | 'xs';

/**
 * `xs` is intended for dense toolbars (chart controls, table row actions). It drops to
 * `text-xs` to stay visually balanced next to small selects/inputs at the same height.
 */
const sizeClasses: Record<ButtonSize, string> = {
  md: 'px-4 py-2',
  sm: 'px-3 py-1.5',
  xs: 'px-2 py-1 text-xs',
};

const focusSuccess =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mc-accent-success focus-visible:ring-offset-2 focus-visible:ring-offset-mc-bg-base';
const focusBrand =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mc-accent-primary focus-visible:ring-offset-2 focus-visible:ring-offset-mc-bg-base';
const focusDanger =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mc-accent-danger focus-visible:ring-offset-2 focus-visible:ring-offset-mc-bg-base';

const base =
  'inline-flex items-center justify-center rounded-lg text-sm font-medium transition-[background-color,color,border-color,opacity] duration-150 disabled:cursor-not-allowed disabled:opacity-50';

const variants = {
  /** Default app CTA (success green). */
  primary: `bg-mc-accent-success text-white hover:opacity-90 ${focusSuccess}`,
  /** Brand / navigation emphasis (theme primary accent). */
  brand: `bg-mc-accent-primary text-white hover:opacity-90 ${focusBrand}`,
  secondary: `border border-mc-border-subtle bg-mc-bg-surface text-mc-text-primary hover:bg-mc-bg-card-back ${focusBrand}`,
  danger: `bg-mc-accent-danger text-white hover:opacity-90 ${focusDanger}`,
  ghost: `text-mc-text-secondary hover:bg-mc-bg-card-back hover:text-mc-text-primary ${focusBrand}`,
} as const;

export type ButtonVariant = keyof typeof variants;

export function buttonClassName({
  variant = 'primary',
  size = 'md',
  className = '',
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
}): string {
  return `${base} ${sizeClasses[size]} ${variants[variant]} ${className}`.trim();
}

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', className = '', type = 'button', ...props },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      className={buttonClassName({ variant, size, className })}
      {...props}
    />
  );
});
