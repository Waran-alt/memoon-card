/**
 * Review Validation Schemas
 */

import { z } from 'zod';
import { VALIDATION_LIMITS } from '../constants/validation.constants';

export const BatchReviewSchema = z.object({
  reviews: z.array(
    z.object({
      cardId: z.string().uuid('Invalid card ID format'),
      rating: z.union([
        z.literal(1),
        z.literal(2),
        z.literal(3),
        z.literal(4),
      ]),
    })
  )
    .min(1, 'At least one review is required')
    .max(VALIDATION_LIMITS.BATCH_REVIEW_MAX, `Maximum ${VALIDATION_LIMITS.BATCH_REVIEW_MAX} reviews per batch`),
  sessionId: z.string().uuid().optional(),
});
