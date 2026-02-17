import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FeatureFlagService } from '@/services/feature-flag.service';
import { pool } from '@/config/database';

vi.mock('@/config/database', () => ({
  pool: {
    query: vi.fn(),
  },
}));

describe('FeatureFlagService', () => {
  let service: FeatureFlagService;
  const userId = '11111111-1111-4111-8111-111111111111';

  beforeEach(() => {
    vi.clearAllMocks();
    FeatureFlagService.clearCacheForTests();
    service = new FeatureFlagService();
  });

  it('returns fallback when flag row is missing', async () => {
    (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ rows: [] });

    const enabled = await service.isEnabledForUser({
      flagKey: 'adaptive_retention_policy',
      userId,
      fallback: true,
    });

    expect(enabled).toBe(true);
  });

  it('applies explicit user override before rollout logic', async () => {
    (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      rows: [{ override_enabled: false, flag_enabled: true, rollout_percentage: 100 }],
    });

    const enabled = await service.isEnabledForUser({
      flagKey: 'adaptive_retention_policy',
      userId,
      fallback: true,
    });

    expect(enabled).toBe(false);
  });

  it('returns deterministic result for percentage rollout', async () => {
    (pool.query as ReturnType<typeof vi.fn>).mockResolvedValue({
      rows: [{ override_enabled: null, flag_enabled: true, rollout_percentage: 30 }],
    });

    const first = await service.isEnabledForUser({
      flagKey: 'adaptive_retention_policy',
      userId,
      fallback: false,
    });

    const second = await service.isEnabledForUser({
      flagKey: 'adaptive_retention_policy',
      userId,
      fallback: false,
    });

    expect(second).toBe(first);
    expect(pool.query).toHaveBeenCalledTimes(1); // second read comes from cache
  });

  it('returns fallback when evaluation query fails', async () => {
    (pool.query as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('db unavailable'));

    const enabled = await service.isEnabledForUser({
      flagKey: 'adaptive_retention_policy',
      userId,
      fallback: false,
    });

    expect(enabled).toBe(false);
  });

  it('returns fallback when evaluation query times out', async () => {
    vi.useFakeTimers();
    (pool.query as ReturnType<typeof vi.fn>).mockReturnValue(new Promise(() => {}));

    const pending = service.isEnabledForUser({
      flagKey: 'adaptive_retention_policy',
      userId,
      fallback: true,
    });

    await vi.advanceTimersByTimeAsync(200);
    await expect(pending).resolves.toBe(true);
    vi.useRealTimers();
  });
});
