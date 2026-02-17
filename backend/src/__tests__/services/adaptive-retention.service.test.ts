import { beforeEach, describe, expect, it, vi } from 'vitest';

const poolQueryMock = vi.hoisted(() => vi.fn());
const getSummaryMock = vi.hoisted(() => vi.fn());
const getWindowsMock = vi.hoisted(() => vi.fn());
const isEnabledForUserMock = vi.hoisted(() => vi.fn());

vi.mock('@/config/env', () => ({
  ADAPTIVE_RETENTION_ENABLED: 'true',
  ADAPTIVE_RETENTION_MIN: 0.85,
  ADAPTIVE_RETENTION_MAX: 0.95,
  ADAPTIVE_RETENTION_DEFAULT: 0.9,
  ADAPTIVE_RETENTION_STEP: 0.01,
}));

vi.mock('@/config/database', () => ({
  pool: {
    query: (...args: unknown[]) => poolQueryMock(...args),
  },
}));

vi.mock('@/services/fsrs-metrics.service', () => ({
  FsrsMetricsService: vi.fn().mockImplementation(() => ({
    getSummary: (...args: unknown[]) => getSummaryMock(...args),
    getWindows: (...args: unknown[]) => getWindowsMock(...args),
  })),
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

import { AdaptiveRetentionService } from '@/services/adaptive-retention.service';

describe('AdaptiveRetentionService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isEnabledForUserMock.mockResolvedValue(true);
  });

  it('returns low confidence recommendation when evidence is insufficient', async () => {
    poolQueryMock.mockResolvedValueOnce({ rows: [{ target_retention: 0.9 }] });
    getSummaryMock.mockResolvedValueOnce({
      current: { reliability: 'low', observedRecallRate: 0.8, avgPredictedRecall: 0.82, avgBrierScore: 0.2 },
    });
    getWindowsMock.mockResolvedValueOnce({
      sessionWindow: { reviewCount: 40, sessionCount: 3 },
    });

    const service = new AdaptiveRetentionService();
    const result = await service.computeRecommendedTarget('11111111-1111-4111-8111-111111111111');

    expect(result.confidence).toBe('low');
    expect(result.recommendedTarget).toBe(0.9);
    expect(result.reasons).toContain('insufficient_evidence');
  });

  it('recommends increasing target when observed recall is below predicted', async () => {
    poolQueryMock.mockResolvedValueOnce({ rows: [{ target_retention: 0.9 }] });
    getSummaryMock.mockResolvedValueOnce({
      current: { reliability: 'high', observedRecallRate: 0.72, avgPredictedRecall: 0.8, avgBrierScore: 0.24 },
    });
    getWindowsMock.mockResolvedValueOnce({
      sessionWindow: { reviewCount: 620, sessionCount: 26 },
    });

    const service = new AdaptiveRetentionService();
    const result = await service.computeRecommendedTarget('11111111-1111-4111-8111-111111111111');

    expect(result.confidence).toBe('high');
    expect(result.recommendedTarget).toBe(0.92); // +step for gap, +step for high brier
    expect(result.reasons).toContain('observed_below_predicted');
    expect(result.reasons).toContain('high_brier_score');
  });
});
