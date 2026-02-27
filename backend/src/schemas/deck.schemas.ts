/**
 * Deck Validation Schemas
 */

import { z } from 'zod';
import { VALIDATION_LIMITS } from '../constants/validation.constants';

const CATEGORY_NAME_MAX = 255;

export const CreateDeckSchema = z.object({
  title: z.string()
    .min(1, 'Title is required')
    .max(VALIDATION_LIMITS.DECK_TITLE_MAX, `Title must be less than ${VALIDATION_LIMITS.DECK_TITLE_MAX} characters`)
    .trim(),
  description: z.string()
    .max(VALIDATION_LIMITS.DECK_DESCRIPTION_MAX, `Description must be less than ${VALIDATION_LIMITS.DECK_DESCRIPTION_MAX} characters`)
    .optional()
    .nullable(),
  categoryNames: z.array(z.string().min(1).max(CATEGORY_NAME_MAX).trim()).optional().default([]),
  show_knowledge_on_card_creation: z.boolean().optional().default(false),
});

export const UpdateDeckSchema = z.object({
  title: z.string()
    .min(1)
    .max(VALIDATION_LIMITS.DECK_TITLE_MAX)
    .trim()
    .optional(),
  description: z.string()
    .max(VALIDATION_LIMITS.DECK_DESCRIPTION_MAX)
    .optional()
    .nullable(),
  show_knowledge_on_card_creation: z.boolean().optional(),
  category_ids: z.array(z.string().uuid()).optional(),
});

export const DeckIdSchema = z.object({
  id: z.string().uuid('Invalid deck ID format'),
});

/** Query for GET /api/decks/:id/cards/due (atRiskOnly = only cards with critical_before <= now) */
export const DueCardsQuerySchema = z.object({
  atRiskOnly: z
    .string()
    .optional()
    .transform((s) => s === 'true' || s === '1'),
});

/** Query for GET /api/decks/:id/cards/study (limit; optional excludeCardIds for extend session) */
export const StudyCardsQuerySchema = z.object({
  limit: z
    .string()
    .regex(/^\d+$/)
    .transform(Number)
    .pipe(z.number().int().min(1).max(100))
    .optional(),
  excludeCardIds: z
    .preprocess((v) => (v == null ? [] : Array.isArray(v) ? v : [v]), z.array(z.string().uuid()))
    .optional()
    .default([]),
});

export const DeckIdParamSchema = z.object({
  deckId: z.string().uuid('Invalid deck ID format'),
});
