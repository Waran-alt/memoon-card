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

export const DeckIdParamSchema = z.object({
  deckId: z.string().uuid('Invalid deck ID format'),
});
