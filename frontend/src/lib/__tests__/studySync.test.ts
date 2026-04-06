import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
  addToPendingQueue,
  flushPendingQueue,
  getPendingCount,
  removePendingReviewForUrl,
} from '@/lib/studySync';

beforeEach(() => {
  localStorage.clear();
});

describe('studySync queue', () => {
  it('dedupes addToPendingQueue by url', () => {
    addToPendingQueue({ type: 'review', url: '/api/cards/a/review', payload: { x: 1 } });
    addToPendingQueue({ type: 'review', url: '/api/cards/a/review', payload: { x: 2 } });
    expect(getPendingCount()).toBe(1);
  });

  it('removePendingReviewForUrl clears matching item', () => {
    addToPendingQueue({ type: 'review', url: '/api/cards/a/review', payload: {} });
    removePendingReviewForUrl('/api/cards/a/review');
    expect(getPendingCount()).toBe(0);
  });

  it('flushPendingQueue drops permanent 4xx but keeps 401', async () => {
    addToPendingQueue({ type: 'review', url: '/api/cards/bad/review', payload: {} });
    addToPendingQueue({ type: 'review', url: '/api/cards/auth/review', payload: {} });
    const post = vi.fn((url: string) => {
      if (url.includes('/bad/')) return Promise.reject({ response: { status: 400 } });
      return Promise.reject({ response: { status: 401 } });
    });
    const r = await flushPendingQueue(post);
    expect(r.dropped).toBe(1);
    expect(r.failed).toBe(1);
    expect(getPendingCount()).toBe(1);
  });
});
