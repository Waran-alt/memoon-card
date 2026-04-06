import { describe, it, expect } from 'vitest';
import { shouldIncludeCardForSessionRepeat } from './review-correct-session.utils';
import type { ReviewWithLogId } from '@/services/review.service';

function makeResult(overrides: Partial<ReviewWithLogId>): ReviewWithLogId {
  return {
    interval: 1,
    retrievability: 0.9,
    message: 'ok',
    state: {
      stability: 2,
      difficulty: 5,
      lastReview: new Date(),
      nextReview: new Date(Date.now() + 86400000),
    },
    reviewLogId: 'log',
    ...overrides,
  };
}

describe('shouldIncludeCardForSessionRepeat', () => {
  it('is true when next_review is due', () => {
    expect(
      shouldIncludeCardForSessionRepeat(
        makeResult({
          interval: 5,
          state: {
            stability: 2,
            difficulty: 5,
            lastReview: new Date(),
            nextReview: new Date(Date.now() - 1000),
          },
        })
      )
    ).toBe(true);
  });

  it('is true when interval is under one day', () => {
    expect(
      shouldIncludeCardForSessionRepeat(
        makeResult({
          interval: 0.04,
          state: {
            stability: 0.5,
            difficulty: 5,
            lastReview: new Date(),
            nextReview: new Date(Date.now() + 10 * 60_000),
          },
        })
      )
    ).toBe(true);
  });

  it('is false when next is future and interval is >= 1 day', () => {
    expect(
      shouldIncludeCardForSessionRepeat(
        makeResult({
          interval: 5,
          state: {
            stability: 10,
            difficulty: 5,
            lastReview: new Date(),
            nextReview: new Date(Date.now() + 7 * 86400000),
          },
        })
      )
    ).toBe(false);
  });
});
