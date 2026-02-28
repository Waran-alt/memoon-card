import { Router } from 'express';
import { ReviewService } from '@/services/review.service';
import { getUserId } from '@/middleware/auth';
import { asyncHandler } from '@/middleware/errorHandler';
import { validateRequest } from '@/middleware/validation';
import { BatchReviewSchema } from '@/schemas/review.schemas';

const router = Router();
const reviewService = new ReviewService();

/**
 * POST /api/reviews/batch
 * Batch review multiple cards
 */
router.post('/batch', validateRequest(BatchReviewSchema), asyncHandler(async (req, res) => {
  const userId = getUserId(req);
  const { reviews, sessionId } = req.body as { reviews: Array<{ cardId: string; rating: 1 | 2 | 3 | 4 }>; sessionId?: string };

  const results = await reviewService.batchReview(reviews, userId, { sessionId });
  return res.json({ success: true, data: results });
}));

export default router;
