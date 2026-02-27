import { Router } from 'express';
import { DeckService } from '@/services/deck.service';
import { CardService } from '@/services/card.service';
import { getUserId } from '@/middleware/auth';
import { asyncHandler } from '@/middleware/errorHandler';
import { validateRequest, validateParams, validateQuery } from '@/middleware/validation';
import { CreateDeckSchema, UpdateDeckSchema, DeckIdSchema, DueCardsQuerySchema, StudyCardsQuerySchema } from '@/schemas/deck.schemas';
import { CreateCardSchema, GetCardsQuerySchema, BulkCreateCardsSchema } from '@/schemas/card.schemas';
import { NotFoundError } from '@/utils/errors';
import { API_LIMITS } from '@/constants/app.constants';
import { CardJourneyService } from '@/services/card-journey.service';
import { CardFlagService } from '@/services/card-flag.service';
import { ReviewService } from '@/services/review.service';
import { CategoryService } from '@/services/category.service';
import { createFSRS } from '@/services/fsrs.service';
import { getElapsedDays } from '@/services/fsrs-time.utils';
import { KnowledgeService } from '@/services/knowledge.service';
import type { Card } from '@/types/database';

const router = Router();
const knowledgeService = new KnowledgeService();
const categoryService = new CategoryService();
const deckService = new DeckService(categoryService);
const cardService = new CardService();
const cardJourneyService = new CardJourneyService();
const cardFlagService = new CardFlagService();
const reviewService = new ReviewService();

/**
 * GET /api/decks
 * Get all decks for the current user
 */
router.get('/', asyncHandler(async (req, res) => {
  const userId = getUserId(req);
  const decks = await deckService.getDecksByUserId(userId);
  return res.json({ success: true, data: decks });
}));

/**
 * GET /api/decks/:id
 * Get a specific deck
 */
router.get('/:id', validateParams(DeckIdSchema), asyncHandler(async (req, res) => {
  const userId = getUserId(req);
  const deckId = String(req.params.id);
  const deck = await deckService.getDeckById(deckId, userId);
  
  if (!deck) {
    throw new NotFoundError('Deck');
  }
  
  return res.json({ success: true, data: deck });
}));

/**
 * POST /api/decks
 * Create a new deck
 */
router.post('/', validateRequest(CreateDeckSchema), asyncHandler(async (req, res) => {
  const userId = getUserId(req);
  const deck = await deckService.createDeck(userId, req.body);
  return res.status(201).json({ success: true, data: deck });
}));

/**
 * PUT /api/decks/:id
 * Update a deck
 */
router.put('/:id', validateParams(DeckIdSchema), validateRequest(UpdateDeckSchema), asyncHandler(async (req, res) => {
  const userId = getUserId(req);
  const deckId = String(req.params.id);
  const deck = await deckService.updateDeck(deckId, userId, req.body);
  
  if (!deck) {
    throw new NotFoundError('Deck');
  }
  
  return res.json({ success: true, data: deck });
}));

/**
 * DELETE /api/decks/:id
 * Delete a deck
 */
router.delete('/:id', validateParams(DeckIdSchema), asyncHandler(async (req, res) => {
  const userId = getUserId(req);
  const deckId = String(req.params.id);
  const deleted = await deckService.deleteDeck(deckId, userId);
  
  if (!deleted) {
    throw new NotFoundError('Deck');
  }
  
  return res.json({ success: true, message: 'Deck deleted' });
}));

/**
 * GET /api/decks/:id/stats
 * Get deck statistics
 */
router.get('/:id/stats', validateParams(DeckIdSchema), asyncHandler(async (req, res) => {
  const userId = getUserId(req);
  const deckId = String(req.params.id);
  const stats = await deckService.getDeckStats(deckId, userId);
  return res.json({ success: true, data: stats });
}));

/**
 * Return due cards sorted by retrievability ascending (hardest first). Uses user's FSRS weights.
 */
async function getDueCardsSortedByRetrievability(dueCards: Card[], userId: string): Promise<Card[]> {
  if (dueCards.length === 0) return [];
  const settings = await reviewService.getUserSettings(userId);
  const fsrs = createFSRS({
    weights: settings.weights,
    targetRetention: settings.targetRetention,
  });
  const now = new Date();
  const withR: { card: Card; r: number }[] = [];
  for (const card of dueCards) {
    const stability = card.stability ?? 0;
    const from = card.last_review ?? card.next_review;
    const elapsedDays = getElapsedDays(from, now);
    const r = stability > 0
      ? fsrs.calculateRetrievability(elapsedDays, stability)
      : 0;
    withR.push({ card, r });
  }
  withR.sort((a, b) => a.r - b.r);
  return withR.map((x) => x.card);
}

/**
 * GET /api/decks/:id/study-stats
 * Counts for pre-study overview: due, new, flagged, critical (critical_before), highRisk (high_risk_before)
 */
