/**
 * Card CRUD, single-card review, flags, categories, history — all handlers use getUserId(req) and validated params/body.
 * Register static paths (`/flags`, …) before `/:id` routes so literals are never treated as card IDs.
 */
import { Router } from 'express';
import { CardService } from '@/services/card.service';
import { ReviewService } from '@/services/review.service';
import { getUserId } from '@/middleware/auth';
import { asyncHandler } from '@/middleware/errorHandler';
import { validateRequest, validateParams, validateQuery } from '@/middleware/validation';
import {
  UpdateCardSchema,
  ReviewCardSchema,
  CorrectRatingSchema,
  CardIdSchema,
  SetCardCategoriesSchema,
  CreateCardFlagSchema,
  ListFlagsQuerySchema,
  FlagIdParamSchema,
  ResolveFlagSchema,
  UpdateCardImportanceSchema,
  CardHistoryQuerySchema,
  CardHistorySummaryQuerySchema,
  CardReviewLogsQuerySchema,
  CreateReversedCardSchema,
  LinkCardBodySchema,
  CardLinkParamsSchema,
} from '@/schemas/card.schemas';
import { AppError, NotFoundError, ValidationError } from '@/utils/errors';
import { StudyHealthDashboardService } from '@/services/study-health-dashboard.service';
import { shouldIncludeCardForSessionRepeat } from '@/utils/review-correct-session.utils';
import { CardJourneyService } from '@/services/card-journey.service';
import { CardFlagService } from '@/services/card-flag.service';
import { CategoryService } from '@/services/category.service';

const router = Router();
const cardService = new CardService();
const reviewService = new ReviewService();
const cardJourneyService = new CardJourneyService();
const cardFlagService = new CardFlagService();
const categoryService = new CategoryService();
const studyHealthDashboardService = new StudyHealthDashboardService();

/**
 * GET /api/cards/flags
 * List flagged cards for the current user (optional deckId, resolved filter)
 */
router.get('/flags', validateQuery(ListFlagsQuerySchema), asyncHandler(async (req, res) => {
  const userId = getUserId(req);
  const query = (req as { validatedQuery?: { deckId?: string; resolved?: boolean; limit?: number } }).validatedQuery;
  const rows = await cardFlagService.listFlags(userId, {
    deckId: query?.deckId,
    resolved: query?.resolved,
    limit: query?.limit,
  });
  return res.json({ success: true, data: rows });
}));

/**
 * PATCH /api/cards/flags/:flagId
 * Resolve or unresolve a flag
 */
router.patch('/flags/:flagId', validateParams(FlagIdParamSchema), validateRequest(ResolveFlagSchema), asyncHandler(async (req, res) => {
  const userId = getUserId(req);
  const flagId = String(req.params.flagId);
  const flag = await cardFlagService.resolveFlag(flagId, userId, req.body.resolved);
  if (!flag) {
    throw new NotFoundError('Flag');
  }
  return res.json({ success: true, data: flag });
}));

/**
 * GET /api/cards/:id/categories
 * List categories attached to this card
 */
router.get('/:id/categories', validateParams(CardIdSchema), asyncHandler(async (req, res) => {
  const userId = getUserId(req);
  const cardId = String(req.params.id);
  const card = await cardService.getCardById(cardId, userId);
  if (!card) throw new NotFoundError('Card');
  const categories = await categoryService.getCategoriesForCard(cardId, userId);
  return res.json({ success: true, data: categories });
}));

/**
 * PUT /api/cards/:id/categories
 * Set categories for card (replaces existing). Body: { categoryIds: string[] }
 */
router.put('/:id/categories', validateParams(CardIdSchema), validateRequest(SetCardCategoriesSchema), asyncHandler(async (req, res) => {
  const userId = getUserId(req);
  const cardId = String(req.params.id);
  await categoryService.setCategoriesForCard(cardId, userId, req.body.categoryIds);
  const categories = await categoryService.getCategoriesForCard(cardId, userId);
  return res.json({ success: true, data: categories });
}));

/**
 * POST /api/cards/:id/reversed
 * Create a reversed card (recto/verso swapped), same deck as source; adds an undirected card link.
 * Optional body: card_b, copy_categories (default true), copy_knowledge (default true).
 */
