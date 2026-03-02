'use client';

const version = process.env.NEXT_PUBLIC_APP_VERSION ?? 'dev';

export function VersionFooter() {
  return (
    <div
      className="fixed bottom-2 left-2 z-50 select-none text-xs text-(--mc-text-muted)"
      aria-hidden
    >
      v{version}
    </div>
  );
}
