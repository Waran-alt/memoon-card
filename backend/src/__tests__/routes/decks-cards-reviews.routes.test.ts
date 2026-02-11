import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import decksRoutes from '@/routes/decks.routes';
import cardsRoutes from '@/routes/cards.routes';
import reviewsRoutes from '@/routes/reviews.routes';
import { errorHandler } from '@/middleware/errorHandler';

const {
  mockUserId,
  mockDeckId,
  mockCardId,
  deckServiceMock,
  cardServiceMock,
  reviewServiceMock,
} = vi.hoisted(() => ({
  mockUserId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  mockDeckId: '11111111-1111-4111-8111-111111111111',
  mockCardId: '22222222-2222-4222-8222-222222222222',
  deckServiceMock: {
    getDecksByUserId: vi.fn(),
    getDeckById: vi.fn(),
    createDeck: vi.fn(),
    updateDeck: vi.fn(),
    deleteDeck: vi.fn(),
    getDeckStats: vi.fn(),
  },
  cardServiceMock: {
    getCardsByDeckId: vi.fn(),
    getCardById: vi.fn(),
    createCard: vi.fn(),
    updateCard: vi.fn(),
    deleteCard: vi.fn(),
    getDueCards: vi.fn(),
    getNewCards: vi.fn(),
    resetCardStability: vi.fn(),
  },
  reviewServiceMock: {
    reviewCard: vi.fn(),
    batchReview: vi.fn(),
  },
}));

vi.mock('@/middleware/auth', () => ({
  getUserId: () => mockUserId,
}));

vi.mock('@/services/deck.service', () => ({
  DeckService: vi.fn().mockImplementation(() => deckServiceMock),
}));

vi.mock('@/services/card.service', () => ({
  CardService: vi.fn().mockImplementation(() => cardServiceMock),
}));

vi.mock('@/services/review.service', () => ({
  ReviewService: vi.fn().mockImplementation(() => reviewServiceMock),
}));

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/decks', decksRoutes);
  app.use('/api/cards', cardsRoutes);
  app.use('/api/reviews', reviewsRoutes);
  app.use(errorHandler);
  return app;
}

describe('Deck/Card/Review routes', () => {
  const app = createApp();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Deck lifecycle', () => {
    it('creates a deck', async () => {
      deckServiceMock.createDeck.mockResolvedValueOnce({
        id: mockDeckId,
        user_id: mockUserId,
        title: 'Spanish',
        description: null,
      });

      const res = await request(app)
        .post('/api/decks')
        .send({ title: 'Spanish', description: null });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(deckServiceMock.createDeck).toHaveBeenCalledWith(mockUserId, {
        title: 'Spanish',
        description: null,
      });
    });

    it('updates a deck', async () => {
      deckServiceMock.updateDeck.mockResolvedValueOnce({
        id: mockDeckId,
        user_id: mockUserId,
        title: 'Spanish Updated',
        description: 'Daily deck',
      });

      const res = await request(app)
        .put(`/api/decks/${mockDeckId}`)
        .send({ title: 'Spanish Updated', description: 'Daily deck' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(deckServiceMock.updateDeck).toHaveBeenCalledWith(
        mockDeckId,
        mockUserId,
        { title: 'Spanish Updated', description: 'Daily deck' }
      );
    });

    it('returns 404 when deleting unknown deck', async () => {
      deckServiceMock.deleteDeck.mockResolvedValueOnce(false);

      const res = await request(app).delete(`/api/decks/${mockDeckId}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(deckServiceMock.deleteDeck).toHaveBeenCalledWith(mockDeckId, mockUserId);
    });
  });

  describe('Card lifecycle', () => {
    it('creates a card in a deck', async () => {
      cardServiceMock.createCard.mockResolvedValueOnce({
        id: mockCardId,
        user_id: mockUserId,
        deck_id: mockDeckId,
        recto: 'Hola',
        verso: 'Hello',
        comment: null,
      });

      const res = await request(app)
        .post(`/api/decks/${mockDeckId}/cards`)
        .send({ recto: 'Hola', verso: 'Hello', comment: null });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(cardServiceMock.createCard).toHaveBeenCalledWith(
        mockDeckId,
        mockUserId,
        expect.objectContaining({
          recto: 'Hola',
          verso: 'Hello',
          comment: null,
        })
      );
    });

    it('updates a card', async () => {
      cardServiceMock.updateCard.mockResolvedValueOnce({
        id: mockCardId,
        user_id: mockUserId,
        recto: 'Bonjour',
      });

      const res = await request(app)
        .put(`/api/cards/${mockCardId}`)
        .send({ recto: 'Bonjour' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(cardServiceMock.updateCard).toHaveBeenCalledWith(
        mockCardId,
        mockUserId,
        { recto: 'Bonjour' }
      );
    });

    it('deletes a card', async () => {
      cardServiceMock.deleteCard.mockResolvedValueOnce(true);

      const res = await request(app).delete(`/api/cards/${mockCardId}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(cardServiceMock.deleteCard).toHaveBeenCalledWith(mockCardId, mockUserId);
    });
  });

  describe('Review submission', () => {
    it('reviews a card with valid rating', async () => {
      reviewServiceMock.reviewCard.mockResolvedValueOnce({
        interval: 4,
        retrievability: 0.9,
        message: 'Good progress',
        state: {
          stability: 3.2,
          difficulty: 4.1,
          lastReview: null,
          nextReview: new Date(),
        },
      });

      const res = await request(app)
        .post(`/api/cards/${mockCardId}/review`)
        .send({ rating: 3 });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(reviewServiceMock.reviewCard).toHaveBeenCalledWith(
        mockCardId,
        mockUserId,
        3
      );
    });

    it('rejects invalid review rating', async () => {
      const res = await request(app)
        .post(`/api/cards/${mockCardId}/review`)
        .send({ rating: 5 });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(reviewServiceMock.reviewCard).not.toHaveBeenCalled();
    });

    it('submits batch reviews', async () => {
      const reviews = [{ cardId: mockCardId, rating: 4 }];
      reviewServiceMock.batchReview.mockResolvedValueOnce([
        {
          cardId: mockCardId,
          result: {
            interval: 7,
            retrievability: 0.95,
            message: 'Great',
            state: {
              stability: 7,
              difficulty: 3.8,
              lastReview: null,
              nextReview: new Date(),
            },
          },
        },
      ]);

      const res = await request(app)
        .post('/api/reviews/batch')
        .send({ reviews });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(reviewServiceMock.batchReview).toHaveBeenCalledWith(reviews, mockUserId);
    });
  });
});
