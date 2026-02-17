import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ShortLoopPolicyService } from '@/services/short-loop-policy.service';
import { Card } from '@/types/database';
const isEnabledForUserMock = vi.hoisted(() => vi.fn());

vi.mock('@/config/env', () => ({
  DAY1_SHORT_LOOP_ENABLED: 'true',
  DAY1_SHORT_LOOP_MIN_GAP_SECONDS: 60,
  DAY1_SHORT_LOOP_MAX_GAP_SECONDS: 7200,
  DAY1_SHORT_LOOP_MAX_REPS_LIGHT: 3,
  DAY1_SHORT_LOOP_MAX_REPS_DEFAULT: 5,
  DAY1_SHORT_LOOP_MAX_REPS_INTENSIVE: 7,
  DAY1_SHORT_LOOP_FATIGUE_THRESHOLD: 0.8,
}));

vi.mock('@/services/feature-flag.service', () => ({
  FEATURE_FLAGS: {
    adaptiveRetentionPolicy: 'adaptive_retention_policy',
    day1ShortLoopPolicy: 'day1_short_loop_policy',
  },
  FeatureFlagService: vi.fn().mockImplementation(() => ({
    isEnabledForUser: (...args: unknown[]) => isEnabledForUserMock(...args),
  })),
}));

describe('ShortLoopPolicyService', () => {
  const userId = '11111111-1111-4111-8111-111111111111';
  const card: Card = {
    id: '22222222-2222-4222-8222-222222222222',
    user_id: userId,
    deck_id: '33333333-3333-4333-8333-333333333333',
    recto: 'Q',
    verso: 'A',
    comment: null,
    recto_image: null,
    verso_image: null,
    recto_formula: false,
    verso_formula: false,
    reverse: true,
    stability: null,
    difficulty: null,
    is_important: false,
    importance_updated_at: null,
    last_review: null,
    next_review: new Date(),
    created_at: new Date(),
    updated_at: new Date(),
  };

  const queryMock = vi.fn();
  const client = {
    query: queryMock,
  } as unknown as Parameters<ShortLoopPolicyService['evaluateAndPersist']>[0]['client'];

  beforeEach(() => {
    vi.clearAllMocks();
    isEnabledForUserMock.mockResolvedValue(true);
    queryMock
      .mockResolvedValueOnce({ rows: [] }) // today state
      .mockResolvedValueOnce({ rows: [{ review_count: 0, fail_ratio: 0, avg_duration_ms: 0 }] }) // fatigue
      .mockResolvedValueOnce({ rows: [] }); // upsert
  });

  it('returns reinsert decision for new card with Again', async () => {
    const service = new ShortLoopPolicyService();
    const result = await service.evaluateAndPersist({
      client,
      userId,
      card,
      rating: 1,
      sessionId: '44444444-4444-4444-8444-444444444444',
    });

    expect(result.action).toBe('reinsert_today');
    expect(result.nextGapSeconds).toBeGreaterThanOrEqual(60);
    expect(queryMock).toHaveBeenCalledTimes(3);
  });
});