router.post(
  '/:id/reversed',
  validateParams(CardIdSchema),
  validateRequest(CreateReversedCardSchema),
  asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    const cardId = String(req.params.id);
    const body = req.body as {
      card_b?: { recto: string; verso: string; comment?: string | null };
      copy_categories: boolean;
      copy_knowledge: boolean;
    };
    const sourceCard = await cardService.getCardById(cardId, userId);
    if (!sourceCard) throw new NotFoundError('Card');
    const reversed = await cardService.createReversedCard(
      cardId,
      userId,
      body.card_b ? { recto: body.card_b.recto, verso: body.card_b.verso, comment: body.card_b.comment ?? undefined } : undefined,
      { copyKnowledge: body.copy_knowledge }
    );
    if (!reversed) throw new NotFoundError('Card');
    const sourceCategories = await categoryService.getCategoriesForCard(cardId, userId);
    if (body.copy_categories && sourceCategories.length > 0) {
      await categoryService.setCategoriesForCard(reversed.id, userId, sourceCategories.map((c) => c.id));
    }
    await cardJourneyService.appendEvent(userId, {
      cardId: reversed.id,
      deckId: reversed.deck_id,
      eventType: 'card_created',
      eventTime: Date.now(),
      actor: 'user',
      source: 'cards_route',
      idempotencyKey: `card-reversed:${reversed.id}:${(req as { requestId?: string }).requestId ?? Date.now()}`,
      payload: { fromCardId: cardId },
    });
    const categories = await categoryService.getCategoriesForCard(reversed.id, userId);
    const data = { ...reversed, category_ids: categories.map((c) => c.id), categories };
    return res.status(201).json({ success: true, data });
  })
);

/**
 * POST /api/cards/:id/links
 * Link two existing cards (same user only). Idempotent if already linked.
 */
router.post(
  '/:id/links',
  validateParams(CardIdSchema),
  validateRequest(LinkCardBodySchema),
  asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    const cardId = String(req.params.id);
    const { otherCardId } = req.body as { otherCardId: string };
    if (cardId === otherCardId) {
      throw new ValidationError('Cannot link a card to itself');
    }
    await cardService.insertCardLink(userId, cardId, otherCardId);
    const card = await cardService.getCardById(cardId, userId);
    if (!card) throw new NotFoundError('Card');
    const categories = await categoryService.getCategoriesForCard(cardId, userId);
    const data = { ...card, category_ids: categories.map((c) => c.id), categories };
    return res.json({ success: true, data });
  })
);

/**
 * DELETE /api/cards/:id/links/:otherCardId
 * Remove the direct link between two cards (same user). Idempotent if already unlinked.
 */
router.delete(
  '/:id/links/:otherCardId',
  validateParams(CardLinkParamsSchema),
  asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    const cardId = String(req.params.id);
    const otherCardId = String(req.params.otherCardId);
    if (cardId === otherCardId) {
      throw new ValidationError('Cannot unlink a card from itself');
    }
    await cardService.removeCardLink(userId, cardId, otherCardId);
    const card = await cardService.getCardById(cardId, userId);
    if (!card) throw new NotFoundError('Card');
    const categories = await categoryService.getCategoriesForCard(cardId, userId);
    const data = { ...card, category_ids: categories.map((c) => c.id), categories };
    return res.json({ success: true, data });
  })
);

/**
 * GET /api/cards/:id
 * Get a specific card (includes categories when present)
 */
router.get('/:id', validateParams(CardIdSchema), asyncHandler(async (req, res) => {
  const userId = getUserId(req);
  const cardId = String(req.params.id);
  const card = await cardService.getCardById(cardId, userId);
  
  if (!card) {
    throw new NotFoundError('Card');
  }
  const categories = await categoryService.getCategoriesForCard(cardId, userId);
  const data = { ...card, category_ids: categories.map((c) => c.id), categories };
  return res.json({ success: true, data });
}));

/**
 * GET /api/cards/:id/history
 * Fetch full journey timeline for a card.
 */
