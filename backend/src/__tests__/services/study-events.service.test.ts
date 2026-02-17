import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StudyEventsService } from '@/services/study-events.service';
import { pool } from '@/config/database';

vi.mock('@/config/database', () => ({
  pool: {
    query: vi.fn(),
  },
}));

describe('StudyEventsService', () => {
  const userId = '11111111-1111-4111-8111-111111111111';
  let service: StudyEventsService;

  beforeEach(() => {
    service = new StudyEventsService();
    vi.clearAllMocks();
    (pool.query as ReturnType<typeof vi.fn>).mockImplementation(async (query: string) => {
      if (query.includes('FROM cards')) {
        return { rows: [{ id: '22222222-2222-4222-8222-222222222222' }] };
      }
      if (query.includes('FROM decks')) {
        return { rows: [] };
      }
      return { rows: [] };
    });
  });

  it('inserts a single event', async () => {
    await service.logEvent(userId, {
      eventType: 'card_shown',
      cardId: '22222222-2222-4222-8222-222222222222',
      sessionId: '33333333-3333-4333-8333-333333333333',
      clientEventId: '44444444-4444-4444-8444-444444444444',
    });

    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO study_events'),
      expect.arrayContaining([userId, 'card_shown'])
    );
  });

  it('is a no-op when event list is empty', async () => {
    await service.logEvents(userId, []);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('derives stable deterministic client_event_id when missing', async () => {
    await service.logEvent(userId, {
      eventType: 'session_start',
      sessionId: '33333333-3333-4333-8333-333333333333',
      sequenceInSession: 1,
      occurredAtClient: 1700000000000,
    });
    await service.logEvent(userId, {
      eventType: 'session_start',
      sessionId: '33333333-3333-4333-8333-333333333333',
      sequenceInSession: 1,
      occurredAtClient: 1700000000000,
    });

    const insertCalls = (pool.query as ReturnType<typeof vi.fn>).mock.calls.filter(
      ([sql]) => typeof sql === 'string' && sql.includes('INSERT INTO study_events')
    );
    expect(insertCalls).toHaveLength(2);

    const firstClientEventId = insertCalls[0][1][4] as string;
    const secondClientEventId = insertCalls[1][1][4] as string;
    expect(firstClientEventId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
    expect(secondClientEventId).toBe(firstClientEventId);
  });

  it('persists policy version and injects it into payload', async () => {
    await service.logEvent(userId, {
      eventType: 'card_shown',
      cardId: '22222222-2222-4222-8222-222222222222',
      sessionId: '33333333-3333-4333-8333-333333333333',
      clientEventId: '44444444-4444-4444-8444-444444444444',
      policyVersion: 'exp-v2',
      payload: { source: 'test' },
    });

    const insertCall = (pool.query as ReturnType<typeof vi.fn>).mock.calls.find(
      ([sql]) => typeof sql === 'string' && sql.includes('INSERT INTO study_events')
    );
    expect(insertCall).toBeDefined();
    const params = insertCall?.[1] as unknown[];
    expect(params[9]).toBe('exp-v2');
    expect(String(params[10])).toContain('"policyVersion":"exp-v2"');
  });
});
