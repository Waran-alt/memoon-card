import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CardJourneyService } from '@/services/card-journey.service';
import { pool } from '@/config/database';

vi.mock('@/config/database', () => ({
  pool: {
    query: vi.fn(),
  },
}));

describe('CardJourneyService', () => {
  const userId = '11111111-1111-4111-8111-111111111111';
  const cardId = '22222222-2222-4222-8222-222222222222';
  let service: CardJourneyService;

  beforeEach(() => {
    service = new CardJourneyService();
    vi.clearAllMocks();
    (pool.query as ReturnType<typeof vi.fn>).mockResolvedValue({ rows: [] });
  });

  it('appends a journey event with idempotency key', async () => {
    await service.appendEvent(userId, {
      cardId,
      eventType: 'rating_submitted',
      idempotencyKey: 'test:1',
    });

    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO card_journey_events'),
      expect.arrayContaining([userId, cardId, 'rating_submitted', 'test:1'])
    );
  });

  it('persists policy version and stamps payload', async () => {
    await service.appendEvent(userId, {
      cardId,
      eventType: 'rating_submitted',
      idempotencyKey: 'test:policy',
      policyVersion: 'exp-v3',
      payload: { trace: 'x' },
    });

    const insertCall = (pool.query as ReturnType<typeof vi.fn>).mock.calls.find(
      ([sql]) => typeof sql === 'string' && sql.includes('INSERT INTO card_journey_events')
    );
    expect(insertCall).toBeDefined();
    const params = insertCall?.[1] as unknown[];
    expect(params[11]).toBe('exp-v3');
    expect(String(params[12])).toContain('"policyVersion":"exp-v3"');
  });

  it('reads card history in reverse chronological order', async () => {
    (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      rows: [{ id: 'history-1', user_id: userId, card_id: cardId }],
    });
    const result = await service.getCardHistory(userId, cardId, { limit: 25 });
    expect(result).toHaveLength(1);
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('FROM card_journey_events'),
      [userId, cardId, null, 25]
    );
  });

  it('builds card history summary', async () => {
    (pool.query as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ rows: [{ total_events: 12 }] })
      .mockResolvedValueOnce({ rows: [{ event_type: 'rating_submitted', count: 8 }] })
      .mockResolvedValueOnce({ rows: [{ day: '2026-02-16', count: 5 }] })
      .mockResolvedValueOnce({ rows: [{ session_id: 's1', count: 3, first_event_at: 10, last_event_at: 20 }] });

    const summary = await service.getCardHistorySummary(userId, cardId, { days: 30, sessionLimit: 5 });
    expect(summary.totalEvents).toBe(12);
    expect(summary.byEventType[0]).toEqual({ eventType: 'rating_submitted', count: 8 });
    expect(summary.byDay[0]).toEqual({ day: '2026-02-16', count: 5 });
    expect(summary.bySession[0]).toEqual({ sessionId: 's1', count: 3, firstEventAt: 10, lastEventAt: 20 });
  });

  it('computes consistency health level from mismatch rate', async () => {
    (pool.query as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        rows: [
          {
            review_logs: 100,
            rating_journey_events: 95,
            missing_rating_journey_events: 3,
            duplicate_rating_journey_groups: 2,
            ordering_issues: 1,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ review_log_id: 'r1' }] })
      .mockResolvedValueOnce({ rows: [{ review_log_id: 'r2' }] })
      .mockResolvedValueOnce({ rows: [{ event_id: 'e1' }] });

    const report = await service.getJourneyConsistencyReport(userId, { days: 30, sampleLimit: 5 });
    expect(report.health.level).toBe('needs_attention');
    expect(report.health.mismatchRate).toBeCloseTo(0.06, 6);
    expect(report.health.thresholds).toEqual({ minor: 0.01, major: 0.05 });
    expect(report.samples.missingReviewLogIds).toEqual(['r1']);
  });
});
