import { Router } from 'express';
import { CardService } from '@/services/card.service';
import { ReviewService } from '@/services/review.service';
import { getUserId } from '@/middleware/auth';
import { asyncHandler } from '@/middleware/errorHandler';
import { validateRequest, validateParams, validateQuery } from '@/middleware/validation';
import {
  UpdateCardSchema,
  ReviewCardSchema,
  CardIdSchema,
  SetCardCategoriesSchema,
  CreateCardFlagSchema,
  ListFlagsQuerySchema,
  FlagIdParamSchema,
  ResolveFlagSchema,
  PostponeCardSchema,
  UpdateCardImportanceSchema,
  UpdateStudyIntensitySchema,
  CardHistoryQuerySchema,
  CardHistorySummaryQuerySchema,
  CardReviewLogsQuerySchema,
  CreateReversedCardSchema,
} from '@/schemas/card.schemas';
import { NotFoundError, ValidationError } from '@/utils/errors';
import { CardJourneyService } from '@/services/card-journey.service';
import { CardFlagService } from '@/services/card-flag.service';
import { CategoryService } from '@/services/category.service';

const router = Router();
const cardService = new CardService();
const reviewService = new ReviewService();
const cardJourneyService = new CardJourneyService();
const cardFlagService = new CardFlagService();
const categoryService = new CategoryService();

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
 * Create a reversed card (recto/verso swapped), same deck and knowledge; links the pair via reverse_card_id.
 * Optional body: { card_b?: { recto, verso, comment? } } to use custom content for the new card. Omit body for immediate create (swapped from source).
 */
router.post(
  '/:id/reversed',
  validateParams(CardIdSchema),
  validateRequest(CreateReversedCardSchema),
  asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    const cardId = String(req.params.id);
    const body = (req as { body?: { card_b?: { recto: string; verso: string; comment?: string | null } } }).body ?? {};
    const sourceCard = await cardService.getCardById(cardId, userId);
    if (!sourceCard) throw new NotFoundError('Card');
    if (sourceCard.reverse_card_id) {
      throw new ValidationError('Card already has a reversed card');
    }
    const reversed = await cardService.createReversedCard(
      cardId,
      userId,
      body.card_b ? { recto: body.card_b.recto, verso: body.card_b.verso, comment: body.card_b.comment ?? undefined } : undefined
    );
    if (!reversed) throw new NotFoundError('Card');
    const sourceCategories = await categoryService.getCategoriesForCard(cardId, userId);
    if (sourceCategories.length > 0) {
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
  const validated = (req as { validatedQuery?: { days?: number; sessionLimit?: number } }).validatedQuery;
  const summary = await cardJourneyService.getCardHistorySummary(userId, cardId, {
    days: validated?.days,
    sessionLimit: validated?.sessionLimit,
  });
  return res.json({ success: true, data: summary });
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
 * POST /api/cards/:id/review
 * Review a card (update FSRS state)
 */
router.post('/:id/review', validateParams(CardIdSchema), validateRequest(ReviewCardSchema), asyncHandler(async (req, res) => {
  const userId = getUserId(req);
  const cardId = String(req.params.id);
  const { rating, shownAt, revealedAt, sessionId, sequenceInSession, clientEventId, intensityMode } = req.body;
  
  if (![1, 2, 3, 4].includes(rating)) {
    throw new ValidationError('Valid rating (1-4) is required');
  }
  
  const timing =
    shownAt != null ||
    revealedAt != null ||
    sessionId != null ||
    sequenceInSession != null ||
    clientEventId != null ||
    intensityMode != null
      ? { shownAt, revealedAt, sessionId, sequenceInSession, clientEventId, intensityMode }
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
 * POST /api/cards/:id/postpone
 * Apply management penalty: push next review forward (user saw content outside study)
 */
router.post('/:id/postpone', validateParams(CardIdSchema), validateRequest(PostponeCardSchema), asyncHandler(async (req, res) => {
  const userId = getUserId(req);
  const cardId = String(req.params.id);
  const revealedForSeconds = typeof req.body?.revealedForSeconds === 'number'
    ? req.body.revealedForSeconds
    : 30;
  const card = await reviewService.applyManagementPenaltyToCard(cardId, userId, revealedForSeconds);
  
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

/**
 * GET /api/cards/settings/study-intensity
 * Get user-level study intensity profile.
 */
router.get('/settings/study-intensity', asyncHandler(async (req, res) => {
  const userId = getUserId(req);
  const intensityMode = await reviewService.getUserStudyIntensity(userId);
  return res.json({ success: true, data: { intensityMode } });
}));

/**
 * PUT /api/cards/settings/study-intensity
 * Update user-level study intensity profile.
 */
router.put('/settings/study-intensity', validateRequest(UpdateStudyIntensitySchema), asyncHandler(async (req, res) => {
  const userId = getUserId(req);
  const { intensityMode } = req.body as { intensityMode: 'light' | 'default' | 'intensive' };
  const updated = await reviewService.updateUserStudyIntensity(userId, intensityMode);
  return res.json({ success: true, data: { intensityMode: updated } });
}));

export default router;
