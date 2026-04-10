'use client';

import { useEffect, useState } from 'react';

const FALLBACK_VERSION = '—';

/** Avoid "vdev" when API returns version "dev" but we used to prefix every value with "v". */
function formatVersionLabel(version: string): string {
  if (!version || version === FALLBACK_VERSION) return FALLBACK_VERSION;
  if (version === 'dev') return 'dev';
  if (version.startsWith('v')) return version;
  return `v${version}`;
}

export function VersionFooter() {
  const [version, setVersion] = useState<string>(FALLBACK_VERSION);

  useEffect(() => {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 3000);
    fetch('/api/version', { signal: ac.signal })
      .then((res) => (res.ok ? res.json() : { version: 'dev' }))
      .then((data) => setVersion(data?.version ?? 'dev'))
      .catch(() => setVersion('dev'))
      .finally(() => clearTimeout(t));
    return () => { ac.abort(); clearTimeout(t); };
  }, []);

  return (
    <div
      className="fixed bottom-2 left-2 z-50 select-none text-xs text-(--mc-text-muted)"
      aria-hidden
    >
      {formatVersionLabel(version)}
    </div>
  );
}
