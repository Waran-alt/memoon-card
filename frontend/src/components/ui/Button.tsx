import type { ButtonHTMLAttributes, ReactNode } from 'react';

const base =
  'inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium transition-opacity disabled:cursor-not-allowed disabled:opacity-50';

const variants = {
  primary: 'bg-mc-accent-primary text-white opacity-90 hover:opacity-100',
  secondary:
    'border border-mc-border-subtle bg-mc-bg-surface text-mc-text-primary hover:bg-mc-bg-card-back',
  danger: 'bg-mc-accent-danger text-white opacity-90 hover:opacity-100',
  ghost: 'text-mc-text-secondary hover:bg-mc-bg-card-back hover:text-mc-text-primary',
} as const;

export type ButtonVariant = keyof typeof variants;

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  children: ReactNode;
};

export function Button({
  variant = 'primary',
  className = '',
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`${base} ${variants[variant]} ${className}`.trim()}
      {...props}
    />
  );
}
