import { Router } from 'express';
import { DeckService } from '../services/deck.service';
import { CardService } from '../services/card.service';
import { getUserId } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { validateRequest, validateParams, validateQuery } from '../middleware/validation';
import { CreateDeckSchema, UpdateDeckSchema, DeckIdSchema } from '../schemas/deck.schemas';
import { CreateCardSchema, GetCardsQuerySchema } from '../schemas/card.schemas';
import { NotFoundError } from '../utils/errors';
import { API_LIMITS } from '../constants/app.constants';

const router = Router();
const deckService = new DeckService();
const cardService = new CardService();

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
 * GET /api/decks/:id/cards/due
 * Get due cards for a deck (must be before /:id/cards)
 */
router.get('/:id/cards/due', validateParams(DeckIdSchema), asyncHandler(async (req, res) => {
  const userId = getUserId(req);
  const deckId = String(req.params.id);
  const cards = await cardService.getDueCards(deckId, userId);
  return res.json({ success: true, data: cards });
}));

/**
 * GET /api/decks/:id/cards/new
 * Get new cards (not yet reviewed) (must be before /:id/cards)
 */
router.get('/:id/cards/new', validateParams(DeckIdSchema), validateQuery(GetCardsQuerySchema), asyncHandler(async (req, res) => {
  const userId = getUserId(req);
  const deckId = String(req.params.id);
  const limit = typeof req.query.limit === 'number' ? req.query.limit : API_LIMITS.DEFAULT_CARD_LIMIT;
  const cards = await cardService.getNewCards(deckId, userId, limit);
  return res.json({ success: true, data: cards });
}));

/**
 * GET /api/decks/:id/cards
 * Get all cards in a deck
 */
router.get('/:id/cards', validateParams(DeckIdSchema), asyncHandler(async (req, res) => {
  const userId = getUserId(req);
  const deckId = String(req.params.id);
  const cards = await cardService.getCardsByDeckId(deckId, userId);
  return res.json({ success: true, data: cards });
}));

/**
 * POST /api/decks/:id/cards
 * Create a new card in a deck
 */
router.post('/:id/cards', validateParams(DeckIdSchema), validateRequest(CreateCardSchema), asyncHandler(async (req, res) => {
  const userId = getUserId(req);
  const deckId = String(req.params.id);
  const card = await cardService.createCard(deckId, userId, req.body);
  return res.status(201).json({ success: true, data: card });
}));

export default router;
