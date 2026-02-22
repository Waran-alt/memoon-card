/**
 * Optimization Routes
 * 
 * Endpoints for FSRS weight optimization using the Python FSRS Optimizer
 */

import { Router } from 'express';
import { OptimizationService } from '@/services/optimization.service';
import { AdaptiveRetentionService } from '@/services/adaptive-retention.service';
import { FsrsMetricsService } from '@/services/fsrs-metrics.service';
import { CardService } from '@/services/card.service';
import { getUserId } from '@/middleware/auth';
import { asyncHandler } from '@/middleware/errorHandler';
import { validateParams, validateQuery, validateRequest } from '@/middleware/validation';
import {
  ApplyAdaptiveTargetSchema,
  OptimizationShortLoopSummaryQuerySchema,
  OptimizationActivateSnapshotSchema,
  OptimizationSnapshotVersionParamSchema,
  OptimizationSnapshotsQuerySchema,
  OptimizeWeightsSchema,
} from '@/schemas/optimization.schemas';
import { logger, serializeError } from '@/utils/logger';
import { NotFoundError, ValidationError as AppValidationError } from '@/utils/errors';

const router = Router();
const optimizationService = new OptimizationService();
const adaptiveRetentionService = new AdaptiveRetentionService();
const fsrsMetricsService = new FsrsMetricsService();
const cardService = new CardService();

type RequestWithValidatedQuery = Express.Request & {
  validatedQuery?: { limit?: number; days?: number };
};

/**
 * GET /api/optimization/status
 * Check if optimization is available and if user can optimize
 */
router.get('/status', asyncHandler(async (req, res) => {
  const userId = getUserId(req);

  const [optimizerStatus, eligibility] = await Promise.all([
    optimizationService.checkOptimizerAvailable(),
    optimizationService.getOptimizationEligibility(userId),
  ]);

  const canOptimize = eligibility.status === 'READY_TO_UPGRADE';
  const minRequired =
    eligibility.status === 'NOT_READY'
      ? eligibility.minRequiredFirst
      : eligibility.minRequiredSubsequent;

  return res.json({
    success: true,
    data: {
      optimizerAvailable: optimizerStatus.available,
      optimizerMethod: optimizerStatus.method,
      canOptimize,
      reviewCount: eligibility.totalReviews,
      minRequired,
      status: eligibility.status,
      newReviewsSinceLast: eligibility.newReviewsSinceLast,
      daysSinceLast: eligibility.daysSinceLast,
      minRequiredFirst: eligibility.minRequiredFirst,
      minRequiredSubsequent: eligibility.minRequiredSubsequent,
      minDaysSinceLast: eligibility.minDaysSinceLast,
      lastOptimizedAt: eligibility.lastOptimizedAt,
      reviewCountSinceOptimization: eligibility.reviewCountSinceOptimization,
      installationHint: !optimizerStatus.available
        ? 'Install with: pipx install fsrs-optimizer (recommended) or create a venv'
        : undefined,
    },
  });
}));

/**
 * POST /api/optimization/optimize
 * Run FSRS optimization for the user
 */
router.post('/optimize', validateRequest(OptimizeWeightsSchema), asyncHandler(async (req, res) => {
  const userId = getUserId(req);
  const { timezone, dayStart, targetRetention } = req.body;

  // Check if optimizer is available
  const optimizerStatus = await optimizationService.checkOptimizerAvailable();
  if (!optimizerStatus.available) {
    return res.status(503).json({
      success: false,
      error: 'FSRS Optimizer is not available.',
      installationHint: 'Install with: pipx install fsrs-optimizer (recommended) or create a virtual environment',
    });
  }

  // Check if user has enough reviews
  const { canOptimize, reviewCount, minRequired } = await optimizationService.canOptimize(userId);
  if (!canOptimize) {
    return res.status(400).json({
      success: false,
      error: `Not enough reviews for optimization. Need ${minRequired}, have ${reviewCount}`,
      reviewCount,
      minRequired,
    });
  }

  // Run optimization
  const result = await optimizationService.optimizeWeights(userId, {
    timezone,
    dayStart,
    targetRetention,
  });

  if (result.success) {
    if (result.weights?.length) {
      await cardService.recomputeRiskTimestampsForUser(userId, result.weights);
    }
    return res.json({
      success: true,
      data: {
        weights: result.weights,
        message: result.message,
      },
    });
  } else {
    return res.status(500).json({
      success: false,
      error: result.error || result.message,
    });
  }
}));

