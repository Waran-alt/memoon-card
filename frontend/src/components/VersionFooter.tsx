'use client';

import { useEffect, useState } from 'react';

const FALLBACK_VERSION = '—';

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
      v{version}
    </div>
  );
}
