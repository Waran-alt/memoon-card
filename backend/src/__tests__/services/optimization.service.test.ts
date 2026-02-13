import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OptimizationService } from '@/services/optimization.service';
import { pool } from '@/config/database';
import { logger } from '@/utils/logger';
import { OPTIMIZER_CONFIG } from '@/constants/optimization.constants';
import { ValidationError } from '@/utils/errors';

const mockWriteFile = vi.hoisted(() => vi.fn());
const mockMkdir = vi.hoisted(() => vi.fn());
const mockUnlink = vi.hoisted(() => vi.fn());
const mockExecAsync = vi.hoisted(() => vi.fn());

vi.mock('fs/promises', () => ({
  writeFile: (...args: unknown[]) => mockWriteFile(...args),
  mkdir: (...args: unknown[]) => mockMkdir(...args),
  unlink: (...args: unknown[]) => mockUnlink(...args),
}));

vi.mock('util', () => ({
  promisify: () => mockExecAsync,
}));

vi.mock('@/config/database', () => ({
  pool: {
    query: vi.fn(),
  },
}));

vi.mock('@/utils/logger', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
  serializeError: (error: unknown) => ({ message: String(error) }),
}));

describe('OptimizationService', () => {
  let service: OptimizationService;
  let serviceAccess: {
    parseOptimizerOutput: (stdout: string, stderr: string) => number[] | null;
    getUserSettings: (userId: string) => Promise<{ last_optimized_at: Date | null; timezone?: string; day_start?: number }>;
    getNewReviewsSinceLast: (userId: string, lastOptimizedAt: Date | null) => Promise<number>;
    updateUserWeights: (userId: string, weights: number[]) => Promise<void>;
    exportReviewLogsToCSV: (userId: string, outputPath: string) => Promise<void>;
  };
  const userId = '11111111-1111-4111-8111-111111111111';

  beforeEach(() => {
    service = new OptimizationService();
    serviceAccess = service as unknown as typeof serviceAccess;
    vi.clearAllMocks();
    mockMkdir.mockResolvedValue(undefined);
    mockWriteFile.mockResolvedValue(undefined);
    mockUnlink.mockResolvedValue(undefined);
  });

  it('rejects invalid user id in exportReviewLogsToCSV', async () => {
    await expect(service.exportReviewLogsToCSV('invalid-user-id', '/tmp/revlog.csv')).rejects.toBeInstanceOf(
      ValidationError
    );
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('parses 21 weights from JSON-like optimizer output', () => {
    const weights = Array.from({ length: 21 }, (_, i) => Number((i + 0.1).toFixed(2)));
    const stdout = `Optimizer done. Weights=${JSON.stringify(weights)}`;
    const parsed = serviceAccess.parseOptimizerOutput(stdout, '');
    expect(parsed).toEqual(weights);
  });

  it('returns null and logs when optimizer output cannot be parsed', () => {
    const parsed = serviceAccess.parseOptimizerOutput('no weights here', 'still no weights');
    expect(parsed).toBeNull();
    expect(logger.error).toHaveBeenCalled();
  });

  it('returns min review thresholds based on optimization history', () => {
    expect(service.getMinReviewCount(false)).toBe(OPTIMIZER_CONFIG.MIN_REVIEW_COUNT_FIRST);
    expect(service.getMinReviewCount(true)).toBe(OPTIMIZER_CONFIG.MIN_REVIEW_COUNT_SUBSEQUENT);
  });

  it('reports NOT_READY eligibility on first run when total reviews are below first threshold', async () => {
    vi.spyOn(serviceAccess, 'getUserSettings').mockResolvedValue({
      last_optimized_at: null,
    });
    (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      rows: [{ count: String(OPTIMIZER_CONFIG.MIN_REVIEW_COUNT_FIRST - 1) }],
    });

    const result = await service.getOptimizationEligibility(userId);
    expect(result.status).toBe('NOT_READY');
    expect(result.totalReviews).toBe(OPTIMIZER_CONFIG.MIN_REVIEW_COUNT_FIRST - 1);
    expect(result.newReviewsSinceLast).toBe(OPTIMIZER_CONFIG.MIN_REVIEW_COUNT_FIRST - 1);
  });

  it('reports OPTIMIZED when recent optimization has insufficient new reviews and days', async () => {
    const lastOptimizedAt = new Date(Date.now() - 2 * OPTIMIZER_CONFIG.MS_PER_DAY);
    vi.spyOn(serviceAccess, 'getUserSettings').mockResolvedValue({ last_optimized_at: lastOptimizedAt });
    vi.spyOn(serviceAccess, 'getNewReviewsSinceLast').mockResolvedValue(
      OPTIMIZER_CONFIG.MIN_REVIEW_COUNT_SUBSEQUENT - 1
    );
    (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      rows: [{ count: String(OPTIMIZER_CONFIG.MIN_REVIEW_COUNT_FIRST + 20) }],
    });

    const result = await service.getOptimizationEligibility(userId);
    expect(result.status).toBe('OPTIMIZED');
    expect(result.newReviewsSinceLast).toBe(OPTIMIZER_CONFIG.MIN_REVIEW_COUNT_SUBSEQUENT - 1);
    expect(result.daysSinceLast).toBeLessThan(OPTIMIZER_CONFIG.MIN_DAYS_SINCE_LAST_OPT);
  });

  describe('exportReviewLogsToCSV', () => {
    it('exports review logs to CSV file successfully', async () => {
      const mockRows = [
        {
          card_id: 'card-1',
          review_time: 1000000,
          review_rating: 3,
          review_state: 2,
          review_duration: 5000,
        },
        {
          card_id: 'card-2',
          review_time: 2000000,
          review_rating: 4,
          review_state: null,
          review_duration: null,
        },
      ];
      (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ rows: mockRows });

      await service.exportReviewLogsToCSV(userId, '/tmp/test.csv');

      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT'),
        [userId]
      );
      expect(mockWriteFile).toHaveBeenCalledWith(
        '/tmp/test.csv',
        expect.stringContaining('card_id,review_time,review_rating,review_state,review_duration'),
        'utf-8'
      );
      const csvContent = mockWriteFile.mock.calls[0][1];
      expect(csvContent).toContain('card-1,1000000,3,2,5000');
      expect(csvContent).toContain('card-2,2000000,4,');
    });

    it('throws error when no review logs found', async () => {
      (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ rows: [] });

      await expect(service.exportReviewLogsToCSV(userId, '/tmp/test.csv')).rejects.toThrow(
        'No review logs found for user'
      );
    });
  });

  describe('parseOptimizerOutput', () => {
    it('parses Python list format', () => {
      const weights = Array.from({ length: 21 }, (_, i) => 0.1 + i * 0.1);
      const stdout = `[${weights.join(', ')}]`;
      const parsed = serviceAccess.parseOptimizerOutput(stdout, '');
      expect(parsed).toEqual(weights);
    });

    it('parses space-separated decimal numbers', () => {
      const weights = Array.from({ length: 21 }, (_, i) => 0.1 + i * 0.1);
      const stdout = weights.map(w => w.toFixed(2)).join(' ');
      const parsed = serviceAccess.parseOptimizerOutput(stdout, '');
      expect(parsed).toEqual(weights.map(w => parseFloat(w.toFixed(2))));
    });

    it('parses weights from stderr', () => {
      const weights = Array.from({ length: 21 }, (_, i) => 0.1 + i * 0.1);
      const stderr = `Error output but weights: [${weights.join(', ')}]`;
      const parsed = serviceAccess.parseOptimizerOutput('', stderr);
      expect(parsed).toEqual(weights);
    });
  });

  describe('checkOptimizerAvailable', () => {
    it('returns available when python3 command succeeds', async () => {
      mockExecAsync.mockResolvedValueOnce({ stdout: '', stderr: '' });
      const result = await service.checkOptimizerAvailable();
      expect(result.available).toBe(true);
      expect(result.method).toBe('python3 (system)');
    });

    it('returns unavailable when all commands fail', async () => {
      mockExecAsync.mockRejectedValue(new Error('Command failed'));
      const result = await service.checkOptimizerAvailable();
      expect(result.available).toBe(false);
      expect(result.method).toBeUndefined();
    });
  });

  describe('canOptimize', () => {
    it('returns canOptimize false when NOT_READY', async () => {
      vi.spyOn(serviceAccess, 'getUserSettings').mockResolvedValue({ last_optimized_at: null });
      (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        rows: [{ count: String(OPTIMIZER_CONFIG.MIN_REVIEW_COUNT_FIRST - 1) }],
      });

      const result = await service.canOptimize(userId);
      expect(result.canOptimize).toBe(false);
      expect(result.minRequired).toBe(OPTIMIZER_CONFIG.MIN_REVIEW_COUNT_FIRST);
    });

    it('returns canOptimize true when READY_TO_UPGRADE', async () => {
      vi.spyOn(serviceAccess, 'getUserSettings').mockResolvedValue({ last_optimized_at: null });
      (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        rows: [{ count: String(OPTIMIZER_CONFIG.MIN_REVIEW_COUNT_FIRST + 10) }],
      });

      const result = await service.canOptimize(userId);
      expect(result.canOptimize).toBe(true);
      // Implementation uses minRequiredSubsequent for READY_TO_UPGRADE status
      expect(result.minRequired).toBe(OPTIMIZER_CONFIG.MIN_REVIEW_COUNT_SUBSEQUENT);
    });

    it('returns canOptimize true with subsequent minRequired when previously optimized', async () => {
      const lastOptimizedAt = new Date(Date.now() - 20 * OPTIMIZER_CONFIG.MS_PER_DAY);
      vi.spyOn(serviceAccess, 'getUserSettings').mockResolvedValue({ last_optimized_at: lastOptimizedAt });
      vi.spyOn(serviceAccess, 'getNewReviewsSinceLast').mockResolvedValue(
        OPTIMIZER_CONFIG.MIN_REVIEW_COUNT_SUBSEQUENT + 10
      );
      (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        rows: [{ count: String(OPTIMIZER_CONFIG.MIN_REVIEW_COUNT_FIRST + 50) }],
      });

      const result = await service.canOptimize(userId);
      expect(result.canOptimize).toBe(true);
      expect(result.minRequired).toBe(OPTIMIZER_CONFIG.MIN_REVIEW_COUNT_SUBSEQUENT);
    });
  });

  describe('getUserOptimizationInfo', () => {
    it('returns optimization info with review count', async () => {
      const lastOptimizedAt = new Date(Date.now() - 5 * OPTIMIZER_CONFIG.MS_PER_DAY);
      vi.spyOn(serviceAccess, 'getUserSettings').mockResolvedValue({
        last_optimized_at: lastOptimizedAt,
      });
      vi.spyOn(serviceAccess, 'getNewReviewsSinceLast').mockResolvedValue(50);

      const result = await service.getUserOptimizationInfo(userId);
      expect(result.lastOptimizedAt).toBe(lastOptimizedAt.toISOString());
      expect(result.reviewCountSinceOptimization).toBe(50);
    });

    it('returns null lastOptimizedAt when never optimized', async () => {
      vi.spyOn(serviceAccess, 'getUserSettings').mockResolvedValue({ last_optimized_at: null });
      vi.spyOn(serviceAccess, 'getNewReviewsSinceLast').mockResolvedValue(100);

      const result = await service.getUserOptimizationInfo(userId);
      expect(result.lastOptimizedAt).toBeNull();
      expect(result.reviewCountSinceOptimization).toBe(100);
    });
  });

  describe('getNewReviewsSinceLast', () => {
    it('returns total count when never optimized', async () => {
      (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        rows: [{ count: '150' }],
      });

      const count = await serviceAccess.getNewReviewsSinceLast(userId, null);
      expect(count).toBe(150);
      expect(pool.query).toHaveBeenCalledWith(
        'SELECT COUNT(*) as count FROM review_logs WHERE user_id = $1',
        [userId]
      );
    });

    it('returns count since last optimization', async () => {
      const lastOptimizedAt = new Date(1000000);
      (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        rows: [{ count: '75' }],
      });

      const count = await serviceAccess.getNewReviewsSinceLast(userId, lastOptimizedAt);
      expect(count).toBe(75);
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('review_time >'),
        [userId, lastOptimizedAt.getTime()]
      );
    });
  });

  describe('optimizeWeights', () => {
    beforeEach(() => {
      // Mock successful CSV export
      vi.spyOn(serviceAccess, 'exportReviewLogsToCSV').mockResolvedValue(undefined);
      vi.spyOn(serviceAccess, 'getUserSettings').mockResolvedValue({
        last_optimized_at: null,
        timezone: 'UTC',
        day_start: 4,
      });
      vi.spyOn(serviceAccess, 'updateUserWeights').mockResolvedValue(undefined);
    });

    it('successfully optimizes weights and updates user settings', async () => {
      const weights = Array.from({ length: 21 }, (_, i) => 0.1 + i * 0.1);
      mockExecAsync.mockResolvedValueOnce({
        stdout: JSON.stringify(weights),
        stderr: '',
      });
      vi.spyOn(serviceAccess, 'parseOptimizerOutput').mockReturnValue(weights);

      const result = await service.optimizeWeights(userId);

      expect(result.success).toBe(true);
      expect(result.weights).toEqual(weights);
      expect(serviceAccess.updateUserWeights).toHaveBeenCalledWith(userId, weights);
      expect(mockUnlink).toHaveBeenCalled(); // Cleanup CSV
    });

    it('uses config timezone and dayStart when provided', async () => {
      const weights = Array.from({ length: 21 }, (_, i) => 0.1 + i * 0.1);
      mockExecAsync.mockResolvedValueOnce({
        stdout: JSON.stringify(weights),
        stderr: '',
      });
      vi.spyOn(serviceAccess, 'parseOptimizerOutput').mockReturnValue(weights);

      await service.optimizeWeights(userId, {
        timezone: 'America/New_York',
        dayStart: 6,
      });

      expect(mockExecAsync).toHaveBeenCalled();
      const execCall = mockExecAsync.mock.calls[0];
      expect(execCall[1].env).toHaveProperty('TZ', 'America/New_York');
      expect(execCall[1].env).toHaveProperty('DAY_START', '6');
    });

    it('returns error when optimizer command fails', async () => {
      mockExecAsync.mockRejectedValue(new Error('Command not found'));

      const result = await service.optimizeWeights(userId);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to run FSRS Optimizer');
      expect(mockUnlink).toHaveBeenCalled(); // Cleanup on error
    });

    it('returns error when optimizer output is invalid', async () => {
      mockExecAsync.mockResolvedValueOnce({
        stdout: 'invalid output',
        stderr: '',
      });
      vi.spyOn(serviceAccess, 'parseOptimizerOutput').mockReturnValue(null);

      const result = await service.optimizeWeights(userId);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid optimizer output');
    });

    it('returns error when weights array length is not 21', async () => {
      const weights = [1, 2, 3]; // Wrong length
      mockExecAsync.mockResolvedValueOnce({
        stdout: JSON.stringify(weights),
        stderr: '',
      });
      vi.spyOn(serviceAccess, 'parseOptimizerOutput').mockReturnValue(weights);

      const result = await service.optimizeWeights(userId);

      expect(result.success).toBe(false);
      expect(result.error).toContain('expected 21 weights');
    });

    it('rejects invalid user id', async () => {
      await expect(service.optimizeWeights('invalid-id')).rejects.toBeInstanceOf(ValidationError);
    });
  });
});
