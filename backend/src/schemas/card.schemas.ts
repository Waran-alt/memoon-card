/**
 * Card Validation Schemas
 */

import { z } from 'zod';
import { VALIDATION_LIMITS } from '../constants/validation.constants';

const TIMING_VALIDATION_LIMITS = {
  MAX_FUTURE_SKEW_MS: 5 * 60 * 1000,
  MAX_AGE_MS: 24 * 60 * 60 * 1000,
} as const;

export const CreateCardSchema = z.object({
  recto: z.string()
    .min(1, 'Recto is required')
    .max(VALIDATION_LIMITS.CARD_CONTENT_MAX, `Recto must be less than ${VALIDATION_LIMITS.CARD_CONTENT_MAX} characters`),
  verso: z.string()
    .min(1, 'Verso is required')
    .max(VALIDATION_LIMITS.CARD_CONTENT_MAX, `Verso must be less than ${VALIDATION_LIMITS.CARD_CONTENT_MAX} characters`),
  comment: z.string()
    .max(VALIDATION_LIMITS.CARD_COMMENT_MAX, `Comment must be less than ${VALIDATION_LIMITS.CARD_COMMENT_MAX} characters`)
    .optional()
    .nullable(),
  recto_image: z.string().url().optional().nullable(),
  verso_image: z.string().url().optional().nullable(),
  recto_formula: z.boolean().optional().default(false),
  verso_formula: z.boolean().optional().default(false),
  reverse: z.boolean().optional().default(true),
});

export const UpdateCardSchema = z.object({
  recto: z.string()
    .min(1)
    .max(VALIDATION_LIMITS.CARD_CONTENT_MAX)
    .optional(),
  verso: z.string()
    .min(1)
    .max(VALIDATION_LIMITS.CARD_CONTENT_MAX)
    .optional(),
  comment: z.string()
    .max(VALIDATION_LIMITS.CARD_COMMENT_MAX)
    .optional()
    .nullable(),
  recto_image: z.string().url().optional().nullable(),
  verso_image: z.string().url().optional().nullable(),
  recto_formula: z.boolean().optional(),
  verso_formula: z.boolean().optional(),
  reverse: z.boolean().optional(),
});

export const ReviewCardSchema = z.object({
  rating: z.union([
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
  ]).refine(
    (val) => [1, 2, 3, 4].includes(val),
    { message: 'Rating must be 1 (Again), 2 (Hard), 3 (Good), or 4 (Easy)' }
  ),
  shownAt: z.number().int().min(0).optional(),
  revealedAt: z.number().int().min(0).optional(),
  sessionId: z.string().uuid().optional(),
}).superRefine((data, ctx) => {
  const now = Date.now();
  const maxFuture = now + TIMING_VALIDATION_LIMITS.MAX_FUTURE_SKEW_MS;
  const minAllowed = now - TIMING_VALIDATION_LIMITS.MAX_AGE_MS;

  if (data.revealedAt != null && data.shownAt == null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['shownAt'],
      message: 'shownAt is required when revealedAt is provided',
    });
  }

  if (data.shownAt != null && data.revealedAt != null && data.revealedAt < data.shownAt) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['revealedAt'],
      message: 'revealedAt must be greater than or equal to shownAt',
    });
  }

  for (const [key, value] of [['shownAt', data.shownAt], ['revealedAt', data.revealedAt]] as const) {
    if (value == null) continue;
    if (value > maxFuture) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [key],
        message: `${key} cannot be far in the future`,
      });
    }
    if (value < minAllowed) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [key],
        message: `${key} is too old for a review event`,
      });
    }
  }
});

export const CardIdSchema = z.object({
  id: z.string().uuid('Invalid card ID format'),
});

export const PostponeCardSchema = z.object({
  revealedForSeconds: z.number().int().min(1).max(3600).optional(),
});

export const DeckIdParamSchema = z.object({
  deckId: z.string().uuid('Invalid deck ID format'),
});

export const GetCardsQuerySchema = z.object({
  limit: z.string().regex(/^\d+$/).transform(Number).pipe(
    z.number().int()
      .min(VALIDATION_LIMITS.QUERY_LIMIT_MIN)
      .max(VALIDATION_LIMITS.QUERY_LIMIT_MAX)
  ).optional(),
});
