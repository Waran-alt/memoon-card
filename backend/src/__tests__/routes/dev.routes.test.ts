import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import devRoutes from '@/routes/dev.routes';
import { errorHandler } from '@/middleware/errorHandler';

const mockDevUserId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const listFlagsMock = vi.hoisted(() => vi.fn());
const updateFlagMock = vi.hoisted(() => vi.fn());
const listOverridesMock = vi.hoisted(() => vi.fn());
const upsertOverrideMock = vi.hoisted(() => vi.fn());
const deleteOverrideMock = vi.hoisted(() => vi.fn());

vi.mock('@/middleware/auth', () => ({
  getUserId: () => mockDevUserId,
}));

vi.mock('@/services/admin-feature-flags.service', () => ({
  AdminFeatureFlagsService: vi.fn().mockImplementation(() => ({
    listFlags: listFlagsMock,
    updateFlag: updateFlagMock,
    listOverrides: listOverridesMock,
    upsertOverride: upsertOverrideMock,
    deleteOverride: deleteOverrideMock,
  })),
}));

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/dev', devRoutes);
  app.use(errorHandler);
  return app;
}

describe('Dev routes (feature flags)', () => {
  const app = createApp();

  beforeEach(() => {
    vi.clearAllMocks();
    listFlagsMock.mockResolvedValue([]);
    updateFlagMock.mockResolvedValue({
      flagKey: 'adaptive_retention_policy',
      enabled: true,
      rolloutPercentage: 20,
      description: 'test',
      updatedAt: '2026-02-10T10:00:00.000Z',
      overrideCount: 0,
    });
    listOverridesMock.mockResolvedValue([]);
    upsertOverrideMock.mockResolvedValue({
      userId: '11111111-1111-4111-8111-111111111111',
      enabled: true,
      reason: 'canary',
      updatedAt: '2026-02-10T10:00:00.000Z',
    });
    deleteOverrideMock.mockResolvedValue(true);
  });

  it('lists feature flags', async () => {
    const res = await request(app).get('/api/dev/feature-flags');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: { flags: [] } });
    expect(listFlagsMock).toHaveBeenCalledTimes(1);
  });

  it('updates feature flag', async () => {
    const res = await request(app)
      .patch('/api/dev/feature-flags/adaptive_retention_policy')
      .send({ enabled: true, rolloutPercentage: 20, description: 'test' });
    expect(res.status).toBe(200);
    expect(updateFlagMock).toHaveBeenCalledWith(mockDevUserId, 'adaptive_retention_policy', {
      enabled: true,
      rolloutPercentage: 20,
      description: 'test',
    });
  });

  it('upserts and removes override', async () => {
    const putRes = await request(app)
      .put('/api/dev/feature-flags/adaptive_retention_policy/overrides/11111111-1111-4111-8111-111111111111')
      .send({ enabled: true, reason: 'canary' });
    expect(putRes.status).toBe(200);
    expect(upsertOverrideMock).toHaveBeenCalledTimes(1);

    const delRes = await request(app)
      .delete('/api/dev/feature-flags/adaptive_retention_policy/overrides/11111111-1111-4111-8111-111111111111');
    expect(delRes.status).toBe(204);
    expect(deleteOverrideMock).toHaveBeenCalledTimes(1);
  });
});
