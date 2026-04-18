import type { ReactNode } from 'react';

/**
 * Generic "nothing to show yet" panel. Use when a list/page would otherwise be a
 * lonely sentence — gives the screen visual weight + a clear next step.
 *
 *   <EmptyState
 *     title="No decks yet"
 *     description="Create your first deck to start studying."
 *     action={<Button onClick={...}>New deck</Button>}
 *   />
 *
 * Variants:
 *   - `compact`: small inline panel (lists inside cards/sections).
 *   - `feature`: large dashed panel for top-level pages.
 */
export type EmptyStateProps = {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  secondaryAction?: ReactNode;
  variant?: 'feature' | 'compact';
  className?: string;
};

export function EmptyState({
  icon,
  title,
  description,
  action,
  secondaryAction,
  variant = 'feature',
  className = '',
}: EmptyStateProps) {
  const wrapper =
    variant === 'feature'
      ? 'rounded-xl border border-dashed border-(--mc-border-subtle) bg-(--mc-bg-surface)/40 px-6 py-10 text-center'
      : 'rounded-lg border border-dashed border-(--mc-border-subtle) px-4 py-6 text-center';
  return (
    <div className={`${wrapper} ${className}`.trim()}>
      {icon ? (
        <div
          aria-hidden
          className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-(--mc-bg-card-back) text-(--mc-text-secondary) [&>svg]:h-5 [&>svg]:w-5"
        >
          {icon}
        </div>
      ) : null}
      <p
        className={
          variant === 'feature'
            ? 'text-base font-medium text-(--mc-text-primary)'
            : 'text-sm font-medium text-(--mc-text-primary)'
        }
      >
        {title}
      </p>
      {description ? (
        <p className="mx-auto mt-1 max-w-md text-sm text-(--mc-text-secondary)">{description}</p>
      ) : null}
      {(action || secondaryAction) && (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          {action}
          {secondaryAction}
        </div>
      )}
    </div>
  );
}
