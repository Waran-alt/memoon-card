import { beforeEach, describe, expect, it, vi } from 'vitest';
import { pool } from '@/config/database';
import {
  getShortTermEligibility,
  canOptimizeShortTerm,
  optimizeShortTerm,
} from '@/services/short-term-optimization.service';

vi.mock('@/config/database', () => ({
  pool: {
    query: vi.fn(),
  },
}));

const mockQuery = pool.query as ReturnType<typeof vi.fn>;
const userId = '11111111-1111-4111-8111-111111111111';

describe('Short-term optimization service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getShortTermEligibility', () => {
    it('returns NOT_READY when learning review count below min first', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] }) // getUserSettings -> no row, default lastAt null
        .mockResolvedValueOnce({ rows: [{ count: '30' }] }); // getLearningReviewCount

      const result = await getShortTermEligibility(userId);

      expect(result.status).toBe('NOT_READY');
      expect(result.learningReviewCount).toBe(30);
      expect(result.minRequiredFirst).toBe(50);
      expect(mockQuery).toHaveBeenNthCalledWith(1, expect.stringContaining('user_settings'), [userId]);
      expect(mockQuery).toHaveBeenNthCalledWith(2, expect.stringContaining('review_state = ANY'), [userId, expect.any(Array)]);
    });

    it('returns READY_TO_UPGRADE when never optimized and enough reviews', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ user_id: userId, learning_last_optimized_at: null }] }) // getUserSettings
        .mockResolvedValueOnce({ rows: [{ count: '80' }] }); // getLearningReviewCount

      const result = await getShortTermEligibility(userId);

      expect(result.status).toBe('READY_TO_UPGRADE');
      expect(result.learningReviewCount).toBe(80);
      expect(result.lastOptimizedAt).toBeNull();
    });

    it('returns OPTIMIZED when recently optimized and few new reviews', async () => {
      const lastAt = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000); // 2 days ago
      mockQuery
        .mockResolvedValueOnce({
          rows: [{ user_id: userId, learning_last_optimized_at: lastAt }],
        }) // getUserSettings
        .mockResolvedValueOnce({ rows: [{ count: '100' }] }) // getLearningReviewCount
        .mockResolvedValueOnce({ rows: [{ count: '5' }] }); // getLearningReviewsSince

      const result = await getShortTermEligibility(userId);

      expect(result.status).toBe('OPTIMIZED');
      expect(result.learningReviewCount).toBe(100);
      expect(result.newLearningReviewsSinceLast).toBe(5);
    });
  });

  describe('canOptimizeShortTerm', () => {
    it('returns canOptimize false when NOT_READY', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: '20' }] });

      const result = await canOptimizeShortTerm(userId);

      expect(result.canOptimize).toBe(false);
      expect(result.learningReviewCount).toBe(20);
      expect(result.minRequired).toBe(50);
    });

    it('returns canOptimize true when READY_TO_UPGRADE', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ user_id: userId, learning_last_optimized_at: null }] })
        .mockResolvedValueOnce({ rows: [{ count: '60' }] });

      const result = await canOptimizeShortTerm(userId);

      expect(result.canOptimize).toBe(true);
      expect(result.minRequired).toBe(20); // minRequiredSubsequent when READY_TO_UPGRADE
    });
  });

  describe('optimizeShortTerm', () => {
    it('returns success false when not eligible', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: '10' }] });

      const result = await optimizeShortTerm(userId);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Not enough learning-phase reviews');
      expect(result.message).toContain('50');
      expect(result.message).toContain('10');
      expect(mockQuery).not.toHaveBeenCalledWith(
        expect.stringContaining('learning_short_fsrs_params'),
        expect.any(Array)
      );
    });

    it('fetches logs, fits params, and updates user_settings when eligible', async () => {
      const lastAt = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      mockQuery
        .mockResolvedValueOnce({ rows: [{ user_id: userId, learning_last_optimized_at: lastAt }] }) // getUserSettings (canOptimize)
        .mockResolvedValueOnce({ rows: [{ count: '70' }] })
        .mockResolvedValueOnce({ rows: [{ count: '70' }] })
        .mockResolvedValueOnce({
          rows: [
            {
              card_id: 'c0000000-0000-4000-8000-000000000001',
              review_time: String(Date.now() - 60000),
              rating: 3,
              review_state: 0,
            },
            {
              card_id: 'c0000000-0000-4000-8000-000000000001',
              review_time: String(Date.now() - 30000),
              rating: 4,
              review_state: 1,
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] }); // UPDATE user_settings

      const result = await optimizeShortTerm(userId);

      expect(result.success).toBe(true);
      expect(result.message).toContain('fitted and saved');
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('SELECT card_id, review_time, rating, review_state'),
        [userId, expect.any(Array)]
      );
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('learning_short_fsrs_params'),
        [userId, expect.any(String), expect.any(Date)]
      );
    });
  });
});
