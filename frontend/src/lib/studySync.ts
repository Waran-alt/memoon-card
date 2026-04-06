/**
 * Helpers for resilient study flows: retry transient failures, and persist failed review POSTs until flush.
 * Queued payloads are review bodies only; session uses httpOnly cookies on same-origin /api (nothing secret in localStorage).
 * If you ever queue more sensitive data, clear the queue on logout (see PENDING_KEY).
 */

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_BASE_DELAY_MS = 1000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getResponseStatus(err: unknown): number | undefined {
  const status = (err as { response?: { status?: number } })?.response?.status;
  return typeof status === 'number' ? status : undefined;
}

/** Same policy as retryWithBackoff: do not keep retrying permanent client failures in the offline queue. */
function isNonRetryableHttpError(status: number): boolean {
  return status >= 400 && status < 500 && status !== 408 && status !== 429;
}

/**
 * Whether to remove an item from the persisted queue after a failed flush.
 * Keeps 401/403/408/429 (session or rate limits may recover); drops other 4xx that will not succeed on repeat.
 */
function shouldDropQueueItemAfterFailure(status: number): boolean {
  if (status === 401 || status === 403 || status === 408 || status === 429) return false;
  return status >= 400 && status < 500;
}

/**
 * Retry with exponential backoff. Expects errors shaped like axios (`error.response.status`).
 * Skips retry on client/permission errors (4xx) except 408 and 429.
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: { maxAttempts?: number; baseDelayMs?: number } = {}
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const baseDelayMs = options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const status = getResponseStatus(err);
      if (typeof status === 'number' && isNonRetryableHttpError(status)) {
        throw err;
      }
      if (attempt === maxAttempts) throw err;
      const delayMs = baseDelayMs * Math.pow(2, attempt - 1);
      await sleep(delayMs);
    }
  }
  throw lastError;
}

/** One deferred review submission (relative or absolute URL + JSON body). */
export type PendingItem = { type: 'review'; url: string; payload: unknown };

const pending: PendingItem[] = [];
/** localStorage key for the offline queue; single key keeps eviction/simple logout handling obvious. */
const PENDING_KEY = 'memoon_study_pending';

function loadPending(): PendingItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(PENDING_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PendingItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function savePending(items: PendingItem[]) {
  if (typeof window === 'undefined') return;
  try {
    if (items.length === 0) window.localStorage.removeItem(PENDING_KEY);
    else window.localStorage.setItem(PENDING_KEY, JSON.stringify(items));
  } catch {
    // ignore
  }
}

/** Append after a failed send; mirrors to localStorage so a refresh does not lose the queue. */
export function addToPendingQueue(item: PendingItem): void {
  const loaded = loadPending();
  const withoutDup = loaded.filter((i) => i.url !== item.url);
  pending.length = 0;
  pending.push(...withoutDup, item);
  savePending(pending);
}

/** Remove queued review(s) for the same URL (e.g. after a successful live POST so we do not replay). */
export function removePendingReviewForUrl(url: string): void {
  const loaded = loadPending();
  const filtered = loaded.filter((i) => i.url !== url);
  if (filtered.length === loaded.length) return;
  pending.length = 0;
  pending.push(...filtered);
  savePending(pending);
}

/** Syncs from localStorage then returns queue length (use before showing “pending sync” UI). */
export function getPendingCount(): number {
  const loaded = loadPending();
  pending.length = 0;
  pending.push(...loaded);
  return pending.length;
}

/**
 * POST each queued item via `post`; successful items are dropped, transient failures stay in the queue.
 * Permanent 4xx (except 408/429) are dropped so a stuck queue cannot block the UI forever.
 */
export async function flushPendingQueue(
  post: (url: string, payload: unknown) => Promise<unknown>
): Promise<{ flushed: number; failed: number; dropped: number }> {
  const loaded = loadPending();
  pending.length = 0;
  pending.push(...loaded);
  const stillPending: PendingItem[] = [];
  let flushed = 0;
  let dropped = 0;
  for (const item of pending) {
    try {
      await post(item.url, item.payload);
      flushed++;
    } catch (err) {
      const status = getResponseStatus(err);
      if (typeof status === 'number' && shouldDropQueueItemAfterFailure(status)) {
        dropped++;
        continue;
      }
      stillPending.push(item);
    }
  }
  pending.length = 0;
  pending.push(...stillPending);
  savePending(pending);
  return { flushed, failed: stillPending.length, dropped };
}

