import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FsrsMetricsService } from '@/services/fsrs-metrics.service';
import { pool } from '@/config/database';

vi.mock('@/config/database', () => ({
  pool: {
    query: vi.fn(),
  },
}));

describe('FsrsMetricsService', () => {
  const userId = '11111111-1111-4111-8111-111111111111';
  let service: FsrsMetricsService;

  beforeEach(() => {
    service = new FsrsMetricsService();
    vi.clearAllMocks();
  });

  it('refreshRecentMetrics runs daily and session upserts', async () => {
    (pool.query as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    await service.refreshRecentMetrics(userId, 14);

    expect(pool.query).toHaveBeenCalledTimes(2);
    expect(pool.query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('INSERT INTO user_fsrs_daily_metrics'),
      [userId, 14]
    );
    expect(pool.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('INSERT INTO user_fsrs_session_metrics'),
      [userId, 14]
    );
  });

  it('getSummary computes deltas and reliability from sample size', async () => {
    vi.spyOn(service, 'refreshRecentMetrics').mockResolvedValue(undefined);

    (pool.query as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        rows: [{
          review_count: 220,
          pass_count: 180,
          fail_count: 40,
          observed_recall_rate: 0.8181818,
          avg_predicted_recall: 0.8,
          avg_brier_score: 0.15,
        }],
      })
      .mockResolvedValueOnce({
        rows: [{
          review_count: 100,
          pass_count: 75,
          fail_count: 25,
          observed_recall_rate: 0.75,
          avg_predicted_recall: 0.77,
          avg_brier_score: 0.2,
        }],
      });

    const result = await service.getSummary(userId, 30);

    expect(result.current.reviewCount).toBe(220);
    expect(result.current.reliability).toBe('high');
    expect(result.current.avgBrierScore).toBe(0.15);
    expect(result.previous.reviewCount).toBe(100);
    expect(result.deltas.reviewCount).toBe(120);
    expect(result.deltas.observedRecallRate).toBeCloseTo(0.0681818, 6);
    expect(result.deltas.avgPredictedRecall).toBeCloseTo(0.03, 6);
    expect(result.deltas.avgBrierScore).toBeCloseTo(-0.05, 6);
  });

  it('getWindows assigns reliability buckets for review windows', async () => {
    vi.spyOn(service, 'refreshRecentMetrics').mockResolvedValue(undefined);

    (pool.query as ReturnType<typeof vi.fn>)
      // window 100
      .mockResolvedValueOnce({
        rows: [{
          review_count: 10,
          pass_count: 7,
          fail_count: 3,
          observed_recall_rate: 0.7,
          avg_predicted_recall: 0.72,
          brier_score: 0.21,
        }],
      })
      // window 300
      .mockResolvedValueOnce({
        rows: [{
          review_count: 120,
          pass_count: 95,
          fail_count: 25,
          observed_recall_rate: 0.7916666,
          avg_predicted_recall: 0.78,
          brier_score: 0.17,
        }],
      })
      // window 1000
      .mockResolvedValueOnce({
        rows: [{
          review_count: 260,
          pass_count: 210,
          fail_count: 50,
          observed_recall_rate: 0.8076923,
          avg_predicted_recall: 0.8,
          brier_score: 0.16,
        }],
      })
      // session window aggregate
      .mockResolvedValueOnce({
        rows: [{
          session_count: 8,
          review_count: 390,
          observed_recall_rate: 0.79,
          avg_brier_score: 0.18,
          avg_fatigue_slope: -0.012,
        }],
      });

    const result = await service.getWindows(userId);

    expect(result.reviewWindows).toHaveLength(3);
    expect(result.reviewWindows[0].windowSize).toBe(100);
    expect(result.reviewWindows[0].reliability).toBe('low');
    expect(result.reviewWindows[1].windowSize).toBe(300);
    expect(result.reviewWindows[1].reliability).toBe('medium');
    expect(result.reviewWindows[2].windowSize).toBe(1000);
    expect(result.reviewWindows[2].reliability).toBe('high');
    expect(result.sessionWindow.sessionCount).toBe(8);
    expect(result.sessionWindow.avgFatigueSlope).toBeCloseTo(-0.012, 6);
  });

  it('getLearningVsGraduatedCounts returns counts from review_logs', async () => {
    (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      rows: [{ learning_count: '45', graduated_count: '120' }],
    });

    const result = await service.getLearningVsGraduatedCounts(userId, 30);

    expect(result.learningReviewCount).toBe(45);
    expect(result.graduatedReviewCount).toBe(120);
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('review_state'),
      [userId, 30]
    );
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('COALESCE(review_state'),
      expect.any(Array)
    );
  });

  it('getStudyStatsByCategory returns summary daily and learningVsGraduated for category', async () => {
    const categoryId = 'aaaaaaaa-1111-4111-8111-111111111111';
    (pool.query as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        rows: [{
          review_count: '50',
          pass_count: '42',
          fail_count: '8',
          observed_recall_rate: 0.84,
        }],
      })
      .mockResolvedValueOnce({
        rows: [
          { metric_date: '2026-02-20', review_count: '12', pass_count: '10', fail_count: '2' },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ learning_count: '15', graduated_count: '35' }],
      });

    const result = await service.getStudyStatsByCategory(userId, 30, categoryId);

    expect(result.summary.days).toBe(30);
    expect(result.summary.current.reviewCount).toBe(50);
    expect(result.summary.current.observedRecallRate).toBe(0.84);
    expect(result.daily).toHaveLength(1);
    expect(result.daily[0].metricDate).toBe('2026-02-20');
    expect(result.daily[0].reviewCount).toBe(12);
    expect(result.learningVsGraduated.learningReviewCount).toBe(15);
    expect(result.learningVsGraduated.graduatedReviewCount).toBe(35);
    expect(pool.query).toHaveBeenCalledTimes(3);
    expect(pool.query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('card_categories'),
      [userId, 30, categoryId]
    );
  });
});
