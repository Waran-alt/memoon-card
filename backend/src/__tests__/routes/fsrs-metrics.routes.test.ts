import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import fsrsMetricsRoutes from '@/routes/fsrs-metrics.routes';
import { errorHandler } from '@/middleware/errorHandler';

const mockUserId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

const fsrsMetricsServiceMock = vi.hoisted(() => ({
  getDailyMetrics: vi.fn(),
  getSummary: vi.fn(),
  getSessionMetrics: vi.fn(),
  getWindows: vi.fn(),
  refreshRecentMetrics: vi.fn(),
}));

vi.mock('@/middleware/auth', () => ({
  getUserId: () => mockUserId,
}));

vi.mock('@/services/fsrs-metrics.service', () => ({
  FsrsMetricsService: vi.fn().mockImplementation(() => fsrsMetricsServiceMock),
}));

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/optimization/metrics', fsrsMetricsRoutes);
  app.use(errorHandler);
  return app;
}

describe('FSRS metrics routes', () => {
  const app = createApp();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('GET /daily returns rows with default days=30', async () => {
    fsrsMetricsServiceMock.getDailyMetrics.mockResolvedValue([
      {
        metricDate: '2026-02-10',
        reviewCount: 12,
        passCount: 10,
        failCount: 2,
      },
    ]);

    const res = await request(app).get('/api/optimization/metrics/daily');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.days).toBe(30);
    expect(fsrsMetricsServiceMock.getDailyMetrics).toHaveBeenCalledWith(mockUserId, 30);
  });

  it('GET /daily accepts validated days query', async () => {
    fsrsMetricsServiceMock.getDailyMetrics.mockResolvedValue([]);

    const res = await request(app).get('/api/optimization/metrics/daily?days=45');

    expect(res.status).toBe(200);
    expect(res.body.data.days).toBe(45);
    expect(fsrsMetricsServiceMock.getDailyMetrics).toHaveBeenCalledWith(mockUserId, 45);
  });

  it('GET /summary returns summary payload', async () => {
    fsrsMetricsServiceMock.getSummary.mockResolvedValue({
      days: 30,
      current: { reviewCount: 200, reliability: 'high' },
    });

    const res = await request(app).get('/api/optimization/metrics/summary?days=30');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.days).toBe(30);
    expect(fsrsMetricsServiceMock.getSummary).toHaveBeenCalledWith(mockUserId, 30);
  });

  it('GET /sessions returns session rows', async () => {
    fsrsMetricsServiceMock.getSessionMetrics.mockResolvedValue([
      { sessionId: '11111111-1111-4111-8111-111111111111', reviewCount: 20 },
    ]);

    const res = await request(app).get('/api/optimization/metrics/sessions?days=14');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.days).toBe(14);
    expect(fsrsMetricsServiceMock.getSessionMetrics).toHaveBeenCalledWith(mockUserId, 14);
  });

  it('GET /windows returns volume windows', async () => {
    fsrsMetricsServiceMock.getWindows.mockResolvedValue({
      reviewWindows: [],
      sessionWindow: { sessionCount: 0, reviewCount: 0 },
    });

    const res = await request(app).get('/api/optimization/metrics/windows');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(fsrsMetricsServiceMock.getWindows).toHaveBeenCalledWith(mockUserId);
  });

  it('POST /refresh recomputes and returns fresh summary', async () => {
    fsrsMetricsServiceMock.refreshRecentMetrics.mockResolvedValue(undefined);
    fsrsMetricsServiceMock.getSummary.mockResolvedValue({
      days: 30,
      current: { reviewCount: 50, reliability: 'medium' },
    });

    const res = await request(app)
      .post('/api/optimization/metrics/refresh')
      .send({ days: 30 });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.refreshed).toBe(true);
    expect(fsrsMetricsServiceMock.refreshRecentMetrics).toHaveBeenCalledWith(mockUserId, 30);
    expect(fsrsMetricsServiceMock.getSummary).toHaveBeenCalledWith(mockUserId, 30);
  });

  it('POST /refresh rejects invalid body', async () => {
    const res = await request(app)
      .post('/api/optimization/metrics/refresh')
      .send({ days: 0 });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(fsrsMetricsServiceMock.refreshRecentMetrics).not.toHaveBeenCalled();
  });

  it('GET /daily rejects invalid days query', async () => {
    const res = await request(app).get('/api/optimization/metrics/daily?days=2');

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(fsrsMetricsServiceMock.getDailyMetrics).not.toHaveBeenCalled();
  });
});
