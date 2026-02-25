/**
 * Phase 4: Send data often; handle disconnection.
 * Retry with backoff, optional offline queue, and connection-aware helpers.
 */

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_BASE_DELAY_MS = 1000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Retry a promise-returning fn with exponential backoff. Does not retry on 4xx (except 408/429). */
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
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (typeof status === 'number' && status >= 400 && status < 500 && status !== 408 && status !== 429) {
        throw err;
      }
      if (attempt === maxAttempts) throw err;
      const delayMs = baseDelayMs * Math.pow(2, attempt - 1);
      await sleep(delayMs);
    }
  }
  throw lastError;
}

export type PendingItem =
  | { type: 'review'; url: string; payload: unknown }
  | { type: 'events'; url: string; payload: unknown };

const pending: PendingItem[] = [];
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

/** Add a failed review or events payload to the offline queue (in memory + localStorage). */
export function addToPendingQueue(item: PendingItem): void {
  pending.push(item);
  savePending(pending);
}

/** Get current pending count. */
export function getPendingCount(): number {
  const loaded = loadPending();
  pending.length = 0;
  pending.push(...loaded);
  return pending.length;
}

/** Flush pending items with the given post function. Removes each item on success. */
export async function flushPendingQueue(
  post: (url: string, payload: unknown) => Promise<unknown>
): Promise<{ flushed: number; failed: number }> {
  const loaded = loadPending();
  pending.length = 0;
  pending.push(...loaded);
  const stillPending: PendingItem[] = [];
  let flushed = 0;
  for (const item of pending) {
    try {
      await post(item.url, item.payload);
      flushed++;
    } catch {
      stillPending.push(item);
    }
  }
  pending.length = 0;
  pending.push(...stillPending);
  savePending(pending);
  return { flushed, failed: stillPending.length };
}

/** Study event payload for POST /api/study/events (or equivalent). */
export interface StudyEventPayload {
  eventType: string;
  clientEventId?: string;
  sessionId?: string;
  deckId?: string;
  cardId?: string;
  occurredAtClient?: number;
  sequenceInSession?: number;
  payload?: Record<string, unknown>;
}

export function buildStudyEventsBody(events: StudyEventPayload[]): { events: StudyEventPayload[] } {
  return { events };
}
