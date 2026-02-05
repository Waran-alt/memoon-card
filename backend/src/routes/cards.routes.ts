import { Router } from 'express';
import { CardService } from '../services/card.service';
import { ReviewService } from '../services/review.service';
import { getUserId } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { validateRequest, validateParams } from '../middleware/validation';
import {
  UpdateCardSchema,
  ReviewCardSchema,
  CardIdSchema,
} from '../schemas/card.schemas';
import { NotFoundError, ValidationError } from '../utils/errors';

const router = Router();
const cardService = new CardService();
const reviewService = new ReviewService();

/**
 * GET /api/cards/:id
 * Get a specific card
 */
router.get('/:id', validateParams(CardIdSchema), asyncHandler(async (req, res) => {
  const userId = getUserId(req);
  const cardId = String(req.params.id);
  const card = await cardService.getCardById(cardId, userId);
  
  if (!card) {
    throw new NotFoundError('Card');
  }
  
  return res.json({ success: true, data: card });
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
  
  return res.json({ success: true, data: card });
}));

/**
 * DELETE /api/cards/:id
 * Delete a card
 */
router.delete('/:id', validateParams(CardIdSchema), asyncHandler(async (req, res) => {
  const userId = getUserId(req);
  const cardId = String(req.params.id);
  const deleted = await cardService.deleteCard(cardId, userId);
  
  if (!deleted) {
    throw new NotFoundError('Card');
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
  const rating = req.body.rating;
  
  if (![1, 2, 3, 4].includes(rating)) {
    throw new ValidationError('Valid rating (1-4) is required');
  }
  
  const result = await reviewService.reviewCard(cardId, userId, rating);
  
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

export default router;
