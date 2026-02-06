/**
 * Optimization Routes
 * 
 * Endpoints for FSRS weight optimization using the Python FSRS Optimizer
 */

import { Router } from 'express';
import { OptimizationService } from '../services/optimization.service';
import { getUserId } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { validateRequest } from '../middleware/validation';
import { OptimizeWeightsSchema } from '../schemas/optimization.schemas';

const router = Router();
const optimizationService = new OptimizationService();

/**
 * GET /api/optimization/status
 * Check if optimization is available and if user can optimize
 */
router.get('/status', asyncHandler(async (req, res) => {
  const userId = getUserId(req);

  const [optimizerStatus, eligibility, userInfo] = await Promise.all([
    optimizationService.checkOptimizerAvailable(),
    optimizationService.getOptimizationEligibility(userId),
    optimizationService.getUserOptimizationInfo(userId),
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
      lastOptimizedAt: userInfo.lastOptimizedAt,
      reviewCountSinceOptimization: userInfo.reviewCountSinceOptimization,
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
      console.error('Error sending file:', err);
    }
  });
}));

export default router;
