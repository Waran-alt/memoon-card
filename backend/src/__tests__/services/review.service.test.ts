import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Card } from '@/types/database';
import { ReviewService } from '@/services/review.service';
import { pool } from '@/config/database';
import * as fsrsModule from '@/services/fsrs.service';
import { FSRS_CONSTANTS, FSRS_V6_DEFAULT_WEIGHTS } from '@/constants/fsrs.constants';

vi.mock('@/config/database', () => ({
  pool: {
    query: vi.fn(),
    connect: vi.fn(),
  },
}));

describe('ReviewService', () => {
  const userId = '11111111-1111-4111-8111-111111111111';
  const cardId = '22222222-2222-4222-8222-222222222222';
  let service: ReviewService;

  beforeEach(() => {
    service = new ReviewService();
    vi.clearAllMocks();
    (pool.query as ReturnType<typeof vi.fn>).mockImplementation(async (query: unknown) => {
      const sql = String(query);
      if (/\bfrom\s+cards\b/i.test(sql)) {
        return { rows: [{ id: cardId }] };
      }
      if (/\bfrom\s+decks\b/i.test(sql)) {
        return { rows: [{ id: '33333333-3333-4333-8333-333333333333' }] };
      }
      return { rows: [], rowCount: 1 };
    });
    (pool.connect as ReturnType<typeof vi.fn>).mockResolvedValue({
      query: pool.query,
      release: vi.fn(),
    });
  });

  it('returns default settings when user settings do not exist', async () => {
    (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ rows: [] });

    const result = await service.getUserSettings(userId);

    expect(result.targetRetention).toBe(FSRS_CONSTANTS.DEFAULT_TARGET_RETENTION);
    expect(result.weights).toEqual(FSRS_V6_DEFAULT_WEIGHTS);
  });

  it('pads weights to 21 when user has fewer weights', async () => {
    (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      rows: [
        {
          fsrs_weights: [1, 2, 3],
          target_retention: 0.92,
        },
      ],
    });

    const result = await service.getUserSettings(userId);

    expect(result.targetRetention).toBe(0.92);
    expect(result.weights).toHaveLength(21);
    expect(result.weights.slice(0, 3)).toEqual([1, 2, 3]);
    expect(result.weights[20]).toBe(1);
  });

  it('falls back to default target retention when stored value is null', async () => {
    (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      rows: [
        {
          fsrs_weights: [1, 2, 3],
          target_retention: null,
        },
      ],
    });

    const result = await service.getUserSettings(userId);

    expect(result.targetRetention).toBe(FSRS_CONSTANTS.DEFAULT_TARGET_RETENTION);
    expect(result.weights).toHaveLength(21);
  });

  it('returns null when card is not found', async () => {
    const serviceAccess = service as unknown as {
      cardService: { getCardById: (cardId: string, userId: string) => Promise<Card | null> };
    };
    serviceAccess.cardService = {
      getCardById: vi.fn().mockResolvedValue(null),
    };

    const result = await service.reviewCard(cardId, userId, 3);
    expect(result).toBeNull();
  });

  it('reviews card, updates state, and logs review', async () => {
    const card: Card = {
      id: cardId,
      deck_id: '33333333-3333-4333-8333-333333333333',
      user_id: userId,
      recto: 'Q',
      verso: 'A',
      comment: null,
      recto_image: null,
      verso_image: null,
      recto_formula: false,
      verso_formula: false,
      reverse: true,
      stability: 2,
      difficulty: 5,
      last_review: new Date(Date.now() - 86400000),
      next_review: new Date(),
      created_at: new Date(),
      updated_at: new Date(),
    };
    const mockedReview = {
      state: {
        stability: 3,
        difficulty: 4.5,
        lastReview: new Date(),
        nextReview: new Date(Date.now() + 86400000),
      },
      interval: 3,
      retrievability: 0.8,
    };

    const serviceAccess = service as unknown as {
      cardService: {
        getCardById: (cardId: string, userId: string) => Promise<Card | null>;
        updateCardState: (cardId: string, userId: string, state: unknown) => Promise<void>;
      };
    };
    serviceAccess.cardService = {
      getCardById: vi.fn().mockResolvedValue(card),
      updateCardState: vi.fn().mockResolvedValue(undefined),
    };
    vi.spyOn(service, 'getUserSettings').mockResolvedValue({
      weights: [...FSRS_V6_DEFAULT_WEIGHTS],
      targetRetention: 0.9,
    });
    vi.spyOn(fsrsModule, 'createFSRS').mockReturnValue({
      reviewCard: vi.fn().mockReturnValue(mockedReview),
      calculateRetrievability: vi.fn().mockReturnValue(0.9),
    } as unknown as ReturnType<typeof fsrsModule.createFSRS>);

    const result = await service.reviewCard(cardId, userId, 3);

    expect(result).toEqual(mockedReview);
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE cards'),
      expect.arrayContaining([cardId, userId])
    );
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO review_logs'),
      expect.arrayContaining([cardId, userId, 3, expect.any(Number)])
    );
  });

  it('batchReview processes all cards and preserves order', async () => {
    const reviewSpy = vi
      .spyOn(service, 'reviewCard')
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        state: {
          stability: 2,
          difficulty: 4,
          lastReview: new Date(),
          nextReview: new Date(),
        },
        interval: 2,
        retrievability: 0.7,
        message: 'ok',
      });

    const result = await service.batchReview(
      [
        { cardId: 'card-1', rating: 1 },
        { cardId: 'card-2', rating: 4 },
      ],
      userId
    );

    expect(reviewSpy).toHaveBeenNthCalledWith(1, 'card-1', userId, 1);
    expect(reviewSpy).toHaveBeenNthCalledWith(2, 'card-2', userId, 4);
    expect(result).toHaveLength(2);
    expect(result[0].cardId).toBe('card-1');
    expect(result[1].cardId).toBe('card-2');
  });

  describe('getReviewLogsByCardId', () => {
    it('returns review logs for a card', async () => {
      const reviewTime = Date.now();
      (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        rows: [
          {
            id: 'log-id-1',
            rating: 3,
            review_time: reviewTime,
            review_date: new Date(reviewTime),
            scheduled_days: 1,
            elapsed_days: 0,
            stability_before: 0.5,
            difficulty_before: 5,
            retrievability_before: 0.9,
            stability_after: 1.2,
            difficulty_after: 4.8,
          },
        ],
      });

      const result = await service.getReviewLogsByCardId(cardId, userId, { limit: 50 });

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: 'log-id-1',
        rating: 3,
        review_time: reviewTime,
        scheduled_days: 1,
        elapsed_days: 0,
        stability_before: 0.5,
        difficulty_before: 5,
        retrievability_before: 0.9,
        stability_after: 1.2,
        difficulty_after: 4.8,
      });
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('review_logs'),
        [cardId, userId, 50]
      );
    });

    it('returns empty array when no logs', async () => {
      (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ rows: [] });

      const result = await service.getReviewLogsByCardId(cardId, userId);

      expect(result).toEqual([]);
    });
  });
});
