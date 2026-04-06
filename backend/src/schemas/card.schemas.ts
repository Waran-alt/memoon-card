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
  knowledge_id: z.string().uuid().optional().nullable(),
});

const KNOWLEDGE_CONTENT_MAX = 10000;

const BulkCreateCardItemSchema = z.object({
  recto: z.string().min(1).max(VALIDATION_LIMITS.CARD_CONTENT_MAX),
  verso: z.string().min(1).max(VALIDATION_LIMITS.CARD_CONTENT_MAX),
  comment: z.string().max(VALIDATION_LIMITS.CARD_COMMENT_MAX).optional().nullable(),
  category_ids: z.array(z.string().uuid()).max(50).optional().default([]),
});

export const BulkCreateCardsSchema = z.object({
  knowledge: z.object({
    content: z.string().max(KNOWLEDGE_CONTENT_MAX).optional().nullable(),
  }).optional(),
  cards: z.array(BulkCreateCardItemSchema).min(1).max(2),
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

/** Optional content for the new reversed card when creating via two-zone UI. Omit for immediate create (swapped from source). */
const ReversedCardContentSchema = z.object({
  recto: z.string().min(1).max(VALIDATION_LIMITS.CARD_CONTENT_MAX),
  verso: z.string().min(1).max(VALIDATION_LIMITS.CARD_CONTENT_MAX),
  comment: z.string().max(VALIDATION_LIMITS.CARD_COMMENT_MAX).optional().nullable(),
});

export const CreateReversedCardSchema = z.object({
  card_b: ReversedCardContentSchema.optional(),
  /** When true (default), copy category assignments from source after create. */
  copy_categories: z.boolean().optional().default(true),
  /** When true (default), set new card knowledge_id from source. Links remain independent; this only seeds the new card. */
  copy_knowledge: z.boolean().optional().default(true),
});

export const LinkCardBodySchema = z.object({
  otherCardId: z.string().uuid('Invalid card ID format'),
});

export const CardLinkParamsSchema = z.object({
  id: z.string().uuid('Invalid card ID format'),
  otherCardId: z.string().uuid('Invalid card ID format'),
});

/** Replace the rating on the latest review log for a card (study correction). */
export const CorrectRatingSchema = z.object({
  rating: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
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
  ratedAt: z.number().int().min(0).optional(),
  thinkingDurationMs: z.number().int().min(0).optional(),
  clientEventId: z.string().uuid().optional(),
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

  if (data.revealedAt != null && data.ratedAt != null && data.ratedAt < data.revealedAt) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['ratedAt'],
      message: 'ratedAt must be greater than or equal to revealedAt',
    });
  }

  for (const [key, value] of [
    ['shownAt', data.shownAt],
    ['revealedAt', data.revealedAt],
    ['ratedAt', data.ratedAt],
  ] as const) {
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

export const UpdateCardImportanceSchema = z.object({
  isImportant: z.boolean(),
});

export const CardIdSchema = z.object({
  id: z.string().uuid('Invalid card ID format'),
});

/** Query for GET /api/decks/:id/cards/export */
export const ExportCardsQuerySchema = z.object({
  format: z.enum(['content', 'full']).optional().default('full'),
});

/** Single card in import payload (content + optional metadata for applyMetadata). pairId links two cards as a reverse pair. */
const ImportCardItemSchema = z.object({
  recto: z.string().min(1).max(VALIDATION_LIMITS.CARD_CONTENT_MAX),
  verso: z.string().min(1).max(VALIDATION_LIMITS.CARD_CONTENT_MAX),
  comment: z.string().max(VALIDATION_LIMITS.CARD_COMMENT_MAX).optional().nullable(),
  reverse: z.boolean().optional().default(true),
  recto_formula: z.boolean().optional().default(false),
  verso_formula: z.boolean().optional().default(false),
  pairId: z.string().min(1).max(100).optional().nullable(),
  link_group_id: z.string().min(1).max(200).optional().nullable(),
  stability: z.number().finite().optional().nullable(),
  difficulty: z.number().finite().optional().nullable(),
  next_review: z.string().optional().nullable(),
  last_review: z.string().optional().nullable(),
  is_important: z.boolean().optional().default(false),
});

const IMPORT_CARDS_MAX = 500;

export const ImportCardsSchema = z.object({
  cards: z.array(ImportCardItemSchema).min(1).max(IMPORT_CARDS_MAX),
  options: z.object({
    applyMetadata: z.boolean().optional().default(false),
  }).default({ applyMetadata: false }),
});

export const SetCardCategoriesSchema = z.object({
  categoryIds: z.array(z.string().uuid('Invalid category ID format')).max(50, 'At most 50 categories per card'),
});

export const CreateCardFlagSchema = z.object({
  reason: z.string().min(1, 'Reason is required').max(50, 'Reason must be at most 50 characters').trim(),
  note: z.string().max(500).trim().optional().nullable(),
});

export const ListFlagsQuerySchema = z.object({
  deckId: z.string().uuid().optional(),
  resolved: z.enum(['true', 'false']).optional().transform((v) => (v === undefined ? undefined : v === 'true')),
  limit: z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(1).max(200)).optional(),
});

export const FlagIdParamSchema = z.object({
  flagId: z.string().uuid('Invalid flag ID format'),
});

export const ResolveFlagSchema = z.object({
  resolved: z.boolean(),
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

export const CardHistoryQuerySchema = z.object({
  limit: z.string().regex(/^\d+$/).transform(Number).pipe(
    z.number().int().min(1).max(500)
  ).optional(),
  beforeEventTime: z.string().regex(/^\d+$/).transform(Number).pipe(
    z.number().int().min(0)
  ).optional(),
});

export const CardHistorySummaryQuerySchema = z.object({
  days: z.string().regex(/^\d+$/).transform(Number).pipe(
    z.number().int().min(1).max(180)
  ).optional(),
});

export const CardReviewLogsQuerySchema = z.object({
  limit: z.string().regex(/^\d+$/).transform(Number).pipe(
    z.number().int().min(1).max(100)
  ).optional(),
});

export const JourneyConsistencyQuerySchema = z.object({
  days: z.string().regex(/^\d+$/).transform(Number).pipe(
    z.number().int().min(1).max(180)
  ).optional(),
  sampleLimit: z.string().regex(/^\d+$/).transform(Number).pipe(
    z.number().int().min(1).max(50)
  ).optional(),
});

export const StudyHealthDashboardQuerySchema = z.object({
  days: z.string().regex(/^\d+$/).transform(Number).pipe(
    z.number().int().min(1).max(90)
  ).optional(),
});

export const StudyStatsQuerySchema = z.object({
  days: z.string().regex(/^\d+$/).transform(Number).pipe(
    z.number().int().min(1).max(90)
  ).optional(),
  categoryId: z.string().uuid('Invalid category ID format').optional(),
});
