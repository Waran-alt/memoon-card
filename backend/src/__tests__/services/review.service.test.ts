import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Card } from '@/types/database';
import { ReviewService } from '@/services/review.service';
import { pool } from '@/config/database';
import * as fsrsModule from '@/services/fsrs.service';
import { FSRS_CONSTANTS, FSRS_V6_DEFAULT_WEIGHTS } from '@/constants/fsrs.constants';
import { STUDY_INTERVAL } from '@/constants/study.constants';

vi.mock('@/config/database', () => ({
  pool: {
    query: vi.fn(),
    connect: vi.fn(),
  },
}));

vi.mock('@/constants/study.constants', () => ({
  STUDY_INTERVAL: { MIN_INTERVAL_MINUTES: 1, MAX_LEARNING_INTERVAL_MINUTES: 120 },
}));

/** Minimal card factory for tests. */
function makeCard(overrides: Partial<Card> = {}): Card {
  const now = new Date();
  return {
    id: '22222222-2222-4222-8222-222222222222',
    deck_id: '33333333-3333-4333-8333-333333333333',
    user_id: '11111111-1111-4111-8111-111111111111',
    recto: 'Q',
    verso: 'A',
    comment: null,
    recto_image: null,
    verso_image: null,
    recto_formula: false,
    verso_formula: false,
    reverse: true,
    stability: null,
    difficulty: null,
    last_review: null,
    next_review: now,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

/** Learning config for Short-FSRS path (min interval 1 min, graduation cap 1 day). */
const defaultLearningConfig = {
  targetRetentionShort: 0.85,
  minIntervalMinutes: STUDY_INTERVAL.MIN_INTERVAL_MINUTES,
  maxIntervalMinutes: 24 * 60,
  graduationCapDays: 1,
  maxAttemptsBeforeGraduate: 7,
  applyToLapses: 'always' as const,
  lapseWithinDays: null as number | null,
  shortFsrsParams: null as Record<string, unknown> | null,
};

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

    expect(reviewSpy).toHaveBeenNthCalledWith(1, 'card-1', userId, 1, undefined);
    expect(reviewSpy).toHaveBeenNthCalledWith(2, 'card-2', userId, 4, undefined);
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

  describe('card state after one or more reviews', () => {
    const capture = {
      updateCardsArgs: null as unknown[] | null,
      insertReviewLogsArgs: null as unknown[] | null,
    };

    beforeEach(() => {
      capture.updateCardsArgs = null;
      capture.insertReviewLogsArgs = null;
      (pool.query as ReturnType<typeof vi.fn>).mockImplementation(async (sql: string, args?: unknown[]) => {
        const s = String(sql);
        if (s.includes('FROM cards') && s.includes('user_id') && s.includes('ANY')) {
          return { rows: [{ id: cardId }] };
        }
        if (s.includes('FROM decks') && s.includes('user_id') && s.includes('ANY')) {
          return { rows: [{ id: '33333333-3333-4333-8333-333333333333' }] };
        }
        if (s.includes('UPDATE cards') && s.includes('SET stability')) {
          capture.updateCardsArgs = args ?? [];
        }
        if (s.includes('INSERT INTO review_logs')) {
          capture.insertReviewLogsArgs = args ?? [];
        }
        if (s.includes('RETURNING id')) {
          return { rows: [{ id: 'log-id' }] };
        }
        return { rows: [], rowCount: 1 };
      });
    });

    it('new card first review (Short-FSRS): sets short_stability_minutes, learning_review_count=1, next_review > last_review', async () => {
      const newCard = makeCard({ stability: null, difficulty: null, last_review: null });
      const serviceAccess = service as unknown as {
        cardService: { getCardById: (id: string, uid: string) => Promise<Card | null> };
        learningConfigService: {
          isShortTermLearningEnabled: (uid: string) => Promise<boolean>;
          getLearningConfig: (uid: string) => Promise<typeof defaultLearningConfig | null>;
        };
      };
      serviceAccess.cardService = { getCardById: vi.fn().mockResolvedValue(newCard) };
      serviceAccess.learningConfigService = {
        isShortTermLearningEnabled: vi.fn().mockResolvedValue(true),
        getLearningConfig: vi.fn().mockResolvedValue(defaultLearningConfig),
      };
      vi.spyOn(service, 'getUserSettings').mockResolvedValue({
        weights: [...FSRS_V6_DEFAULT_WEIGHTS],
        targetRetention: 0.9,
      });

      const result = await service.reviewCard(cardId, userId, 3);

      expect(result).not.toBeNull();
      expect(result?.learningState?.phase).toBe('learning');
      expect(capture.updateCardsArgs).not.toBeNull();
      const [stability, difficulty, lastReview, nextReview, _c5, _c6, shortStabilityMin, learningReviewCount] = capture.updateCardsArgs!;
      expect(stability).toBe(0);
      expect(difficulty).toBe(0);
      expect(shortStabilityMin).toBe(30); // Good => 30 min default
      expect(learningReviewCount).toBe(1);
      const last = new Date(lastReview as Date).getTime();
      const next = new Date(nextReview as Date).getTime();
      expect(next).toBeGreaterThan(last);
      expect(next - last).toBeGreaterThanOrEqual(STUDY_INTERVAL.MIN_INTERVAL_MINUTES * 60 * 1000);
    });

    it('new card first review with rating Again: short_stability_minutes=5, next_review at least 1 min later', async () => {
      const newCard = makeCard({ stability: null, difficulty: null, last_review: null });
      const serviceAccess = service as unknown as {
        cardService: { getCardById: (id: string, uid: string) => Promise<Card | null> };
        learningConfigService: {
          isShortTermLearningEnabled: (uid: string) => Promise<boolean>;
          getLearningConfig: (uid: string) => Promise<typeof defaultLearningConfig | null>;
        };
      };
      serviceAccess.cardService = { getCardById: vi.fn().mockResolvedValue(newCard) };
      serviceAccess.learningConfigService = {
        isShortTermLearningEnabled: vi.fn().mockResolvedValue(true),
        getLearningConfig: vi.fn().mockResolvedValue(defaultLearningConfig),
      };
      vi.spyOn(service, 'getUserSettings').mockResolvedValue({
        weights: [...FSRS_V6_DEFAULT_WEIGHTS],
        targetRetention: 0.9,
      });

      await service.reviewCard(cardId, userId, 1);

      expect(capture.updateCardsArgs).not.toBeNull();
      const [, , lastReview, nextReview, , , shortStabilityMin, learningReviewCount] = capture.updateCardsArgs!;
      expect(shortStabilityMin).toBe(5);
      expect(learningReviewCount).toBe(1);
      const next = new Date(nextReview as Date).getTime();
      const last = new Date(lastReview as Date).getTime();
      expect(next - last).toBeGreaterThanOrEqual(STUDY_INTERVAL.MIN_INTERVAL_MINUTES * 60 * 1000);
    });

    it('learning card second review: short_stability_minutes and learning_review_count increase, next_review advances', async () => {
      const now = new Date();
      const learningCard = makeCard({
        stability: 0,
        difficulty: 0,
        last_review: new Date(now.getTime() - 10 * 60 * 1000),
        next_review: now,
        short_stability_minutes: 30,
        learning_review_count: 1,
      });
      const serviceAccess = service as unknown as {
        cardService: { getCardById: (id: string, uid: string) => Promise<Card | null> };
        learningConfigService: {
          isShortTermLearningEnabled: (uid: string) => Promise<boolean>;
          getLearningConfig: (uid: string) => Promise<typeof defaultLearningConfig | null>;
        };
      };
      serviceAccess.cardService = { getCardById: vi.fn().mockResolvedValue(learningCard) };
      serviceAccess.learningConfigService = {
        isShortTermLearningEnabled: vi.fn().mockResolvedValue(true),
        getLearningConfig: vi.fn().mockResolvedValue(defaultLearningConfig),
      };
      vi.spyOn(service, 'getUserSettings').mockResolvedValue({
        weights: [...FSRS_V6_DEFAULT_WEIGHTS],
        targetRetention: 0.9,
      });

      const result = await service.reviewCard(cardId, userId, 3);

      expect(result).not.toBeNull();
      expect(capture.updateCardsArgs).not.toBeNull();
      const [stability, difficulty, lastReview, nextReview, , , shortStabilityMin, learningReviewCount] = capture.updateCardsArgs!;
      expect(learningReviewCount).toBe(2);
      expect(shortStabilityMin).toBeGreaterThan(30);
      const last = new Date(lastReview as Date).getTime();
      const next = new Date(nextReview as Date).getTime();
      expect(next).toBeGreaterThan(last);
      expect(next - last).toBeGreaterThanOrEqual(STUDY_INTERVAL.MIN_INTERVAL_MINUTES * 60 * 1000);
      expect(typeof stability).toBe('number');
      expect(typeof difficulty).toBe('number');
    });

    it('graduated card (FSRS path): next_review in future, no short_stability_minutes', async () => {
      const past = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
      const graduatedCard = makeCard({
        stability: 2.5,
        difficulty: 5,
        last_review: past,
        next_review: new Date(Date.now() + 24 * 60 * 60 * 1000),
        short_stability_minutes: null,
        learning_review_count: null,
      });
      const nextReviewDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
      const mockedReview = {
        state: {
          stability: 3,
          difficulty: 4.8,
          lastReview: new Date(),
          nextReview: nextReviewDate,
        },
        interval: 5,
        retrievability: 0.85,
      };

      const serviceAccess = service as unknown as {
        cardService: { getCardById: (id: string, uid: string) => Promise<Card | null> };
      };
      serviceAccess.cardService = { getCardById: vi.fn().mockResolvedValue(graduatedCard) };
      (service as unknown as { learningConfigService: { isShortTermLearningEnabled: () => Promise<boolean> } }).learningConfigService = {
        isShortTermLearningEnabled: vi.fn().mockResolvedValue(false),
      };
      vi.spyOn(service, 'getUserSettings').mockResolvedValue({
        weights: [...FSRS_V6_DEFAULT_WEIGHTS],
        targetRetention: 0.9,
      });
      vi.spyOn(fsrsModule, 'createFSRS').mockReturnValue({
        reviewCard: vi.fn().mockReturnValue(mockedReview),
        calculateRetrievability: vi.fn().mockReturnValue(0.9),
      } as unknown as ReturnType<typeof fsrsModule.createFSRS>);

      await service.reviewCard(cardId, userId, 4);

      expect(capture.updateCardsArgs).not.toBeNull();
      // FSRS path UPDATE has 8 params: stability, difficulty, last_review, next_review, critical_before, high_risk_before, id, user_id
      expect(capture.updateCardsArgs!.length).toBe(8);
      const [stability, difficulty, lastReview, nextReview] = capture.updateCardsArgs!;
      expect(stability).toBe(3);
      expect(difficulty).toBe(4.8);
      const next = new Date(nextReview as Date).getTime();
      const last = new Date(lastReview as Date).getTime();
      expect(next).toBeGreaterThan(last);
      expect(next - last).toBeGreaterThanOrEqual(STUDY_INTERVAL.MIN_INTERVAL_MINUTES * 60 * 1000);
    });

    it('ensureNextReviewInFuture: when FSRS returns next_review in the past, card gets next_review at least 1 min after last_review', async () => {
      const now = new Date();
      const card = makeCard({
        stability: 1,
        difficulty: 5,
        last_review: new Date(now.getTime() - 86400000),
        next_review: now,
      });
      const sameAsLast = new Date(now.getTime());
      const mockedReview = {
        state: {
          stability: 0.5,
          difficulty: 5.2,
          lastReview: now,
          nextReview: sameAsLast,
        },
        interval: 0,
        retrievability: 0.5,
      };

      const serviceAccess = service as unknown as { cardService: { getCardById: (id: string, uid: string) => Promise<Card | null> } };
      serviceAccess.cardService = { getCardById: vi.fn().mockResolvedValue(card) };
      (service as unknown as { learningConfigService: { isShortTermLearningEnabled: () => Promise<boolean> } }).learningConfigService = {
        isShortTermLearningEnabled: vi.fn().mockResolvedValue(false),
      };
      vi.spyOn(service, 'getUserSettings').mockResolvedValue({
        weights: [...FSRS_V6_DEFAULT_WEIGHTS],
        targetRetention: 0.9,
      });
      vi.spyOn(fsrsModule, 'createFSRS').mockReturnValue({
        reviewCard: vi.fn().mockReturnValue(mockedReview),
        calculateRetrievability: vi.fn().mockReturnValue(0.9),
      } as unknown as ReturnType<typeof fsrsModule.createFSRS>);

      await service.reviewCard(cardId, userId, 1);

      expect(capture.updateCardsArgs).not.toBeNull();
      const [, , lastReview, nextReview] = capture.updateCardsArgs!;
      const last = new Date(lastReview as Date).getTime();
      const next = new Date(nextReview as Date).getTime();
      expect(next - last).toBeGreaterThanOrEqual(STUDY_INTERVAL.MIN_INTERVAL_MINUTES * 60 * 1000);
    });

    it('review_logs: scheduled_days is stored and positive after learning review', async () => {
      const newCard = makeCard({ stability: null, difficulty: null, last_review: null });
      const serviceAccess = service as unknown as {
        cardService: { getCardById: (id: string, uid: string) => Promise<Card | null> };
        learningConfigService: {
          isShortTermLearningEnabled: (uid: string) => Promise<boolean>;
          getLearningConfig: (uid: string) => Promise<typeof defaultLearningConfig | null>;
        };
      };
      serviceAccess.cardService = { getCardById: vi.fn().mockResolvedValue(newCard) };
      serviceAccess.learningConfigService = {
        isShortTermLearningEnabled: vi.fn().mockResolvedValue(true),
        getLearningConfig: vi.fn().mockResolvedValue(defaultLearningConfig),
      };
      vi.spyOn(service, 'getUserSettings').mockResolvedValue({
        weights: [...FSRS_V6_DEFAULT_WEIGHTS],
        targetRetention: 0.9,
      });

      await service.reviewCard(cardId, userId, 4);

      expect(capture.insertReviewLogsArgs).not.toBeNull();
      const args = capture.insertReviewLogsArgs!;
      const scheduledDays = args[9] as number;
      expect(typeof scheduledDays).toBe('number');
      expect(scheduledDays).toBeGreaterThan(0);
      expect(args[0]).toBe(cardId);
      expect(args[1]).toBe(userId);
      expect(args[2]).toBe(4);
    });

    it('review_logs: scheduled_days is fractional for learning (minutes as days)', async () => {
      const newCard = makeCard({ stability: null, difficulty: null, last_review: null });
      const serviceAccess = service as unknown as {
        cardService: { getCardById: (id: string, uid: string) => Promise<Card | null> };
        learningConfigService: {
          isShortTermLearningEnabled: (uid: string) => Promise<boolean>;
          getLearningConfig: (uid: string) => Promise<typeof defaultLearningConfig | null>;
        };
      };
      serviceAccess.cardService = { getCardById: vi.fn().mockResolvedValue(newCard) };
      serviceAccess.learningConfigService = {
        isShortTermLearningEnabled: vi.fn().mockResolvedValue(true),
        getLearningConfig: vi.fn().mockResolvedValue(defaultLearningConfig),
      };
      vi.spyOn(service, 'getUserSettings').mockResolvedValue({
        weights: [...FSRS_V6_DEFAULT_WEIGHTS],
        targetRetention: 0.9,
      });

      await service.reviewCard(cardId, userId, 3);

      expect(capture.insertReviewLogsArgs).not.toBeNull();
      const scheduledDays = capture.insertReviewLogsArgs![9] as number;
      expect(scheduledDays).toBeLessThan(1);
      expect(scheduledDays).toBeGreaterThan(0);
    });

    it('multiple reviews in sequence: each review advances next_review and updates state', async () => {
      const serviceAccess = service as unknown as {
        cardService: { getCardById: (id: string, uid: string) => Promise<Card | null> };
        learningConfigService: {
          isShortTermLearningEnabled: (uid: string) => Promise<boolean>;
          getLearningConfig: (uid: string) => Promise<typeof defaultLearningConfig | null>;
        };
      };
      serviceAccess.learningConfigService = {
        isShortTermLearningEnabled: vi.fn().mockResolvedValue(true),
        getLearningConfig: vi.fn().mockResolvedValue(defaultLearningConfig),
      };
      vi.spyOn(service, 'getUserSettings').mockResolvedValue({
        weights: [...FSRS_V6_DEFAULT_WEIGHTS],
        targetRetention: 0.9,
      });

      let card = makeCard({ stability: null, difficulty: null, last_review: null });
      serviceAccess.cardService = { getCardById: vi.fn().mockImplementation(() => Promise.resolve(card)) };

      await service.reviewCard(cardId, userId, 3);
      expect(capture.updateCardsArgs).not.toBeNull();
      const firstNext = new Date(capture.updateCardsArgs![3] as Date).getTime();
      const firstLast = new Date(capture.updateCardsArgs![2] as Date).getTime();
      expect(firstNext).toBeGreaterThan(firstLast);

      card = makeCard({
        stability: 0,
        difficulty: 0,
        last_review: new Date(capture.updateCardsArgs![2] as Date),
        next_review: new Date(capture.updateCardsArgs![3] as Date),
        short_stability_minutes: capture.updateCardsArgs![6] as number,
        learning_review_count: 1,
      });
      capture.updateCardsArgs = null;

      await service.reviewCard(cardId, userId, 3);
      expect(capture.updateCardsArgs).not.toBeNull();
      const secondNext = new Date(capture.updateCardsArgs![3] as Date).getTime();
      const secondLast = new Date(capture.updateCardsArgs![2] as Date).getTime();
      expect(secondNext).toBeGreaterThan(secondLast);
      expect(capture.updateCardsArgs![7]).toBe(2);
    });

    it('review_logs: stability_before and stability_after are stored and never NaN', async () => {
      const newCard = makeCard({ stability: null, difficulty: null, last_review: null });
      const serviceAccess = service as unknown as {
        cardService: { getCardById: (id: string, uid: string) => Promise<Card | null> };
        learningConfigService: {
          isShortTermLearningEnabled: (uid: string) => Promise<boolean>;
          getLearningConfig: (uid: string) => Promise<typeof defaultLearningConfig | null>;
        };
      };
      serviceAccess.cardService = { getCardById: vi.fn().mockResolvedValue(newCard) };
      serviceAccess.learningConfigService = {
        isShortTermLearningEnabled: vi.fn().mockResolvedValue(true),
        getLearningConfig: vi.fn().mockResolvedValue(defaultLearningConfig),
      };
      vi.spyOn(service, 'getUserSettings').mockResolvedValue({
        weights: [...FSRS_V6_DEFAULT_WEIGHTS],
        targetRetention: 0.9,
      });

      await service.reviewCard(cardId, userId, 3);

      expect(capture.insertReviewLogsArgs).not.toBeNull();
      const args = capture.insertReviewLogsArgs!;
      const stabilityBefore = args[12] as number | null;
      const difficultyBefore = args[13] as number | null;
      const stabilityAfter = args[15] as number | null;
      const difficultyAfter = args[16] as number | null;
      expect(Number.isNaN(stabilityBefore)).toBe(false);
      expect(Number.isNaN(difficultyBefore)).toBe(false);
      expect(Number.isNaN(stabilityAfter)).toBe(false);
      expect(Number.isNaN(difficultyAfter)).toBe(false);
    });

    it('new card first review with rating Hard (2): short_stability_minutes=15', async () => {
      const newCard = makeCard({ stability: null, difficulty: null, last_review: null });
      const serviceAccess = service as unknown as {
        cardService: { getCardById: (id: string, uid: string) => Promise<Card | null> };
        learningConfigService: {
          isShortTermLearningEnabled: (uid: string) => Promise<boolean>;
          getLearningConfig: (uid: string) => Promise<typeof defaultLearningConfig | null>;
        };
      };
      serviceAccess.cardService = { getCardById: vi.fn().mockResolvedValue(newCard) };
      serviceAccess.learningConfigService = {
        isShortTermLearningEnabled: vi.fn().mockResolvedValue(true),
        getLearningConfig: vi.fn().mockResolvedValue(defaultLearningConfig),
      };
      vi.spyOn(service, 'getUserSettings').mockResolvedValue({
        weights: [...FSRS_V6_DEFAULT_WEIGHTS],
        targetRetention: 0.9,
      });

      await service.reviewCard(cardId, userId, 2);

      expect(capture.updateCardsArgs).not.toBeNull();
      expect(capture.updateCardsArgs![6]).toBe(15);
    });

    it('Short-FSRS disabled: new card uses FSRS path and UPDATE has 8 params', async () => {
      const newCard = makeCard({ stability: null, difficulty: null, last_review: null });
      const nextReviewDate = new Date(Date.now() + 1 * 24 * 60 * 60 * 1000);
      const mockedReview = {
        state: {
          stability: 0.4,
          difficulty: 5,
          lastReview: new Date(),
          nextReview: nextReviewDate,
        },
        interval: 0.1,
        retrievability: 0.9,
      };

      const serviceAccess = service as unknown as { cardService: { getCardById: (id: string, uid: string) => Promise<Card | null> } };
      serviceAccess.cardService = { getCardById: vi.fn().mockResolvedValue(newCard) };
      (service as unknown as { learningConfigService: { isShortTermLearningEnabled: () => Promise<boolean> } }).learningConfigService = {
        isShortTermLearningEnabled: vi.fn().mockResolvedValue(false),
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

      expect(result?.learningState).toBeUndefined();
      expect(capture.updateCardsArgs).not.toBeNull();
      expect(capture.updateCardsArgs!.length).toBe(8);
      const [stability, , lastReview, nextReview] = capture.updateCardsArgs!;
      expect(stability).toBe(0.4);
      const next = new Date(nextReview as Date).getTime();
      const last = new Date(lastReview as Date).getTime();
      expect(next - last).toBeGreaterThanOrEqual(STUDY_INTERVAL.MIN_INTERVAL_MINUTES * 60 * 1000);
    });
  });
});
