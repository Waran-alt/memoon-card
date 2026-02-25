import { Router } from 'express';
import { getUserId } from '@/middleware/auth';
import { asyncHandler } from '@/middleware/errorHandler';
import { validateParams, validateQuery, validateRequest } from '@/middleware/validation';
import {
  JourneyConsistencyQuerySchema,
  StudyEventsBatchSchema,
  StudyHealthDashboardQuerySchema,
  StudySessionDetailQuerySchema,
  StudySessionHistoryQuerySchema,
  StudySessionIdParamSchema,
  StudyStatsQuerySchema,
} from '@/schemas/card.schemas';
import { CardJourneyService } from '@/services/card-journey.service';
import { AppError } from '@/utils/errors';
import { StudyHealthAlertsService } from '@/services/study-health-alerts.service';
import { StudyHealthDashboardService } from '@/services/study-health-dashboard.service';
import { StudyEventsService } from '@/services/study-events.service';
import { FsrsMetricsService } from '@/services/fsrs-metrics.service';
import { CategoryService } from '@/services/category.service';

const router = Router();
const studyEventsService = new StudyEventsService();
const cardJourneyService = new CardJourneyService();
const studyHealthDashboardService = new StudyHealthDashboardService();
const studyHealthAlertsService = new StudyHealthAlertsService();
const fsrsMetricsService = new FsrsMetricsService();
const categoryService = new CategoryService();

type RequestWithValidatedQuery = Express.Request & {
  validatedQuery?: {
    days?: number;
    limit?: number;
    offset?: number;
    eventLimit?: number;
    sampleLimit?: number;
  };
};
type RequestWithValidatedParams = Express.Request & {
  validatedParams?: { sessionId?: string };
};

/**
 * POST /api/study/events
 * Persist study action events (append-only, idempotent with client_event_id)
 */
router.post(
  '/events',
  validateRequest(StudyEventsBatchSchema),
  asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    const { events } = req.body;
    await studyEventsService.logEvents(userId, events);
    return res.status(202).json({ success: true, accepted: events.length });
  })
);

router.get(
  '/sessions',
  validateQuery(StudySessionHistoryQuerySchema),
  asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    const startMs = Date.now();
    let statusCode = 200;
    const query = req as RequestWithValidatedQuery;
    try {
      const days = query.validatedQuery?.days ?? 30;
      const limit = query.validatedQuery?.limit ?? 50;
      const offset = query.validatedQuery?.offset ?? 0;
      const rows = await studyEventsService.getSessionHistory(userId, { days, limit, offset });
      return res.json({ success: true, data: { days, limit, offset, rows } });
    } catch (error) {
      statusCode = error instanceof AppError ? error.statusCode : 500;
      throw error;
    } finally {
      void studyHealthDashboardService.recordStudyApiMetric({
        userId,
        route: '/api/study/sessions',
        statusCode,
        durationMs: Date.now() - startMs,
      });
    }
  })
);

router.get(
  '/sessions/:sessionId',
  validateParams(StudySessionIdParamSchema),
  validateQuery(StudySessionDetailQuerySchema),
  asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    const startMs = Date.now();
    let statusCode = 200;
    const params = req as RequestWithValidatedParams;
    const query = req as RequestWithValidatedQuery;
    try {
      const rawSessionId = params.validatedParams?.sessionId ?? req.params.sessionId;
      const sessionId = Array.isArray(rawSessionId) ? rawSessionId[0] : rawSessionId;
      const eventLimit = query.validatedQuery?.eventLimit ?? 300;
      const detail = await studyEventsService.getSessionDetail(userId, sessionId, { eventLimit });
      if (!detail) {
        statusCode = 404;
        return res.status(404).json({ success: false, message: 'Study session not found' });
      }
      return res.json({ success: true, data: detail });
    } catch (error) {
      statusCode = error instanceof AppError ? error.statusCode : 500;
      throw error;
    } finally {
      void studyHealthDashboardService.recordStudyApiMetric({
        userId,
        route: '/api/study/sessions/:sessionId',
        statusCode,
        durationMs: Date.now() - startMs,
      });
    }
  })
);

router.get(
  '/journey-consistency',
  validateQuery(JourneyConsistencyQuerySchema),
  asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    const startMs = Date.now();
    let statusCode = 200;
    const query = req as RequestWithValidatedQuery;
    try {
      const report = await cardJourneyService.getJourneyConsistencyReport(userId, {
        days: query.validatedQuery?.days,
        sampleLimit: query.validatedQuery?.sampleLimit,
      });
      return res.json({ success: true, data: report });
    } catch (error) {
      statusCode = error instanceof AppError ? error.statusCode : 500;
      throw error;
    } finally {
      void studyHealthDashboardService.recordStudyApiMetric({
        userId,
        route: '/api/study/journey-consistency',
        statusCode,
        durationMs: Date.now() - startMs,
      });
    }
  })
);

router.get(
  '/health-dashboard',
  validateQuery(StudyHealthDashboardQuerySchema),
  asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    const query = req as RequestWithValidatedQuery;
    const days = query.validatedQuery?.days ?? 30;
    const dashboard = await studyHealthDashboardService.getDashboard(userId, days);
    return res.json({ success: true, data: dashboard });
  })
);

router.get(
  '/health-alerts',
  validateQuery(StudyHealthDashboardQuerySchema),
  asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    const query = req as RequestWithValidatedQuery;
    const days = query.validatedQuery?.days ?? 30;
    const alerts = await studyHealthAlertsService.getAlerts(userId, days);
    return res.json({ success: true, data: alerts });
  })
);

/**
 * GET /api/study/stats
 * User-facing study stats: summary, daily breakdown, learning vs graduated counts.
 * Optional categoryId: filter to reviews of cards in that category.
 */
router.get(
  '/stats',
  validateQuery(StudyStatsQuerySchema),
  asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    const query = req as RequestWithValidatedQuery & { validatedQuery?: { days?: number; categoryId?: string } };
    const days = query.validatedQuery?.days ?? 30;
    const categoryId = query.validatedQuery?.categoryId;

    if (categoryId) {
      const category = await categoryService.getById(categoryId, userId);
      if (!category) {
        return res.status(404).json({ success: false, error: 'Category not found' });
      }
      const stats = await fsrsMetricsService.getStudyStatsByCategory(userId, days, categoryId);
      return res.json({
        success: true,
        data: {
          days,
          categoryId,
          categoryName: category.name,
          summary: stats.summary,
          daily: stats.daily,
          learningVsGraduated: stats.learningVsGraduated,
        },
      });
    }

    const [summary, daily, learningVsGraduated] = await Promise.all([
      fsrsMetricsService.getSummary(userId, days),
      fsrsMetricsService.getDailyMetrics(userId, days),
      fsrsMetricsService.getLearningVsGraduatedCounts(userId, days),
    ]);
    return res.json({
      success: true,
      data: {
        days,
        summary,
        daily,
        learningVsGraduated,
      },
    });
  })
);

export default router;
