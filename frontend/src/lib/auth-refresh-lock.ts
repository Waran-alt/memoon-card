/**
 * Cross-tab mutex for POST /api/auth/refresh when `navigator.locks` is missing (older Safari,
 * some embedded WebViews). Matches OWASP-style guidance: serialize rotation so two tabs cannot
 * submit the same pre-rotation refresh cookie.
 *
 * Uses localStorage + short spin-wait. If the lock cannot be acquired within ACQUIRE_TIMEOUT_MS,
 * the refresh still runs (degraded) so users are not stuck offline.
 */
const LOCK_KEY = 'memoon-auth-refresh-lock';
const LOCK_TTL_MS = 45_000;
const ACQUIRE_TIMEOUT_MS = 25_000;
const POLL_MIN_MS = 40;
const POLL_MAX_MS = 90;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function randomTabId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
}

type LockPayload = { holder: string; until: number };

function readLock(): LockPayload | null {
  try {
    const raw = localStorage.getItem(LOCK_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as LockPayload;
    if (typeof p?.holder !== 'string' || typeof p?.until !== 'number') return null;
    return p;
  } catch {
    return null;
  }
}

async function acquireLocalStorageLock(tabId: string): Promise<() => void> {
  const deadline = Date.now() + ACQUIRE_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const now = Date.now();
    const cur = readLock();
    if (!cur || cur.until < now) {
      try {
        localStorage.setItem(LOCK_KEY, JSON.stringify({ holder: tabId, until: now + LOCK_TTL_MS }));
      } catch {
        return () => {};
      }
      const verify = readLock();
      if (verify?.holder === tabId) {
        return () => {
          try {
            const v = readLock();
            if (v?.holder === tabId) localStorage.removeItem(LOCK_KEY);
          } catch {
            /* ignore */
          }
        };
      }
    }
    await sleep(POLL_MIN_MS + Math.random() * (POLL_MAX_MS - POLL_MIN_MS));
  }
  return () => {};
}

/**
 * Run `fn` while holding a best-effort cross-tab lock (browser only).
 */
export async function withLocalStorageRefreshLock<T>(fn: () => Promise<T>): Promise<T> {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return fn();
  }
  const tabId = randomTabId();
  const release = await acquireLocalStorageLock(tabId);
  try {
    return await fn();
  } finally {
    release();
  }
}
