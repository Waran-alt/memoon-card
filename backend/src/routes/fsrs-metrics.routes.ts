import { Router } from 'express';
import { getUserId } from '@/middleware/auth';
import { asyncHandler } from '@/middleware/errorHandler';
import { validateQuery, validateRequest } from '@/middleware/validation';
import {
  FsrsMetricsDailyQuerySchema,
  FsrsMetricsRefreshSchema,
  FsrsMetricsSummaryQuerySchema,
  FsrsMetricsSessionsQuerySchema,
} from '@/schemas/optimization.schemas';
import { FsrsMetricsService } from '@/services/fsrs-metrics.service';

type RequestWithValidatedQuery = Express.Request & {
  validatedQuery?: { days?: number };
};

const router = Router();
const fsrsMetricsService = new FsrsMetricsService();

router.get('/daily', validateQuery(FsrsMetricsDailyQuerySchema), asyncHandler(async (req, res) => {
  const userId = getUserId(req);
  const query = req as RequestWithValidatedQuery;
  const days = query.validatedQuery?.days ?? 30;
  const rows = await fsrsMetricsService.getDailyMetrics(userId, days);
  return res.json({ success: true, data: { days, rows } });
}));

router.get('/summary', validateQuery(FsrsMetricsSummaryQuerySchema), asyncHandler(async (req, res) => {
  const userId = getUserId(req);
  const query = req as RequestWithValidatedQuery;
  const days = query.validatedQuery?.days ?? 30;
  const summary = await fsrsMetricsService.getSummary(userId, days);
  return res.json({ success: true, data: summary });
}));

router.get('/sessions', validateQuery(FsrsMetricsSessionsQuerySchema), asyncHandler(async (req, res) => {
  const userId = getUserId(req);
  const query = req as RequestWithValidatedQuery;
  const days = query.validatedQuery?.days ?? 30;
  const rows = await fsrsMetricsService.getSessionMetrics(userId, days);
  return res.json({ success: true, data: { days, rows } });
}));

router.get('/windows', asyncHandler(async (req, res) => {
  const userId = getUserId(req);
  const windows = await fsrsMetricsService.getWindows(userId);
  return res.json({ success: true, data: windows });
}));

router.post('/refresh', validateRequest(FsrsMetricsRefreshSchema), asyncHandler(async (req, res) => {
  const userId = getUserId(req);
  const { days } = req.body as { days?: number };
  const effectiveDays = days ?? 30;
  await fsrsMetricsService.refreshRecentMetrics(userId, effectiveDays);
  const summary = await fsrsMetricsService.getSummary(userId, Math.min(180, effectiveDays));
  return res.json({
    success: true,
    data: {
      refreshed: true,
      days: effectiveDays,
      summary,
    },
  });
}));

export default router;
