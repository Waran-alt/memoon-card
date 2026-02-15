import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import optimizationRoutes from '@/routes/optimization.routes';
import { errorHandler } from '@/middleware/errorHandler';

const mockUserId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

const optimizationServiceMock = vi.hoisted(() => ({
  checkOptimizerAvailable: vi.fn(),
  getOptimizationEligibility: vi.fn(),
  canOptimize: vi.fn(),
  optimizeWeights: vi.fn(),
  exportReviewLogsToCSV: vi.fn(),
  getWeightSnapshots: vi.fn(),
  activateSnapshotVersion: vi.fn(),
}));

vi.mock('@/middleware/auth', () => ({
  getUserId: () => mockUserId,
}));

vi.mock('@/services/optimization.service', () => ({
  OptimizationService: vi.fn().mockImplementation(() => optimizationServiceMock),
}));

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/optimization', optimizationRoutes);
  app.use(errorHandler);
  return app;
}

describe('Optimization routes', () => {
  const app = createApp();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/optimization/status', () => {
    it('returns status with optimizer available and eligibility', async () => {
      optimizationServiceMock.checkOptimizerAvailable.mockResolvedValue({
        available: true,
        method: 'python3 (system)',
      });
      optimizationServiceMock.getOptimizationEligibility.mockResolvedValue({
        status: 'READY_TO_UPGRADE',
        totalReviews: 500,
        newReviewsSinceLast: 300,
        daysSinceLast: 20,
        minRequiredFirst: 400,
        minRequiredSubsequent: 200,
        minDaysSinceLast: 14,
        lastOptimizedAt: null,
        reviewCountSinceOptimization: 300,
      });

      const res = await request(app).get('/api/optimization/status');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toMatchObject({
        optimizerAvailable: true,
        optimizerMethod: 'python3 (system)',
        canOptimize: true,
        reviewCount: 500,
        minRequired: 200,
        status: 'READY_TO_UPGRADE',
      });
    });

    it('returns NOT_READY when total reviews below threshold', async () => {
      optimizationServiceMock.checkOptimizerAvailable.mockResolvedValue({ available: true });
      optimizationServiceMock.getOptimizationEligibility.mockResolvedValue({
        status: 'NOT_READY',
        totalReviews: 100,
        newReviewsSinceLast: 100,
        daysSinceLast: 0,
        minRequiredFirst: 400,
        minRequiredSubsequent: 200,
        minDaysSinceLast: 14,
        lastOptimizedAt: null,
        reviewCountSinceOptimization: 100,
      });

      const res = await request(app).get('/api/optimization/status');

      expect(res.status).toBe(200);
      expect(res.body.data.canOptimize).toBe(false);
      expect(res.body.data.status).toBe('NOT_READY');
      expect(res.body.data.minRequired).toBe(400);
    });
  });

  describe('POST /api/optimization/optimize', () => {
    it('returns 503 when optimizer not available', async () => {
      optimizationServiceMock.checkOptimizerAvailable.mockResolvedValue({ available: false });

      const res = await request(app).post('/api/optimization/optimize').send({});

      expect(res.status).toBe(503);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('not available');
    });

    it('returns 400 when user has not enough reviews', async () => {
      optimizationServiceMock.checkOptimizerAvailable.mockResolvedValue({ available: true });
      optimizationServiceMock.canOptimize.mockResolvedValue({
        canOptimize: false,
        reviewCount: 50,
        minRequired: 400,
      });

      const res = await request(app).post('/api/optimization/optimize').send({});

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.reviewCount).toBe(50);
      expect(res.body.minRequired).toBe(400);
    });

    it('returns 200 and success when optimization succeeds', async () => {
      optimizationServiceMock.checkOptimizerAvailable.mockResolvedValue({ available: true });
      optimizationServiceMock.canOptimize.mockResolvedValue({
        canOptimize: true,
        reviewCount: 500,
        minRequired: 400,
      });
      optimizationServiceMock.optimizeWeights.mockResolvedValue({
        success: true,
        weights: [0.4, 0.6, 1, 1.9, 7.9, 0.28, 1.14, 0.94, 0.16, 1.5, 0.08, 0.66, 1.8, 0.07, 0.27, 1.2, 0.8, 0.5, 0.2, 2, 0.3],
        message: 'FSRS weights optimized successfully',
      });

      const res = await request(app)
        .post('/api/optimization/optimize')
        .send({ timezone: 'UTC', dayStart: 4 });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.weights).toHaveLength(21);
      expect(res.body.data.message).toBe('FSRS weights optimized successfully');
      expect(optimizationServiceMock.optimizeWeights).toHaveBeenCalledWith(
        mockUserId,
        expect.objectContaining({ timezone: 'UTC', dayStart: 4 })
      );
    });

    it('returns 500 when optimization run fails', async () => {
      optimizationServiceMock.checkOptimizerAvailable.mockResolvedValue({ available: true });
      optimizationServiceMock.canOptimize.mockResolvedValue({
        canOptimize: true,
        reviewCount: 500,
        minRequired: 400,
      });
      optimizationServiceMock.optimizeWeights.mockResolvedValue({
        success: false,
        message: 'Failed to optimize FSRS weights',
        error: 'Python process exited with code 1',
      });

      const res = await request(app).post('/api/optimization/optimize').send({});

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('Python process');
    });

    it('rejects invalid body (dayStart out of range)', async () => {
      optimizationServiceMock.checkOptimizerAvailable.mockResolvedValue({ available: true });

      const res = await request(app)
        .post('/api/optimization/optimize')
        .send({ dayStart: 24 });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(optimizationServiceMock.optimizeWeights).not.toHaveBeenCalled();
    });
  });

  describe('GET /api/optimization/export', () => {
    it('calls export and returns 200 when file is sent', async () => {
      const { mkdir, writeFile } = await import('fs/promises');
      const { dirname } = await import('path');
      // Create the file when the service writes it so res.download can send it and the request completes
      optimizationServiceMock.exportReviewLogsToCSV.mockImplementation(
        async (_userId: string, csvPath: string) => {
          await mkdir(dirname(csvPath), { recursive: true });
          await writeFile(csvPath, 'card_id,review_time,rating\n');
        }
      );

      const res = await request(app).get('/api/optimization/export');

      expect(optimizationServiceMock.exportReviewLogsToCSV).toHaveBeenCalledWith(
        mockUserId,
        expect.any(String)
      );
      expect(res.status).toBe(200);
    });
  });

  describe('GET /api/optimization/snapshots', () => {
    it('returns snapshots with default limit', async () => {
      optimizationServiceMock.getWeightSnapshots.mockResolvedValue([
        { version: 2, is_active: true },
        { version: 1, is_active: false },
      ]);

      const res = await request(app).get('/api/optimization/snapshots');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.limit).toBe(20);
      expect(res.body.data.snapshots).toHaveLength(2);
      expect(optimizationServiceMock.getWeightSnapshots).toHaveBeenCalledWith(
        mockUserId,
        20
      );
    });

    it('accepts validated custom limit', async () => {
      optimizationServiceMock.getWeightSnapshots.mockResolvedValue([]);

      const res = await request(app).get('/api/optimization/snapshots?limit=5');

      expect(res.status).toBe(200);
      expect(res.body.data.limit).toBe(5);
      expect(optimizationServiceMock.getWeightSnapshots).toHaveBeenCalledWith(
        mockUserId,
        5
      );
    });

    it('rejects invalid limit', async () => {
      const res = await request(app).get('/api/optimization/snapshots?limit=0');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(optimizationServiceMock.getWeightSnapshots).not.toHaveBeenCalled();
    });
  });

  describe('POST /api/optimization/snapshots/:version/activate', () => {
    it('activates an existing snapshot version', async () => {
      optimizationServiceMock.activateSnapshotVersion.mockResolvedValue({
        version: 2,
        is_active: true,
      });

      const res = await request(app).post('/api/optimization/snapshots/2/activate');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.version).toBe(2);
      expect(optimizationServiceMock.activateSnapshotVersion).toHaveBeenCalledWith(
        mockUserId,
        2,
        undefined
      );
    });

    it('passes optional rollback reason to service', async () => {
      optimizationServiceMock.activateSnapshotVersion.mockResolvedValue({
        version: 1,
        is_active: true,
      });

      const res = await request(app)
        .post('/api/optimization/snapshots/1/activate')
        .send({ reason: 'quality regression detected' });

      expect(res.status).toBe(200);
      expect(optimizationServiceMock.activateSnapshotVersion).toHaveBeenCalledWith(
        mockUserId,
        1,
        'quality regression detected'
      );
    });

    it('returns 404 when snapshot version does not exist', async () => {
      optimizationServiceMock.activateSnapshotVersion.mockResolvedValue(null);

      const res = await request(app).post('/api/optimization/snapshots/999/activate');

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('rejects invalid version parameter', async () => {
      const res = await request(app).post('/api/optimization/snapshots/0/activate');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(optimizationServiceMock.activateSnapshotVersion).not.toHaveBeenCalled();
    });

    it('rejects invalid rollback reason body', async () => {
      const res = await request(app)
        .post('/api/optimization/snapshots/2/activate')
        .send({ reason: '' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(optimizationServiceMock.activateSnapshotVersion).not.toHaveBeenCalled();
    });
  });
});