router.get('/:id/history', validateParams(CardIdSchema), validateQuery(CardHistoryQuerySchema), asyncHandler(async (req, res) => {
  const userId = getUserId(req);
  const cardId = String(req.params.id);
  const card = await cardService.getCardById(cardId, userId);
  if (!card) {
    throw new NotFoundError('Card');
  }
  const validated = (req as { validatedQuery?: { limit?: number; beforeEventTime?: number } }).validatedQuery;
  const history = await cardJourneyService.getCardHistory(userId, cardId, {
    limit: validated?.limit,
    beforeEventTime: validated?.beforeEventTime,
  });
  return res.json({ success: true, data: history });
}));

/**
 * GET /api/cards/:id/history/summary
 * Fetch aggregated journey summary for a card.
 */
router.get('/:id/history/summary', validateParams(CardIdSchema), validateQuery(CardHistorySummaryQuerySchema), asyncHandler(async (req, res) => {
  const userId = getUserId(req);
  const cardId = String(req.params.id);
  const card = await cardService.getCardById(cardId, userId);
  if (!card) {
    throw new NotFoundError('Card');
  }
  const validated = (req as { validatedQuery?: { days?: number } }).validatedQuery;
  const days = validated?.days ?? 90;
  const [summary, byReviewDay] = await Promise.all([
    cardJourneyService.getCardHistorySummary(userId, cardId, { days }),
    reviewService.getReviewDayCountsForCard(cardId, userId, { days }),
  ]);
  return res.json({ success: true, data: { ...summary, byReviewDay } });
}));

/**
 * GET /api/cards/:id/review-logs
 * List review logs for a card (ratings, intervals, stability over time).
 */
router.get('/:id/review-logs', validateParams(CardIdSchema), validateQuery(CardReviewLogsQuerySchema), asyncHandler(async (req, res) => {
  const userId = getUserId(req);
  const cardId = String(req.params.id);
  const card = await cardService.getCardById(cardId, userId);
  if (!card) {
    throw new NotFoundError('Card');
  }
  const validated = (req as { validatedQuery?: { limit?: number } }).validatedQuery;
  const logs = await reviewService.getReviewLogsByCardId(cardId, userId, { limit: validated?.limit });
  return res.json({ success: true, data: logs });
}));

/**
 * POST /api/cards/:id/flag
 * Flag a card (e.g. need management, wrong content)
 */
router.post('/:id/flag', validateParams(CardIdSchema), validateRequest(CreateCardFlagSchema), asyncHandler(async (req, res) => {
  const userId = getUserId(req);
  const cardId = String(req.params.id);
  const flag = await cardFlagService.createFlag(cardId, userId, req.body);
  if (!flag) {
    throw new NotFoundError('Card');
  }
  return res.status(201).json({ success: true, data: flag });
}));

/**
 * PUT /api/cards/:id
 * Update a card
 */
router.put('/:id', validateParams(CardIdSchema), validateRequest(UpdateCardSchema), asyncHandler(async (req, res) => {
  const userId = getUserId(req);
  const cardId = String(req.params.id);
  const card = await cardService.updateCard(cardId, userId, req.body);
  
  if (!card) {
    throw new NotFoundError('Card');
  }

  await cardJourneyService.appendEvent(userId, {
    cardId,
    deckId: card.deck_id,
    eventType: 'card_updated',
    eventTime: Date.now(),
    actor: 'user',
    source: 'cards_route',
    idempotencyKey: `card-updated:${cardId}:${req.requestId ?? Date.now()}`,
    payload: req.body as Record<string, unknown>,
  });
  
  return res.json({ success: true, data: card });
}));

/**
 * DELETE /api/cards/:id
 * Delete a card
 */
router.delete('/:id', validateParams(CardIdSchema), asyncHandler(async (req, res) => {
  const userId = getUserId(req);
  const cardId = String(req.params.id);
  const card = await cardService.getCardById(cardId, userId);
  const deleted = await cardService.deleteCard(cardId, userId);
  
  if (!deleted) {
    throw new NotFoundError('Card');
  }

  if (card) {
    await cardJourneyService.appendEvent(userId, {
      cardId,
      deckId: card.deck_id,
      eventType: 'card_deleted',
      eventTime: Date.now(),
      actor: 'user',
      source: 'cards_route',
      idempotencyKey: `card-deleted:${cardId}:${req.requestId ?? Date.now()}`,
      payload: {
        deckId: card.deck_id,
      },
    });
  }
  
  return res.json({ success: true, message: 'Card deleted' });
}));

