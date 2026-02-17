import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FeatureFlagService } from '@/services/feature-flag.service';
import { pool } from '@/config/database';

vi.mock('@/config/database', () => ({
  pool: {
    query: vi.fn(),
  },
}));

describe('FeatureFlagService', () => {
  const service = new FeatureFlagService();
  const userId = '11111111-1111-4111-8111-111111111111';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns fallback when flag row is missing', async () => {
    (pool.query as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ rows: [] }) // no override
      .mockResolvedValueOnce({ rows: [] }); // no flag

    const enabled = await service.isEnabledForUser({
      flagKey: 'adaptive_retention_policy',
      userId,
      fallback: true,
    });

    expect(enabled).toBe(true);
  });

  it('applies explicit user override before rollout logic', async () => {
    (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ rows: [{ enabled: false }] });

    const enabled = await service.isEnabledForUser({
      flagKey: 'adaptive_retention_policy',
      userId,
      fallback: true,
    });

    expect(enabled).toBe(false);
  });

  it('returns deterministic result for percentage rollout', async () => {
    (pool.query as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ rows: [] }) // no override
      .mockResolvedValueOnce({ rows: [{ enabled: true, rollout_percentage: 30 }] }); // flag

    const first = await service.isEnabledForUser({
      flagKey: 'adaptive_retention_policy',
      userId,
      fallback: false,
    });

    (pool.query as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ enabled: true, rollout_percentage: 30 }] });

    const second = await service.isEnabledForUser({
      flagKey: 'adaptive_retention_policy',
      userId,
      fallback: false,
    });

    expect(second).toBe(first);
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
});