/**
 * GET /api/optimization/export
 * Export review logs as CSV for manual optimization
 */
router.get('/export', asyncHandler(async (req, res) => {
  const userId = getUserId(req);
  const { mkdir } = await import('fs/promises');
  const { resolve, basename } = await import('path');
  
  // Validate userId format
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_REGEX.test(userId)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid user ID format',
    });
  }

  const tempDir = resolve(process.cwd(), 'temp');
  const csvFileName = `revlog_${userId}_${Date.now()}.csv`;
  
  // Sanitize path
  const csvPath = resolve(tempDir, basename(csvFileName));
  if (!csvPath.startsWith(resolve(tempDir))) {
    return res.status(400).json({
      success: false,
      error: 'Invalid file path',
    });
  }

  // Use fs.mkdir instead of shell command
  await mkdir(tempDir, { recursive: true });

  // Export review logs
  await optimizationService.exportReviewLogsToCSV(userId, csvPath);

  // Send file as download
  return res.download(csvPath, `revlog_${userId}.csv`, async (err: Error | null) => {
    // Cleanup after download
    await import('fs/promises').then(fs => fs.unlink(csvPath).catch(() => {}));
    if (err) {
      logger.error('Error sending optimization export file', {
        requestId: req.requestId,
        userId,
        error: serializeError(err),
      });
    }
  });
}));

/**
 * GET /api/optimization/snapshots
 * Get versioned FSRS weight snapshots for current user
 */
router.get('/snapshots', validateQuery(OptimizationSnapshotsQuerySchema), asyncHandler(async (req, res) => {
  const userId = getUserId(req);
  const query = req as RequestWithValidatedQuery;
  const limit = query.validatedQuery?.limit ?? 20;
  const snapshots = await optimizationService.getWeightSnapshots(userId, limit);

  return res.json({
    success: true,
    data: {
      limit,
      snapshots,
    },
  });
}));

/**
 * GET /api/optimization/adaptive-target
 * Read-only recommendation for adaptive target retention.
 */
router.get('/adaptive-target', asyncHandler(async (req, res) => {
  const userId = getUserId(req);
  const recommendation = await adaptiveRetentionService.computeRecommendedTarget(userId);
  return res.json({ success: true, data: recommendation });
}));

/**
 * GET /api/optimization/short-loop/summary
 * Observability summary derived from raw study events + review logs.
 */
router.get('/short-loop/summary', validateQuery(OptimizationShortLoopSummaryQuerySchema), asyncHandler(async (req, res) => {
  const userId = getUserId(req);
  const query = req as RequestWithValidatedQuery;
  const days = query.validatedQuery?.days;
  const summary = await fsrsMetricsService.getDay1ShortLoopSummary(userId, days);
  return res.json({ success: true, data: summary });
}));

/**
 * POST /api/optimization/adaptive-target/apply
 * Apply recommended adaptive target retention with guardrails.
 */
router.post('/adaptive-target/apply', validateRequest(ApplyAdaptiveTargetSchema), asyncHandler(async (req, res) => {
  const userId = getUserId(req);
  const recommendation = await adaptiveRetentionService.computeRecommendedTarget(userId);
  if (!recommendation.enabled) {
    throw new AppValidationError('Adaptive retention is disabled');
  }
  if (recommendation.confidence === 'low') {
    throw new AppValidationError('Adaptive retention recommendation confidence is too low');
  }
  const { reason } = req.body as { reason?: string };
  const applied = await optimizationService.applyAdaptiveTargetRetention(
    userId,
    recommendation.recommendedTarget,
    reason ?? 'adaptive_target_apply'
  );
  return res.json({
    success: true,
    data: {
      recommendation,
      appliedSnapshot: applied,
    },
  });
}));

/**
 * POST /api/optimization/snapshots/:version/activate
 * Activate a previous snapshot version and restore it to user settings
 */
router.post(
  '/snapshots/:version/activate',
  validateParams(OptimizationSnapshotVersionParamSchema),
  validateRequest(OptimizationActivateSnapshotSchema),
  asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    const version = Number(req.params.version);
    const { reason } = req.body as { reason?: string };
    const snapshot = await optimizationService.activateSnapshotVersion(userId, version, reason);

    if (!snapshot) {
      throw new NotFoundError('Snapshot');
    }

    if (snapshot.weights?.length) {
      await cardService.recomputeRiskTimestampsForUser(userId, snapshot.weights);
    }

    return res.json({
      success: true,
      data: snapshot,
    });
  })
);

export default router;