router.get('/:id/study-stats', validateParams(DeckIdSchema), asyncHandler(async (req, res) => {
  const userId = getUserId(req);
  const deckId = String(req.params.id);
  const [dueCount, newCount, flaggedCount, criticalCount, highRiskCount] = await Promise.all([
    cardService.getDueCount(deckId, userId),
    cardService.getNewCount(deckId, userId),
    cardFlagService.getFlagCount(userId, { deckId, resolved: false }),
    cardService.getCriticalCount(deckId, userId),
    cardService.getHighRiskCount(deckId, userId),
  ]);
  return res.json({
    success: true,
    data: { dueCount, newCount, flaggedCount, criticalCount, highRiskCount },
  });
}));

/**
 * GET /api/decks/:id/cards/due
 * Get due cards for a deck, sorted by retrievability ascending (hardest first).
 * Query atRiskOnly=true: only cards with critical_before <= now (Study at-risk only). Must be before /:id/cards.
 */
router.get('/:id/cards/due', validateParams(DeckIdSchema), validateQuery(DueCardsQuerySchema), asyncHandler(async (req, res) => {
  const userId = getUserId(req);
  const deckId = String(req.params.id);
  const validated = (req as { validatedQuery?: { atRiskOnly?: boolean } }).validatedQuery;
  const atRiskOnly = validated?.atRiskOnly === true;
  const dueCards = atRiskOnly
    ? await cardService.getDueCardsAtRiskOnly(deckId, userId)
    : await cardService.getDueCards(deckId, userId);
  const cards = await getDueCardsSortedByRetrievability(dueCards, userId);
  const categoryMap = await categoryService.getCategoriesByCardIds(cards.map((c) => c.id), userId);
  const data = cards.map((c) => ({
    ...c,
    category_ids: (categoryMap.get(c.id) ?? []).map((cat) => cat.id),
    categories: categoryMap.get(c.id) ?? [],
  }));
  return res.json({ success: true, data });
}));

/**
 * GET /api/decks/:id/cards/new
 * Get new cards (not yet reviewed) (must be before /:id/cards)
 */
router.get('/:id/cards/new', validateParams(DeckIdSchema), validateQuery(GetCardsQuerySchema), asyncHandler(async (req, res) => {
  const userId = getUserId(req);
  const deckId = String(req.params.id);
  // validatedQuery is set by validateQuery (req.query is read-only in Express 5)
  const validated = (req as { validatedQuery?: { limit?: number } }).validatedQuery;
  const limit = typeof validated?.limit === 'number' ? validated.limit : API_LIMITS.DEFAULT_CARD_LIMIT;
  const cards = await cardService.getNewCards(deckId, userId, limit);
  const categoryMap = await categoryService.getCategoriesByCardIds(cards.map((c) => c.id), userId);
  const data = cards.map((c) => ({
    ...c,
    category_ids: (categoryMap.get(c.id) ?? []).map((cat) => cat.id),
    categories: categoryMap.get(c.id) ?? [],
  }));
  return res.json({ success: true, data });
}));

/**
 * GET /api/decks/:id/cards/study
 * Get study queue: due cards (sorted by retrievability) then new cards, limited. Optional excludeCardIds for extend session.
 */
router.get('/:id/cards/study', validateParams(DeckIdSchema), validateQuery(StudyCardsQuerySchema), asyncHandler(async (req, res) => {
  const userId = getUserId(req);
  const deckId = String(req.params.id);
  const validated = (req as { validatedQuery?: { limit?: number; excludeCardIds?: string[] } }).validatedQuery;
  const limit = validated?.limit ?? API_LIMITS.DEFAULT_CARD_LIMIT;
  const excludeIds = new Set(validated?.excludeCardIds ?? []);

  const [dueCards, newCards] = await Promise.all([
    cardService.getDueCards(deckId, userId),
    cardService.getNewCards(deckId, userId, limit + excludeIds.size),
  ]);
  const dueSorted = await getDueCardsSortedByRetrievability(dueCards, userId);
  const combined = [...dueSorted, ...newCards].filter((c) => !excludeIds.has(c.id));
  const data = combined.slice(0, limit);

  const categoryMap = await categoryService.getCategoriesByCardIds(data.map((c) => c.id), userId);
  const withCategories = data.map((c) => ({
    ...c,
    category_ids: (categoryMap.get(c.id) ?? []).map((cat) => cat.id),
    categories: categoryMap.get(c.id) ?? [],
  }));
  return res.json({ success: true, data: withCategories });
}));

/**
 * POST /api/decks/:id/cards/bulk
 * Create one or two cards (optionally with knowledge). When two cards, creates a reverse pair (mutual reverse_card_id).
 */
