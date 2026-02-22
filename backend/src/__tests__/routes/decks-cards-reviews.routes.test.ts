import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import decksRoutes from '@/routes/decks.routes';
import cardsRoutes from '@/routes/cards.routes';
import reviewsRoutes from '@/routes/reviews.routes';
import { errorHandler } from '@/middleware/errorHandler';
import { FSRS_V6_DEFAULT_WEIGHTS } from '@/constants/fsrs.constants';

const {
  mockUserId,
  mockDeckId,
  mockCardId,
  deckServiceMock,
  cardServiceMock,
  reviewServiceMock,
  cardJourneyServiceMock,
  cardFlagServiceMock,
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
    getDueCount: vi.fn(),
    getNewCount: vi.fn(),
    getCriticalCount: vi.fn(),
    getHighRiskCount: vi.fn(),
    getDueCards: vi.fn(),
    getDueCardsAtRiskOnly: vi.fn(),
    getNewCards: vi.fn(),
    resetCardStability: vi.fn(),
    updateCardImportance: vi.fn(),
  },
  reviewServiceMock: {
    reviewCard: vi.fn(),
    batchReview: vi.fn(),
    getUserSettings: vi.fn(),
    getUserStudyIntensity: vi.fn(),
    updateUserStudyIntensity: vi.fn(),
  },
  cardJourneyServiceMock: {
    appendEvent: vi.fn(),
    getCardHistory: vi.fn(),
    getCardHistorySummary: vi.fn(),
  },
  cardFlagServiceMock: {
    createFlag: vi.fn(),
    getFlagCount: vi.fn(),
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

vi.mock('@/services/card-journey.service', () => ({
  CardJourneyService: vi.fn().mockImplementation(() => cardJourneyServiceMock),
}));

vi.mock('@/services/card-flag.service', () => ({
  CardFlagService: vi.fn().mockImplementation(() => cardFlagServiceMock),
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
      expect(cardJourneyServiceMock.appendEvent).toHaveBeenCalledWith(
        mockUserId,
        expect.objectContaining({
          cardId: mockCardId,
          eventType: 'card_created',
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
      expect(cardJourneyServiceMock.appendEvent).toHaveBeenCalledWith(
        mockUserId,
        expect.objectContaining({
          cardId: mockCardId,
          eventType: 'card_updated',
        })
      );
    });

    it('deletes a card', async () => {
      cardServiceMock.getCardById.mockResolvedValueOnce({
        id: mockCardId,
        deck_id: mockDeckId,
        user_id: mockUserId,
      });
      cardServiceMock.deleteCard.mockResolvedValueOnce(true);

      const res = await request(app).delete(`/api/cards/${mockCardId}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(cardServiceMock.deleteCard).toHaveBeenCalledWith(mockCardId, mockUserId);
      expect(cardJourneyServiceMock.appendEvent).toHaveBeenCalledWith(
        mockUserId,
        expect.objectContaining({
          cardId: mockCardId,
          eventType: 'card_deleted',
        })
      );
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
        3,
        undefined
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

  describe('Deck GET routes', () => {
    it('gets all decks for user', async () => {
      const mockDecks = [
        { id: mockDeckId, user_id: mockUserId, title: 'Spanish', description: null },
        { id: 'deck-2', user_id: mockUserId, title: 'French', description: 'Daily' },
      ];
      deckServiceMock.getDecksByUserId.mockResolvedValueOnce(mockDecks);

      const res = await request(app).get('/api/decks');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual(mockDecks);
      expect(deckServiceMock.getDecksByUserId).toHaveBeenCalledWith(mockUserId);
    });

    it('gets a specific deck by id', async () => {
      const mockDeck = {
        id: mockDeckId,
        user_id: mockUserId,
        title: 'Spanish',
        description: 'Daily practice',
      };
      deckServiceMock.getDeckById.mockResolvedValueOnce(mockDeck);

      const res = await request(app).get(`/api/decks/${mockDeckId}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual(mockDeck);
      expect(deckServiceMock.getDeckById).toHaveBeenCalledWith(mockDeckId, mockUserId);
    });

    it('returns 404 when deck not found', async () => {
      deckServiceMock.getDeckById.mockResolvedValueOnce(null);

      const res = await request(app).get(`/api/decks/${mockDeckId}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('gets deck statistics', async () => {
      const mockStats = {
        totalCards: 50,
        dueCards: 10,
        newCards: 5,
        totalReviews: 200,
      };
      deckServiceMock.getDeckStats.mockResolvedValueOnce(mockStats);

      const res = await request(app).get(`/api/decks/${mockDeckId}/stats`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual(mockStats);
      expect(deckServiceMock.getDeckStats).toHaveBeenCalledWith(mockDeckId, mockUserId);
    });
  });

  describe('Card GET routes', () => {
    it('gets all cards in a deck', async () => {
      const mockCards = [
        {
          id: mockCardId,
          deck_id: mockDeckId,
          user_id: mockUserId,
          recto: 'Hola',
          verso: 'Hello',
        },
        {
          id: 'card-2',
          deck_id: mockDeckId,
          user_id: mockUserId,
          recto: 'Adios',
          verso: 'Goodbye',
        },
      ];
      cardServiceMock.getCardsByDeckId.mockResolvedValueOnce(mockCards);

      const res = await request(app).get(`/api/decks/${mockDeckId}/cards`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual(mockCards);
      expect(cardServiceMock.getCardsByDeckId).toHaveBeenCalledWith(mockDeckId, mockUserId);
    });

    it('gets due cards for a deck (sorted by retrievability, hardest first)', async () => {
      const dueDate = new Date(Date.now() - 1000);
      const mockDueCards = [
        {
          id: mockCardId,
          deck_id: mockDeckId,
          user_id: mockUserId,
          last_review: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
          next_review: dueDate,
          stability: 1.5,
          difficulty: 5,
        },
      ];
      cardServiceMock.getDueCards.mockResolvedValueOnce(mockDueCards);
      reviewServiceMock.getUserSettings.mockResolvedValueOnce({
        weights: [...FSRS_V6_DEFAULT_WEIGHTS],
        targetRetention: 0.9,
      });

      const res = await request(app).get(`/api/decks/${mockDeckId}/cards/due`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].id).toBe(mockCardId);
      expect(res.body.data[0].next_review).toBe(dueDate.toISOString());
      expect(cardServiceMock.getDueCards).toHaveBeenCalledWith(mockDeckId, mockUserId);
    });

    it('gets due cards at-risk only when atRiskOnly=true', async () => {
      const dueDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const mockDueCards = [
        {
          id: mockCardId,
          deck_id: mockDeckId,
          user_id: mockUserId,
          last_review: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
          next_review: dueDate,
          stability: 1.5,
          difficulty: 5,
        },
      ];
      cardServiceMock.getDueCardsAtRiskOnly.mockResolvedValueOnce(mockDueCards);
      reviewServiceMock.getUserSettings.mockResolvedValueOnce({
        weights: [...FSRS_V6_DEFAULT_WEIGHTS],
        targetRetention: 0.9,
      });

      const res = await request(app).get(`/api/decks/${mockDeckId}/cards/due?atRiskOnly=true`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(cardServiceMock.getDueCardsAtRiskOnly).toHaveBeenCalledWith(mockDeckId, mockUserId);
      expect(cardServiceMock.getDueCards).not.toHaveBeenCalled();
    });

    it('returns study-stats for a deck (due, new, flagged, critical, highRisk counts)', async () => {
      cardServiceMock.getDueCount.mockResolvedValueOnce(5);
      cardServiceMock.getNewCount.mockResolvedValueOnce(2);
      cardFlagServiceMock.getFlagCount.mockResolvedValueOnce(1);
      cardServiceMock.getCriticalCount.mockResolvedValueOnce(1);
      cardServiceMock.getHighRiskCount.mockResolvedValueOnce(3);

      const res = await request(app).get(`/api/decks/${mockDeckId}/study-stats`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual({
        dueCount: 5,
        newCount: 2,
        flaggedCount: 1,
        criticalCount: 1,
        highRiskCount: 3,
      });
      expect(cardServiceMock.getDueCount).toHaveBeenCalledWith(mockDeckId, mockUserId);
      expect(cardServiceMock.getNewCount).toHaveBeenCalledWith(mockDeckId, mockUserId);
      expect(cardServiceMock.getCriticalCount).toHaveBeenCalledWith(mockDeckId, mockUserId);
      expect(cardServiceMock.getHighRiskCount).toHaveBeenCalledWith(mockDeckId, mockUserId);
      expect(cardFlagServiceMock.getFlagCount).toHaveBeenCalledWith(mockUserId, {
        deckId: mockDeckId,
        resolved: false,
      });
    });

    it('gets new cards for a deck with default limit', async () => {
      const mockNewCards = [
        {
          id: mockCardId,
          deck_id: mockDeckId,
          user_id: mockUserId,
          stability: null,
        },
      ];
      cardServiceMock.getNewCards.mockResolvedValueOnce(mockNewCards);

      const res = await request(app).get(`/api/decks/${mockDeckId}/cards/new`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual(mockNewCards);
      expect(cardServiceMock.getNewCards).toHaveBeenCalledWith(mockDeckId, mockUserId, 20);
    });

    it('gets new cards for a deck with custom limit', async () => {
      const mockNewCards = [
        {
          id: mockCardId,
          deck_id: mockDeckId,
          user_id: mockUserId,
          stability: null,
        },
      ];
      cardServiceMock.getNewCards.mockResolvedValueOnce(mockNewCards);

      const res = await request(app).get(`/api/decks/${mockDeckId}/cards/new?limit=50`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(cardServiceMock.getNewCards).toHaveBeenCalledWith(mockDeckId, mockUserId, 50);
    });

    it('gets a specific card by id', async () => {
      const mockCard = {
        id: mockCardId,
        deck_id: mockDeckId,
        user_id: mockUserId,
        recto: 'Hola',
        verso: 'Hello',
      };
      cardServiceMock.getCardById.mockResolvedValueOnce(mockCard);

      const res = await request(app).get(`/api/cards/${mockCardId}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual(mockCard);
      expect(cardServiceMock.getCardById).toHaveBeenCalledWith(mockCardId, mockUserId);
    });

    it('returns 404 when card not found', async () => {
      cardServiceMock.getCardById.mockResolvedValueOnce(null);

      const res = await request(app).get(`/api/cards/${mockCardId}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });

  describe('Card reset stability', () => {
    it('resets card stability', async () => {
      const nextReviewDate = new Date();
      const mockCard = {
        id: mockCardId,
        deck_id: mockDeckId,
        user_id: mockUserId,
        stability: null,
        difficulty: null,
        last_review: null,
        next_review: nextReviewDate,
      };
      cardServiceMock.resetCardStability.mockResolvedValueOnce(mockCard);

      const res = await request(app).post(`/api/cards/${mockCardId}/reset-stability`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(mockCardId);
      expect(res.body.data.stability).toBeNull();
      expect(res.body.data.difficulty).toBeNull();
      expect(res.body.data.last_review).toBeNull();
      expect(res.body.data.next_review).toBe(nextReviewDate.toISOString());
      expect(cardServiceMock.resetCardStability).toHaveBeenCalledWith(mockCardId, mockUserId);
    });

    it('returns 404 when card not found for reset', async () => {
      cardServiceMock.resetCardStability.mockResolvedValueOnce(null);

      const res = await request(app).post(`/api/cards/${mockCardId}/reset-stability`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });

  describe('Card importance and intensity controls', () => {
    it('updates card importance', async () => {
      cardServiceMock.updateCardImportance = vi.fn().mockResolvedValueOnce({
        id: mockCardId,
        user_id: mockUserId,
        is_important: true,
      });

      const res = await request(app)
        .patch(`/api/cards/${mockCardId}/importance`)
        .send({ isImportant: true });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(cardServiceMock.updateCardImportance).toHaveBeenCalledWith(mockCardId, mockUserId, true);
      expect(cardJourneyServiceMock.appendEvent).toHaveBeenCalled();
    });

    it('gets card history', async () => {
      cardServiceMock.getCardById.mockResolvedValueOnce({
        id: mockCardId,
        deck_id: mockDeckId,
        user_id: mockUserId,
      });
      cardJourneyServiceMock.getCardHistory.mockResolvedValueOnce([
        {
          id: 'aaaa',
          event_type: 'rating_submitted',
        },
      ]);
      const res = await request(app).get(`/api/cards/${mockCardId}/history?limit=10`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(cardJourneyServiceMock.getCardHistory).toHaveBeenCalledWith(
        mockUserId,
        mockCardId,
        expect.objectContaining({ limit: 10 })
      );
    });

    it('gets card history summary', async () => {
      cardServiceMock.getCardById.mockResolvedValueOnce({
        id: mockCardId,
        deck_id: mockDeckId,
        user_id: mockUserId,
      });
      cardJourneyServiceMock.getCardHistorySummary = vi.fn().mockResolvedValueOnce({
        cardId: mockCardId,
        days: 30,
        totalEvents: 5,
        byEventType: [{ eventType: 'rating_submitted', count: 3 }],
        byDay: [{ day: '2026-02-16', count: 5 }],
        bySession: [],
      });

      const res = await request(app).get(`/api/cards/${mockCardId}/history/summary?days=30&sessionLimit=5`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(cardJourneyServiceMock.getCardHistorySummary).toHaveBeenCalledWith(
        mockUserId,
        mockCardId,
        expect.objectContaining({ days: 30, sessionLimit: 5 })
      );
    });

    it('gets user study intensity', async () => {
      reviewServiceMock.getUserStudyIntensity.mockResolvedValueOnce('intensive');
      const res = await request(app).get('/api/cards/settings/study-intensity');
      expect(res.status).toBe(200);
      expect(res.body.data.intensityMode).toBe('intensive');
    });

    it('updates user study intensity', async () => {
      reviewServiceMock.updateUserStudyIntensity.mockResolvedValueOnce('light');
      const res = await request(app)
        .put('/api/cards/settings/study-intensity')
        .send({ intensityMode: 'light' });
      expect(res.status).toBe(200);
      expect(res.body.data.intensityMode).toBe('light');
      expect(reviewServiceMock.updateUserStudyIntensity).toHaveBeenCalledWith(mockUserId, 'light');
    });
  });

  describe('Card flag', () => {
    it('creates a card flag with reason and optional note/sessionId', async () => {
      const mockFlag = {
        id: '33333333-3333-4333-8333-333333333333',
        card_id: mockCardId,
        user_id: mockUserId,
        reason: 'wrong_content',
        note: 'Fix the answer',
        flagged_during_session_id: '44444444-4444-4444-8444-444444444444',
        resolved: false,
        created_at: new Date(),
      };
      cardFlagServiceMock.createFlag.mockResolvedValueOnce(mockFlag);

      const res = await request(app)
        .post(`/api/cards/${mockCardId}/flag`)
        .send({
          reason: 'wrong_content',
          note: 'Fix the answer',
          sessionId: '44444444-4444-4444-8444-444444444444',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.reason).toBe('wrong_content');
      expect(cardFlagServiceMock.createFlag).toHaveBeenCalledWith(
        mockCardId,
        mockUserId,
        expect.objectContaining({
          reason: 'wrong_content',
          note: 'Fix the answer',
          sessionId: '44444444-4444-4444-8444-444444444444',
        })
      );
    });

    it('returns 404 when card not found for flag', async () => {
      cardFlagServiceMock.createFlag.mockResolvedValueOnce(null);

      const res = await request(app)
        .post(`/api/cards/${mockCardId}/flag`)
        .send({ reason: 'typo' });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('returns 400 when reason is missing', async () => {
      const res = await request(app)
        .post(`/api/cards/${mockCardId}/flag`)
        .send({});

      expect(res.status).toBe(400);
      expect(cardFlagServiceMock.createFlag).not.toHaveBeenCalled();
    });
  });
});
