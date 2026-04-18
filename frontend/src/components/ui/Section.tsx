import type { ReactNode } from 'react';

/**
 * Page section primitive: titled card with optional description and a right-aligned actions slot.
 *
 * Use for grouping related controls/content on a page (e.g. Account → Profile, Settings → Theme).
 * Default semantics use `<section>` with the title rendered as an `<h2>`; pass a custom heading
 * via `headingLevel` if you nest sections under another heading.
 */
export type SectionProps = {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  /** Override the heading level when the section is nested under another title. */
  headingLevel?: 'h2' | 'h3' | 'h4';
  /** Drop the surrounding panel chrome (border, padding, background). */
  bare?: boolean;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
};

export function Section({
  title,
  description,
  actions,
  headingLevel = 'h2',
  bare = false,
  className = '',
  bodyClassName = '',
  children,
}: SectionProps) {
  const Heading = headingLevel;
  const wrapperClass = bare
    ? `flex flex-col gap-3 ${className}`
    : `flex flex-col gap-4 rounded-lg border border-(--mc-border-subtle) bg-(--mc-bg-surface) p-4 ${className}`;
  return (
    <section className={wrapperClass.trim()}>
      {(title || description || actions) && (
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            {title && (
              <Heading className="text-base font-semibold text-(--mc-text-primary)">{title}</Heading>
            )}
            {description && (
              <p className="mt-1 text-sm text-(--mc-text-secondary)">{description}</p>
            )}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={`flex flex-col gap-3 ${bodyClassName}`.trim()}>{children}</div>
    </section>
  );
}