router.post('/:id/cards/bulk', validateParams(DeckIdSchema), validateRequest(BulkCreateCardsSchema), asyncHandler(async (req, res) => {
  const userId = getUserId(req);
  const deckId = String(req.params.id);
  const deck = await deckService.getDeckById(deckId, userId);
  if (!deck) throw new NotFoundError('Deck');
  const body = req.body as { knowledge?: { content?: string | null }; cards: Array<{ recto: string; verso: string; comment?: string | null; category_ids?: string[] }> };
  let knowledgeId: string | null = null;
  const shouldCreateKnowledge = (body.knowledge?.content != null && String(body.knowledge.content).trim() !== '') || body.cards.length === 2;
  if (shouldCreateKnowledge) {
    const knowledge = await knowledgeService.create(userId, body.knowledge?.content?.trim() ?? null);
    knowledgeId = knowledge.id;
  }
  if (body.cards.length === 2) {
    const [cardA, cardB] = await cardService.createCardPair(
      deckId,
      userId,
      knowledgeId,
      { recto: body.cards[0].recto, verso: body.cards[0].verso, comment: body.cards[0].comment ?? undefined },
      { recto: body.cards[1].recto, verso: body.cards[1].verso, comment: body.cards[1].comment ?? undefined }
    );
    if ((body.cards[0].category_ids?.length ?? 0) > 0) {
      await categoryService.setCategoriesForCard(cardA.id, userId, body.cards[0].category_ids!);
    }
    if ((body.cards[1].category_ids?.length ?? 0) > 0) {
      await categoryService.setCategoriesForCard(cardB.id, userId, body.cards[1].category_ids!);
    }
    await cardJourneyService.appendEvent(userId, {
      cardId: cardA.id,
      deckId,
      eventType: 'card_created',
      eventTime: Date.now(),
      actor: 'user',
      source: 'decks_route',
      idempotencyKey: `card-created:${cardA.id}:${req.requestId ?? Date.now()}`,
      payload: { bulk: true, pair: true },
    });
    await cardJourneyService.appendEvent(userId, {
      cardId: cardB.id,
      deckId,
      eventType: 'card_created',
      eventTime: Date.now(),
      actor: 'user',
      source: 'decks_route',
      idempotencyKey: `card-created:${cardB.id}:${req.requestId ?? Date.now()}`,
      payload: { bulk: true, pair: true },
    });
    const categoryMap = await categoryService.getCategoriesByCardIds([cardA.id, cardB.id], userId);
    const data = [cardA, cardB].map((c) => ({
      ...c,
      category_ids: (categoryMap.get(c.id) ?? []).map((cat) => cat.id),
      categories: categoryMap.get(c.id) ?? [],
    }));
    return res.status(201).json({ success: true, data });
  }
  const card = await cardService.createCard(deckId, userId, {
    recto: body.cards[0].recto,
    verso: body.cards[0].verso,
    comment: body.cards[0].comment ?? undefined,
    knowledge_id: knowledgeId,
  });
  if ((body.cards[0].category_ids?.length ?? 0) > 0) {
    await categoryService.setCategoriesForCard(card.id, userId, body.cards[0].category_ids!);
  }
  await cardJourneyService.appendEvent(userId, {
    cardId: card.id,
    deckId,
    eventType: 'card_created',
    eventTime: Date.now(),
    actor: 'user',
    source: 'decks_route',
    idempotencyKey: `card-created:${card.id}:${req.requestId ?? Date.now()}`,
    payload: { bulk: true },
  });
  const categories = await categoryService.getCategoriesForCard(card.id, userId);
  return res.status(201).json({
    success: true,
    data: { ...card, category_ids: categories.map((c) => c.id), categories },
  });
}));

/**
 * GET /api/decks/:id/cards
 * Get all cards in a deck
 */
router.get('/:id/cards', validateParams(DeckIdSchema), asyncHandler(async (req, res) => {
  const userId = getUserId(req);
  const deckId = String(req.params.id);
  const cards = await cardService.getCardsByDeckId(deckId, userId);
  const categoryMap = await categoryService.getCategoriesByCardIds(cards.map((c) => c.id), userId);
  const data = cards.map((c) => ({
    ...c,
    category_ids: (categoryMap.get(c.id) ?? []).map((cat) => cat.id),
    categories: categoryMap.get(c.id) ?? [],
  }));
  return res.json({ success: true, data });
}));

/**
 * POST /api/decks/:id/cards
 * Create a new card in a deck
 */
router.post('/:id/cards', validateParams(DeckIdSchema), validateRequest(CreateCardSchema), asyncHandler(async (req, res) => {
  const userId = getUserId(req);
  const deckId = String(req.params.id);
  const card = await cardService.createCard(deckId, userId, req.body);
  await cardJourneyService.appendEvent(userId, {
    cardId: card.id,
    deckId,
    eventType: 'card_created',
    eventTime: Date.now(),
    actor: 'user',
    source: 'decks_route',
    idempotencyKey: `card-created:${card.id}:${req.requestId ?? Date.now()}`,
    payload: {
      reverse: card.reverse,
      hasComment: card.comment != null,
      hasRectoImage: card.recto_image != null,
      hasVersoImage: card.verso_image != null,
    },
  });
  return res.status(201).json({ success: true, data: card });
}));

export default router;
