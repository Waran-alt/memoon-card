import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import decksRoutes from '@/routes/decks.routes';
import cardsRoutes from '@/routes/cards.routes';
import reviewsRoutes from '@/routes/reviews.routes';
import { errorHandler } from '@/middleware/errorHandler';
import { FSRS_V6_DEFAULT_WEIGHTS } from '@/constants/fsrs.constants';
import { ConflictError } from '@/utils/errors';

const recordRatingCorrectionMetricMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

const {
  mockUserId,
  mockDeckId,
  mockCardId,
  mockOtherCardId,
  deckServiceMock,
  cardServiceMock,
  reviewServiceMock,
  cardJourneyServiceMock,
  cardFlagServiceMock,
  categoryServiceMock,
  knowledgeServiceMock,
} = vi.hoisted(() => ({
  mockUserId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  mockDeckId: '11111111-1111-4111-8111-111111111111',
  mockCardId: '22222222-2222-4222-8222-222222222222',
  mockOtherCardId: '33333333-3333-4333-8333-333333333333',
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
    createCardPair: vi.fn(),
    createReversedCard: vi.fn(),
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
    insertCardLink: vi.fn(),
    removeCardLink: vi.fn(),
  },
  reviewServiceMock: {
    reviewCard: vi.fn(),
    correctLastReviewRating: vi.fn(),
    batchReview: vi.fn(),
    getUserSettings: vi.fn(),
    getReviewLogsByCardId: vi.fn(),
    getReviewDayCountsForCard: vi.fn(),
    getReviewDayCountsForDeck: vi.fn(),
    getReviewLogsByDeckForCharts: vi.fn(),
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
  categoryServiceMock: {
    getCategoriesForCard: vi.fn().mockResolvedValue([]),
    getCategoriesByCardIds: vi.fn().mockResolvedValue(new Map()),
    setCategoriesForCard: vi.fn().mockResolvedValue(undefined),
  },
  knowledgeServiceMock: {
    create: vi.fn().mockResolvedValue({
      id: 'knowledge-id',
      user_id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      content: null,
      created_at: new Date(),
      updated_at: new Date(),
    }),
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

vi.mock('@/services/category.service', () => ({
  CategoryService: vi.fn().mockImplementation(() => categoryServiceMock),
}));

vi.mock('@/services/knowledge.service', () => ({
  KnowledgeService: vi.fn().mockImplementation(() => knowledgeServiceMock),
}));

vi.mock('@/services/study-health-dashboard.service', () => ({
  StudyHealthDashboardService: vi.fn().mockImplementation(() => ({
    recordRatingCorrectionMetric: recordRatingCorrectionMetricMock,
    recordStudyApiMetric: vi.fn().mockResolvedValue(undefined),
    getDashboard: vi.fn().mockResolvedValue(undefined),
  })),
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
      expect(deckServiceMock.createDeck).toHaveBeenCalledWith(
        mockUserId,
        expect.objectContaining({ title: 'Spanish', description: null })
      );
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
        reviewLogId: 'mock-review-log',
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

    it('corrects last review rating and records success metric', async () => {
      const result = {
        interval: 2,
        retrievability: 0.85,
        message: 'ok',
        state: {
          stability: 2.1,
          difficulty: 4.5,
          lastReview: new Date(),
          nextReview: new Date(Date.now() + 86400000),
        },
        reviewLogId: 'log-uuid-1',
      };
      reviewServiceMock.correctLastReviewRating.mockResolvedValueOnce(result);

      const res = await request(app)
        .post(`/api/cards/${mockCardId}/review/correct`)
        .send({ rating: 4 });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toMatchObject({
        interval: result.interval,
        reviewLogId: 'log-uuid-1',
      });
      expect(reviewServiceMock.correctLastReviewRating).toHaveBeenCalledWith(
        mockCardId,
        mockUserId,
        4
      );
      expect(recordRatingCorrectionMetricMock).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: mockUserId,
          statusCode: 200,
          outcome: 'success',
        })
      );
      expect(cardServiceMock.getCardById).not.toHaveBeenCalled();
    });

    it('includes card in response when session repeat applies', async () => {
      const result = {
        interval: 0.04,
        retrievability: 0.85,
        message: 'ok',
        state: {
          stability: 0.5,
          difficulty: 5,
          lastReview: new Date(),
          nextReview: new Date(Date.now() + 10 * 60_000),
        },
        reviewLogId: 'log-uuid-1',
      };
      reviewServiceMock.correctLastReviewRating.mockResolvedValueOnce(result);
      cardServiceMock.getCardById.mockResolvedValueOnce({
        id: mockCardId,
        deck_id: mockDeckId,
        user_id: mockUserId,
        recto: 'Q',
        verso: 'A',
        comment: null,
        recto_image: null,
        verso_image: null,
        recto_formula: false,
        verso_formula: false,
        reverse: true,
        stability: 0.5,
        difficulty: 5,
        last_review: new Date(),
        next_review: new Date(),
        created_at: new Date(),
        updated_at: new Date(),
      });

      const res = await request(app)
        .post(`/api/cards/${mockCardId}/review/correct`)
        .send({ rating: 3 });

      expect(res.status).toBe(200);
      expect(res.body.data.card).toMatchObject({
        id: mockCardId,
        category_ids: [],
        categories: [],
      });
      expect(cardServiceMock.getCardById).toHaveBeenCalledWith(mockCardId, mockUserId);
    });

    it('returns 400 for invalid correct rating', async () => {
      const res = await request(app)
        .post(`/api/cards/${mockCardId}/review/correct`)
        .send({ rating: 5 });

      expect(res.status).toBe(400);
      expect(reviewServiceMock.correctLastReviewRating).not.toHaveBeenCalled();
      expect(recordRatingCorrectionMetricMock).not.toHaveBeenCalled();
    });

    it('returns 404 when card not found for rating correction', async () => {
      reviewServiceMock.correctLastReviewRating.mockResolvedValueOnce(null);

      const res = await request(app)
        .post(`/api/cards/${mockCardId}/review/correct`)
        .send({ rating: 3 });

      expect(res.status).toBe(404);
      expect(recordRatingCorrectionMetricMock).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: mockUserId,
          statusCode: 404,
          outcome: 'error',
        })
      );
    });

    it('returns 409 when correction conflicts with card state', async () => {
      reviewServiceMock.correctLastReviewRating.mockRejectedValueOnce(
        new ConflictError('Cannot correct: the latest review does not match the card state.')
      );

      const res = await request(app)
        .post(`/api/cards/${mockCardId}/review/correct`)
        .send({ rating: 2 });

      expect(res.status).toBe(409);
      expect(recordRatingCorrectionMetricMock).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: mockUserId,
          statusCode: 409,
          outcome: 'error',
        })
      );
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

    it('returns merged review-day-counts for a deck', async () => {
      deckServiceMock.getDeckById.mockResolvedValueOnce({
        id: mockDeckId,
        user_id: mockUserId,
        title: 'Deck',
      });
      reviewServiceMock.getReviewDayCountsForDeck.mockResolvedValueOnce([
        { day: '2025-01-01', count: 3 },
        { day: '2025-01-02', count: 1 },
      ]);

      const res = await request(app).get(`/api/decks/${mockDeckId}/review-day-counts?days=30`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual({
        days: 30,
        byDay: [
          { day: '2025-01-01', count: 3 },
          { day: '2025-01-02', count: 1 },
        ],
      });
      expect(reviewServiceMock.getReviewDayCountsForDeck).toHaveBeenCalledWith(mockDeckId, mockUserId, { days: 30 });
    });

    it('returns 404 for review-day-counts when deck not found', async () => {
      deckServiceMock.getDeckById.mockResolvedValueOnce(null);

      const res = await request(app).get(`/api/decks/${mockDeckId}/review-day-counts`);

      expect(res.status).toBe(404);
      expect(reviewServiceMock.getReviewDayCountsForDeck).not.toHaveBeenCalled();
    });

    it('returns review logs by card for deck charts', async () => {
      deckServiceMock.getDeckById.mockResolvedValueOnce({
        id: mockDeckId,
        user_id: mockUserId,
        title: 'Deck',
      });
      reviewServiceMock.getReviewLogsByDeckForCharts.mockResolvedValueOnce({
        limitPerCard: 50,
        maxCards: 80,
        cards: [
          {
            cardId: mockCardId,
            recto: 'Q',
            logs: [
              {
                id: 'log-1',
                rating: 3,
                review_time: 1,
                review_date: new Date('2025-01-01'),
                scheduled_days: 1,
                elapsed_days: 0,
                stability_before: null,
                difficulty_before: null,
                retrievability_before: null,
                stability_after: 1,
                difficulty_after: 5,
              },
            ],
          },
        ],
      });

      const res = await request(app).get(
        `/api/decks/${mockDeckId}/review-logs-by-card?limitPerCard=50&maxCards=80`
      );

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.cards).toHaveLength(1);
      expect(res.body.data.cards[0].cardId).toBe(mockCardId);
      expect(reviewServiceMock.getReviewLogsByDeckForCharts).toHaveBeenCalledWith(mockDeckId, mockUserId, {
        limitPerCard: 50,
        maxCards: 80,
      });
    });

    it('returns 404 for review-logs-by-card when deck not found', async () => {
      deckServiceMock.getDeckById.mockResolvedValueOnce(null);

      const res = await request(app).get(`/api/decks/${mockDeckId}/review-logs-by-card`);

      expect(res.status).toBe(404);
      expect(reviewServiceMock.getReviewLogsByDeckForCharts).not.toHaveBeenCalled();
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
      expect(res.body.data).toHaveLength(2);
      expect(res.body.data[0]).toMatchObject(mockCards[0]);
      expect(res.body.data[1]).toMatchObject(mockCards[1]);
      expect(res.body.data[0].category_ids).toEqual([]);
      expect(res.body.data[0].categories).toEqual([]);
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

    it('returns study-stats for a deck (due, new, flagged, critical, highRisk)', async () => {
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
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0]).toMatchObject(mockNewCards[0]);
      expect(res.body.data[0].category_ids).toEqual([]);
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
      expect(res.body.data).toMatchObject(mockCard);
      expect(res.body.data).toHaveProperty('category_ids');
      expect(res.body.data).toHaveProperty('categories');
      expect(cardServiceMock.getCardById).toHaveBeenCalledWith(mockCardId, mockUserId);
    });

    it('returns 404 when card not found', async () => {
      cardServiceMock.getCardById.mockResolvedValueOnce(null);

      const res = await request(app).get(`/api/cards/${mockCardId}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });

  describe('Card links', () => {
    it('POST /api/cards/:id/links links two cards and returns source card', async () => {
      cardServiceMock.insertCardLink.mockResolvedValueOnce(undefined);
      const linkedCard = {
        id: mockCardId,
        deck_id: mockDeckId,
        user_id: mockUserId,
        recto: 'A',
        verso: 'B',
        linked_card_ids: [mockOtherCardId],
      };
      cardServiceMock.getCardById.mockResolvedValueOnce(linkedCard);

      const res = await request(app)
        .post(`/api/cards/${mockCardId}/links`)
        .send({ otherCardId: mockOtherCardId });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.linked_card_ids).toEqual([mockOtherCardId]);
      expect(cardServiceMock.insertCardLink).toHaveBeenCalledWith(mockUserId, mockCardId, mockOtherCardId);
    });

    it('POST /api/cards/:id/links returns 400 when otherCardId equals id', async () => {
      const res = await request(app)
        .post(`/api/cards/${mockCardId}/links`)
        .send({ otherCardId: mockCardId });

      expect(res.status).toBe(400);
      expect(cardServiceMock.insertCardLink).not.toHaveBeenCalled();
    });

    it('DELETE /api/cards/:id/links/:otherCardId removes link and returns card', async () => {
      cardServiceMock.removeCardLink.mockResolvedValueOnce(true);
      const unlinkedCard = {
        id: mockCardId,
        deck_id: mockDeckId,
        user_id: mockUserId,
        recto: 'A',
        verso: 'B',
        linked_card_ids: [] as string[],
      };
      cardServiceMock.getCardById.mockResolvedValueOnce(unlinkedCard);

      const res = await request(app).delete(`/api/cards/${mockCardId}/links/${mockOtherCardId}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.linked_card_ids).toEqual([]);
      expect(cardServiceMock.removeCardLink).toHaveBeenCalledWith(mockUserId, mockCardId, mockOtherCardId);
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

  describe('Card importance, history, and review logs', () => {
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
        totalJourneyEvents: 5,
        byEventType: [{ eventType: 'rating_submitted', count: 3 }],
      });
      reviewServiceMock.getReviewDayCountsForCard.mockResolvedValueOnce([
        { day: '2026-02-16', count: 2 },
      ]);

      const res = await request(app).get(`/api/cards/${mockCardId}/history/summary?days=30`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(cardJourneyServiceMock.getCardHistorySummary).toHaveBeenCalledWith(
        mockUserId,
        mockCardId,
        expect.objectContaining({ days: 30 })
      );
    });

    it('gets card review logs', async () => {
      cardServiceMock.getCardById.mockResolvedValueOnce({
        id: mockCardId,
        deck_id: mockDeckId,
        user_id: mockUserId,
      });
      const mockLogs = [
        {
          id: 'log-1',
          rating: 3,
          review_time: Date.now(),
          review_date: new Date(),
          scheduled_days: 1,
          elapsed_days: 0,
          stability_before: null,
          difficulty_before: null,
          retrievability_before: null,
        },
      ];
      reviewServiceMock.getReviewLogsByCardId.mockResolvedValueOnce(mockLogs);

      const res = await request(app).get(`/api/cards/${mockCardId}/review-logs?limit=50`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].rating).toBe(3);
      expect(reviewServiceMock.getReviewLogsByCardId).toHaveBeenCalledWith(
        mockCardId,
        mockUserId,
        expect.objectContaining({ limit: 50 })
      );
    });

    it('returns 404 when card not found for review-logs', async () => {
      cardServiceMock.getCardById.mockResolvedValueOnce(null);

      const res = await request(app).get(`/api/cards/${mockCardId}/review-logs`);
      expect(res.status).toBe(404);
      expect(reviewServiceMock.getReviewLogsByCardId).not.toHaveBeenCalled();
    });
  });

  describe('Card flag', () => {
    it('creates a card flag with reason and optional note', async () => {
      const mockFlag = {
        id: '33333333-3333-4333-8333-333333333333',
        card_id: mockCardId,
        user_id: mockUserId,
        reason: 'wrong_content',
        note: 'Fix the answer',
        resolved: false,
        created_at: new Date(),
      };
      cardFlagServiceMock.createFlag.mockResolvedValueOnce(mockFlag);

      const res = await request(app)
        .post(`/api/cards/${mockCardId}/flag`)
        .send({
          reason: 'wrong_content',
          note: 'Fix the answer',
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
