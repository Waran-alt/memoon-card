import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import studyRoutes from '@/routes/study.routes';
import { errorHandler } from '@/middleware/errorHandler';

const mockUserId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const logEventsMock = vi.hoisted(() => vi.fn());
const getSessionHistoryMock = vi.hoisted(() => vi.fn());
const getSessionDetailMock = vi.hoisted(() => vi.fn());
const getJourneyConsistencyReportMock = vi.hoisted(() => vi.fn());

vi.mock('@/middleware/auth', () => ({
  getUserId: () => mockUserId,
}));

vi.mock('@/services/study-events.service', () => ({
  StudyEventsService: vi.fn().mockImplementation(() => ({
    logEvents: logEventsMock,
    getSessionHistory: getSessionHistoryMock,
    getSessionDetail: getSessionDetailMock,
  })),
}));

vi.mock('@/services/card-journey.service', () => ({
  CardJourneyService: vi.fn().mockImplementation(() => ({
    getJourneyConsistencyReport: getJourneyConsistencyReportMock,
  })),
}));

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/study', studyRoutes);
  app.use(errorHandler);
  return app;
}

describe('Study routes', () => {
  const app = createApp();

  beforeEach(() => {
    vi.clearAllMocks();
    logEventsMock.mockResolvedValue(undefined);
    getSessionHistoryMock.mockResolvedValue([]);
    getSessionDetailMock.mockResolvedValue(null);
    getJourneyConsistencyReportMock.mockResolvedValue({
      days: 30,
      health: {
        level: 'healthy',
        mismatchRate: 0,
        thresholds: { minor: 0.01, major: 0.05 },
      },
      totals: { reviewLogs: 0, ratingJourneyEvents: 0, duplicateRatingJourneyGroups: 0, orderingIssues: 0 },
      mismatches: { missingRatingJourneyEvents: 0, duplicateRatingJourneyEvents: 0, orderingIssues: 0 },
      samples: { missingReviewLogIds: [], duplicateReviewLogIds: [], orderingIssueEventIds: [] },
    });
  });

  it('accepts a valid events batch', async () => {
    const res = await request(app)
      .post('/api/study/events')
      .send({
        events: [
          {
            eventType: 'session_start',
            clientEventId: '11111111-1111-4111-8111-111111111111',
            sessionId: '22222222-2222-4222-8222-222222222222',
          },
        ],
      });

    expect(res.status).toBe(202);
    expect(res.body.success).toBe(true);
    expect(logEventsMock).toHaveBeenCalledWith(
      mockUserId,
      expect.arrayContaining([expect.objectContaining({ eventType: 'session_start' })])
    );
  });

  it('returns session history list', async () => {
    getSessionHistoryMock.mockResolvedValue([
      {
        sessionId: '22222222-2222-4222-8222-222222222222',
        startedAt: 1,
        endedAt: 2,
        eventCount: 5,
        distinctCardCount: 2,
        reviewCount: 3,
        againCount: 1,
        hardCount: 0,
        goodCount: 2,
        easyCount: 0,
      },
    ]);

    const res = await request(app).get('/api/study/sessions?days=14&limit=25&offset=0');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(getSessionHistoryMock).toHaveBeenCalledWith(mockUserId, { days: 14, limit: 25, offset: 0 });
  });

  it('returns session details', async () => {
    getSessionDetailMock.mockResolvedValue({
      sessionId: '22222222-2222-4222-8222-222222222222',
      startedAt: 1,
      endedAt: 2,
      events: [],
      ratings: { reviewCount: 1, againCount: 0, hardCount: 0, goodCount: 1, easyCount: 0 },
    });

    const res = await request(app)
      .get('/api/study/sessions/22222222-2222-4222-8222-222222222222?eventLimit=100');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(getSessionDetailMock).toHaveBeenCalledWith(
      mockUserId,
      '22222222-2222-4222-8222-222222222222',
      { eventLimit: 100 }
    );
  });

  it('returns 404 when session detail is missing', async () => {
    getSessionDetailMock.mockResolvedValue(null);
    const res = await request(app)
      .get('/api/study/sessions/22222222-2222-4222-8222-222222222222');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it('returns journey consistency report', async () => {
    const res = await request(app).get('/api/study/journey-consistency?days=7&sampleLimit=5');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.health).toEqual({
      level: 'healthy',
      mismatchRate: 0,
      thresholds: { minor: 0.01, major: 0.05 },
    });
    expect(getJourneyConsistencyReportMock).toHaveBeenCalledWith(mockUserId, {
      days: 7,
      sampleLimit: 5,
    });
  });
});
