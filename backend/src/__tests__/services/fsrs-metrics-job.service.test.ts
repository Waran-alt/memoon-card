import { beforeEach, describe, expect, it, vi } from 'vitest';

const refreshRecentMetricsMock = vi.hoisted(() => vi.fn());
const poolQueryMock = vi.hoisted(() => vi.fn());
const loggerInfoMock = vi.hoisted(() => vi.fn());
const loggerErrorMock = vi.hoisted(() => vi.fn());

vi.mock('@/config/env', () => ({
  NODE_ENV: 'development',
  FSRS_METRICS_JOB_ENABLED: 'true',
  FSRS_METRICS_JOB_INTERVAL_MINUTES: 1,
  FSRS_METRICS_JOB_BACKFILL_DAYS: 7,
}));

vi.mock('@/config/database', () => ({
  pool: {
    query: (...args: unknown[]) => poolQueryMock(...args),
  },
}));

vi.mock('@/services/fsrs-metrics.service', () => ({
  FsrsMetricsService: vi.fn().mockImplementation(() => ({
    refreshRecentMetrics: (...args: unknown[]) => refreshRecentMetricsMock(...args),
  })),
}));

vi.mock('@/utils/logger', () => ({
  logger: {
    info: (...args: unknown[]) => loggerInfoMock(...args),
    error: (...args: unknown[]) => loggerErrorMock(...args),
  },
  serializeError: (error: unknown) => ({ message: String(error) }),
}));

import { FsrsMetricsJobService } from '@/services/fsrs-metrics-job.service';

describe('FsrsMetricsJobService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('runOnce refreshes metrics once per active user', async () => {
    poolQueryMock.mockResolvedValueOnce({
      rows: [
        { user_id: '11111111-1111-4111-8111-111111111111' },
        { user_id: '22222222-2222-4222-8222-222222222222' },
      ],
    });
    refreshRecentMetricsMock.mockResolvedValue(undefined);

    const service = new FsrsMetricsJobService();
    await service.runOnce();

    expect(poolQueryMock).toHaveBeenCalledWith(
      expect.stringContaining('SELECT DISTINCT user_id'),
      [7]
    );
    expect(refreshRecentMetricsMock).toHaveBeenNthCalledWith(
      1,
      '11111111-1111-4111-8111-111111111111',
      7
    );
    expect(refreshRecentMetricsMock).toHaveBeenNthCalledWith(
      2,
      '22222222-2222-4222-8222-222222222222',
      7
    );
    expect(loggerInfoMock).toHaveBeenCalledWith(
      'FSRS metrics job completed',
      expect.objectContaining({ userCount: 2, backfillDays: 7 })
    );
  });

  it('runOnce logs and swallows errors', async () => {
    poolQueryMock.mockRejectedValueOnce(new Error('db down'));

    const service = new FsrsMetricsJobService();
    await service.runOnce();

    expect(refreshRecentMetricsMock).not.toHaveBeenCalled();
    expect(loggerErrorMock).toHaveBeenCalledWith(
      'FSRS metrics job failed',
      expect.any(Object)
    );
  });
});