/**
 * POST /api/cards/:id/review/correct
 * Replace the rating on the latest review log for this card (same FSRS step; no extra log row).
 */
router.post(
  '/:id/review/correct',
  validateParams(CardIdSchema),
  validateRequest(CorrectRatingSchema),
  asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    const cardId = String(req.params.id);
    const { rating } = req.body as { rating: 1 | 2 | 3 | 4 };
    const started = Date.now();
    try {
      const result = await reviewService.correctLastReviewRating(cardId, userId, rating);
      if (!result) {
        throw new NotFoundError('Card');
      }
      await studyHealthDashboardService.recordRatingCorrectionMetric({
        userId,
        statusCode: 200,
        durationMs: Date.now() - started,
        outcome: 'success',
      });
      const data: Record<string, unknown> = { ...result };
      if (shouldIncludeCardForSessionRepeat(result)) {
        const card = await cardService.getCardById(cardId, userId);
        if (card) {
          const categories = await categoryService.getCategoriesForCard(cardId, userId);
          data.card = { ...card, category_ids: categories.map((c) => c.id), categories };
        }
      }
      return res.json({ success: true, data });
    } catch (err) {
      const statusCode = err instanceof AppError ? err.statusCode : 500;
      await studyHealthDashboardService.recordRatingCorrectionMetric({
        userId,
        statusCode,
        durationMs: Date.now() - started,
        outcome: 'error',
      });
      throw err;
    }
  })
);

/**
 * POST /api/cards/:id/review
 * Review a card (update FSRS state)
 */
router.post('/:id/review', validateParams(CardIdSchema), validateRequest(ReviewCardSchema), asyncHandler(async (req, res) => {
  const userId = getUserId(req);
  const cardId = String(req.params.id);
  const { rating, shownAt, revealedAt, ratedAt, thinkingDurationMs, clientEventId } = req.body;
  
  if (![1, 2, 3, 4].includes(rating)) {
    throw new ValidationError('Valid rating (1-4) is required');
  }
  
  const timing =
    shownAt != null ||
    revealedAt != null ||
    ratedAt != null ||
    thinkingDurationMs != null ||
    clientEventId != null
      ? { shownAt, revealedAt, ratedAt, thinkingDurationMs, clientEventId }
      : undefined;
  const result = await reviewService.reviewCard(cardId, userId, rating, timing);
  
  if (!result) {
    throw new NotFoundError('Card');
  }
  
  return res.json({ success: true, data: result });
}));

/**
 * POST /api/cards/:id/reset-stability
 * Reset card stability (treat as new)
 */
router.post('/:id/reset-stability', validateParams(CardIdSchema), asyncHandler(async (req, res) => {
  const userId = getUserId(req);
  const cardId = String(req.params.id);
  const card = await cardService.resetCardStability(cardId, userId);
  
  if (!card) {
    throw new NotFoundError('Card');
  }
  
  return res.json({ success: true, data: card });
}));

/**
 * PATCH /api/cards/:id/importance
 * Toggle per-card importance used by Day-1 policy.
 */
router.patch('/:id/importance', validateParams(CardIdSchema), validateRequest(UpdateCardImportanceSchema), asyncHandler(async (req, res) => {
  const userId = getUserId(req);
  const cardId = String(req.params.id);
  const { isImportant } = req.body as { isImportant: boolean };
  const card = await cardService.updateCardImportance(cardId, userId, isImportant);

  if (!card) {
    throw new NotFoundError('Card');
  }

  await cardJourneyService.appendEvent(userId, {
    cardId,
    deckId: card.deck_id,
    eventType: 'importance_toggled',
    eventTime: Date.now(),
    actor: 'user',
    source: 'cards_route',
    idempotencyKey: `importance:${cardId}:${isImportant}:${Date.now()}`,
    payload: { isImportant },
  });

  return res.json({ success: true, data: card });
}));

export default router;
