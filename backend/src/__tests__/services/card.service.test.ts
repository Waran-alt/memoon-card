/**
 * Tests for CardService
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CardService } from '@/services/card.service';
import { Card, CreateCardRequest } from '@/types/database';
import { pool } from '@/config/database';
import { createMockQueryResult } from '@/__tests__/utils/test-helpers';
import { FSRSState } from '@/services/fsrs.service';

// Mock database pool
vi.mock('@/config/database', () => ({
  pool: {
    query: vi.fn(),
  },
}));

// Mock sanitize
vi.mock('@/utils/sanitize', () => ({
  sanitizeHtml: vi.fn((input: string) => input), // Return as-is for tests
}));

describe('CardService', () => {
  let cardService: CardService;
  const mockUserId = 'user-123';
  const mockDeckId = 'deck-123';
  const mockCardId = 'card-123';

  beforeEach(() => {
    cardService = new CardService();
    vi.clearAllMocks();
  });

  describe('getCardsByDeckId', () => {
    it('should return all cards in a deck', async () => {
      const mockCards: Card[] = [
        {
          id: mockCardId,
          deck_id: mockDeckId,
          user_id: mockUserId,
          recto: 'Question',
          verso: 'Answer',
          comment: null,
          recto_image: null,
          verso_image: null,
          recto_formula: false,
          verso_formula: false,
          reverse: true,
          stability: 0,
          difficulty: 0.3,
          last_review: null,
          next_review: new Date(),
          created_at: new Date(),
          updated_at: new Date(),
        },
      ];

      (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce(createMockQueryResult(mockCards));

      const result = await cardService.getCardsByDeckId(mockDeckId, mockUserId);

      expect(result).toEqual(mockCards);
      expect(pool.query).toHaveBeenCalledWith(
        'SELECT * FROM cards WHERE deck_id = $1 AND user_id = $2 AND deleted_at IS NULL ORDER BY created_at DESC',
        [mockDeckId, mockUserId]
      );
    });
  });

  describe('getCardById', () => {
    it('should return card if found', async () => {
      const mockCard: Card = {
        id: mockCardId,
        deck_id: mockDeckId,
        user_id: mockUserId,
        recto: 'Question',
        verso: 'Answer',
        comment: null,
        recto_image: null,
        verso_image: null,
        recto_formula: false,
        verso_formula: false,
        reverse: true,
        stability: 0,
        difficulty: 0.3,
        last_review: null,
        next_review: new Date(),
        created_at: new Date(),
        updated_at: new Date(),
      };

      (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce(createMockQueryResult([mockCard]));

      const result = await cardService.getCardById(mockCardId, mockUserId);

      expect(result).toEqual(mockCard);
    });

    it('should return null if card not found', async () => {
      (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce(createMockQueryResult([]));

      const result = await cardService.getCardById(mockCardId, mockUserId);

      expect(result).toBeNull();
    });
  });

  describe('createCard', () => {
    it('should create a new card', async () => {
      const createData: CreateCardRequest = {
        recto: 'Question',
        verso: 'Answer',
        comment: 'Note',
      };

      const mockCard: Card = {
        id: mockCardId,
        deck_id: mockDeckId,
        user_id: mockUserId,
        recto: createData.recto,
        verso: createData.verso,
        comment: createData.comment ?? null,
        recto_image: null,
        verso_image: null,
        recto_formula: false,
        verso_formula: false,
        reverse: true,
        stability: 0,
        difficulty: 0.3,
        last_review: null,
        next_review: new Date(),
        created_at: new Date(),
        updated_at: new Date(),
      };

      (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce(createMockQueryResult([mockCard]));

      const result = await cardService.createCard(mockDeckId, mockUserId, createData);

      expect(result).toEqual(mockCard);
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO cards'),
        expect.arrayContaining([mockUserId, mockDeckId, createData.recto, createData.verso])
      );
    });
  });

  describe('updateCard', () => {
    it('should update an existing card', async () => {
      const updateData: CreateCardRequest = {
        recto: 'Updated Question',
        verso: 'Updated Answer',
      };

      const mockCard: Card = {
        id: mockCardId,
        deck_id: mockDeckId,
        user_id: mockUserId,
        recto: updateData.recto,
        verso: updateData.verso,
        comment: null,
        recto_image: null,
        verso_image: null,
        recto_formula: false,
        verso_formula: false,
        reverse: true,
        stability: 0,
        difficulty: 0.3,
        last_review: null,
        next_review: new Date(),
        created_at: new Date(),
        updated_at: new Date(),
      };

      (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce(createMockQueryResult([mockCard]));

      const result = await cardService.updateCard(mockCardId, mockUserId, updateData);

      expect(result).toEqual(mockCard);
    });
  });

  describe('deleteCard', () => {
    it('should soft-delete a card (set deleted_at)', async () => {
      (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce(createMockQueryResult([]));

      await cardService.deleteCard(mockCardId, mockUserId);

      expect(pool.query).toHaveBeenCalledWith(
        'UPDATE cards SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL',
        [mockCardId, mockUserId]
      );
    });
  });

  describe('updateCard - partial updates', () => {
    it('should update only recto when only recto is provided', async () => {
      const updateData = { recto: 'Updated Question' };
      const mockCard: Card = {
        id: mockCardId,
        deck_id: mockDeckId,
        user_id: mockUserId,
        recto: updateData.recto,
        verso: 'Original Answer',
        comment: null,
        recto_image: null,
        verso_image: null,
        recto_formula: false,
        verso_formula: false,
        reverse: true,
        stability: 0,
        difficulty: 0.3,
        last_review: null,
        next_review: new Date(),
        created_at: new Date(),
        updated_at: new Date(),
      };

      (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce(createMockQueryResult([mockCard]));

      const result = await cardService.updateCard(mockCardId, mockUserId, updateData);

      expect(result).toEqual(mockCard);
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE cards'),
        expect.arrayContaining([updateData.recto, mockCardId, mockUserId])
      );
    });

    it('should update only verso when only verso is provided', async () => {
      const updateData = { verso: 'Updated Answer' };
      const mockCard: Card = {
        id: mockCardId,
        deck_id: mockDeckId,
        user_id: mockUserId,
        recto: 'Original Question',
        verso: updateData.verso,
        comment: null,
        recto_image: null,
        verso_image: null,
        recto_formula: false,
        verso_formula: false,
        reverse: true,
        stability: 0,
        difficulty: 0.3,
        last_review: null,
        next_review: new Date(),
        created_at: new Date(),
        updated_at: new Date(),
      };

      (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce(createMockQueryResult([mockCard]));

      const result = await cardService.updateCard(mockCardId, mockUserId, updateData);

      expect(result).toEqual(mockCard);
    });

    it('should update comment when provided', async () => {
      const updateData = { comment: 'Updated comment' };
      const mockCard: Card = {
        id: mockCardId,
        deck_id: mockDeckId,
        user_id: mockUserId,
        recto: 'Question',
        verso: 'Answer',
        comment: updateData.comment,
        recto_image: null,
        verso_image: null,
        recto_formula: false,
        verso_formula: false,
        reverse: true,
        stability: 0,
        difficulty: 0.3,
        last_review: null,
        next_review: new Date(),
        created_at: new Date(),
        updated_at: new Date(),
      };

      (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce(createMockQueryResult([mockCard]));

      const result = await cardService.updateCard(mockCardId, mockUserId, updateData);

      expect(result).toEqual(mockCard);
    });

    it('should update multiple fields at once', async () => {
      const updateData = {
        recto: 'New Question',
        verso: 'New Answer',
        comment: 'New comment',
        recto_image: 'image.jpg',
      };
      const mockCard: Card = {
        id: mockCardId,
        deck_id: mockDeckId,
        user_id: mockUserId,
        recto: updateData.recto,
        verso: updateData.verso,
        comment: updateData.comment,
        recto_image: updateData.recto_image,
        verso_image: null,
        recto_formula: false,
        verso_formula: false,
        reverse: true,
        stability: 0,
        difficulty: 0.3,
        last_review: null,
        next_review: new Date(),
        created_at: new Date(),
        updated_at: new Date(),
      };

      (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce(createMockQueryResult([mockCard]));

      const result = await cardService.updateCard(mockCardId, mockUserId, updateData);

      expect(result).toEqual(mockCard);
    });

    it('should return null when card not found', async () => {
      (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce(createMockQueryResult([]));

      const result = await cardService.updateCard(mockCardId, mockUserId, { recto: 'Updated' });

      expect(result).toBeNull();
    });

    it('should sanitize HTML in all text fields', async () => {
      const updateData = {
        recto: '<script>alert("xss")</script>Safe text',
        verso: '<img src=x onerror=alert(1)>Safe answer',
        comment: '<div>Safe comment</div>',
      };
      const { sanitizeHtml } = await import('@/utils/sanitize');
      const mockCard: Card = {
        id: mockCardId,
        deck_id: mockDeckId,
        user_id: mockUserId,
        recto: sanitizeHtml(updateData.recto),
        verso: sanitizeHtml(updateData.verso),
        comment: sanitizeHtml(updateData.comment),
        recto_image: null,
        verso_image: null,
        recto_formula: false,
        verso_formula: false,
        reverse: true,
        stability: 0,
        difficulty: 0.3,
        last_review: null,
        next_review: new Date(),
        created_at: new Date(),
        updated_at: new Date(),
      };

      (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce(createMockQueryResult([mockCard]));

      await cardService.updateCard(mockCardId, mockUserId, updateData);

      expect(sanitizeHtml).toHaveBeenCalledWith(updateData.recto);
      expect(sanitizeHtml).toHaveBeenCalledWith(updateData.verso);
      expect(sanitizeHtml).toHaveBeenCalledWith(updateData.comment);
    });
  });

  describe('getDueCount', () => {
    it('should return count of due cards', async () => {
      (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        createMockQueryResult([{ count: '7' }])
      );

      const result = await cardService.getDueCount(mockDeckId, mockUserId);

      expect(result).toBe(7);
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('COUNT(*)'),
        [mockDeckId, mockUserId]
      );
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('next_review <= CURRENT_TIMESTAMP'),
        [mockDeckId, mockUserId]
      );
    });

    it('should return 0 when no rows', async () => {
      (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        createMockQueryResult([{ count: '0' }])
      );

      const result = await cardService.getDueCount(mockDeckId, mockUserId);

      expect(result).toBe(0);
    });
  });

  describe('getNewCount', () => {
    it('should return count of new cards', async () => {
      (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        createMockQueryResult([{ count: '3' }])
      );

      const result = await cardService.getNewCount(mockDeckId, mockUserId);

      expect(result).toBe(3);
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('COUNT(*)'),
        [mockDeckId, mockUserId]
      );
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('stability IS NULL'),
        [mockDeckId, mockUserId]
      );
    });

    it('should return 0 when no rows', async () => {
      (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        createMockQueryResult([{ count: '0' }])
      );

      const result = await cardService.getNewCount(mockDeckId, mockUserId);

      expect(result).toBe(0);
    });
  });

  describe('getDueCards', () => {
    it('should return cards that are due for review', async () => {
      const dueDate = new Date(Date.now() - 1000); // Past date
      const mockCards: Card[] = [
        {
          id: 'card-1',
          deck_id: mockDeckId,
          user_id: mockUserId,
          recto: 'Question 1',
          verso: 'Answer 1',
          comment: null,
          recto_image: null,
          verso_image: null,
          recto_formula: false,
          verso_formula: false,
          reverse: true,
          stability: 5,
          difficulty: 4,
          last_review: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
          next_review: dueDate,
          created_at: new Date(),
          updated_at: new Date(),
        },
        {
          id: 'card-2',
          deck_id: mockDeckId,
          user_id: mockUserId,
          recto: 'Question 2',
          verso: 'Answer 2',
          comment: null,
          recto_image: null,
          verso_image: null,
          recto_formula: false,
          verso_formula: false,
          reverse: true,
          stability: 3,
          difficulty: 5,
          last_review: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
          next_review: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
          created_at: new Date(),
          updated_at: new Date(),
        },
      ];

      (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce(createMockQueryResult(mockCards));

      const result = await cardService.getDueCards(mockDeckId, mockUserId);

      expect(result).toEqual(mockCards);
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('deleted_at IS NULL'),
        [mockDeckId, mockUserId]
      );
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('next_review <= CURRENT_TIMESTAMP'),
        [mockDeckId, mockUserId]
      );
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY next_review ASC'),
        [mockDeckId, mockUserId]
      );
    });

    it('should return empty array when no cards are due', async () => {
      (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce(createMockQueryResult([]));

      const result = await cardService.getDueCards(mockDeckId, mockUserId);

      expect(result).toEqual([]);
    });
  });

  describe('getNewCards', () => {
    it('should return new cards (stability is NULL) ordered by created_at', async () => {
      const mockCards: Card[] = [
        {
          id: 'card-1',
          deck_id: mockDeckId,
          user_id: mockUserId,
          recto: 'New Question 1',
          verso: 'New Answer 1',
          comment: null,
          recto_image: null,
          verso_image: null,
          recto_formula: false,
          verso_formula: false,
          reverse: true,
          stability: null,
          difficulty: null,
          last_review: null,
          next_review: new Date(),
          created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
          updated_at: new Date(),
        },
        {
          id: 'card-2',
          deck_id: mockDeckId,
          user_id: mockUserId,
          recto: 'New Question 2',
          verso: 'New Answer 2',
          comment: null,
          recto_image: null,
          verso_image: null,
          recto_formula: false,
          verso_formula: false,
          reverse: true,
          stability: null,
          difficulty: null,
          last_review: null,
          next_review: new Date(),
          created_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
          updated_at: new Date(),
        },
      ];

      (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce(createMockQueryResult(mockCards));

      const result = await cardService.getNewCards(mockDeckId, mockUserId, 20);

      expect(result).toEqual(mockCards);
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('deleted_at IS NULL'),
        [mockDeckId, mockUserId, 20]
      );
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('stability IS NULL'),
        [mockDeckId, mockUserId, 20]
      );
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY created_at ASC'),
        [mockDeckId, mockUserId, 20]
      );
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT'),
        [mockDeckId, mockUserId, 20]
      );
    });

    it('should use default limit of 20 when limit not provided', async () => {
      (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce(createMockQueryResult([]));

      await cardService.getNewCards(mockDeckId, mockUserId);

      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT'),
        [mockDeckId, mockUserId, 20]
      );
    });

    it('should respect custom limit', async () => {
      (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce(createMockQueryResult([]));

      await cardService.getNewCards(mockDeckId, mockUserId, 50);

      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT'),
        [mockDeckId, mockUserId, 50]
      );
    });
  });

  describe('getCriticalCount', () => {
    it('returns count of due cards with critical_before <= now', async () => {
      (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce(createMockQueryResult([{ count: '2' }]));

      const result = await cardService.getCriticalCount(mockDeckId, mockUserId);

      expect(result).toBe(2);
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('critical_before'),
        [mockDeckId, mockUserId]
      );
    });
  });

  describe('getHighRiskCount', () => {
    it('returns count of due cards with high_risk_before <= now', async () => {
      (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce(createMockQueryResult([{ count: '4' }]));

      const result = await cardService.getHighRiskCount(mockDeckId, mockUserId);

      expect(result).toBe(4);
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('high_risk_before'),
        [mockDeckId, mockUserId]
      );
    });
  });

  describe('resetCardStability', () => {
    it('should reset card stability and treat as new', async () => {
      const mockCard: Card = {
        id: mockCardId,
        deck_id: mockDeckId,
        user_id: mockUserId,
        recto: 'Question',
        verso: 'Answer',
        comment: null,
        recto_image: null,
        verso_image: null,
        recto_formula: false,
        verso_formula: false,
        reverse: true,
        stability: null,
        difficulty: null,
        last_review: null,
        next_review: new Date(),
        created_at: new Date(),
        updated_at: new Date(),
      };

      (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce(createMockQueryResult([mockCard]));

      const result = await cardService.resetCardStability(mockCardId, mockUserId);

      expect(result).toEqual(mockCard);
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('stability = NULL'),
        [mockCardId, mockUserId]
      );
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('difficulty = NULL'),
        [mockCardId, mockUserId]
      );
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('last_review = NULL'),
        [mockCardId, mockUserId]
      );
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('next_review = CURRENT_TIMESTAMP'),
        [mockCardId, mockUserId]
      );
    });

    it('should return null when card not found', async () => {
      (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce(createMockQueryResult([]));

      const result = await cardService.resetCardStability(mockCardId, mockUserId);

      expect(result).toBeNull();
    });
  });

  describe('updateCardState', () => {
    it('should update card FSRS state', async () => {
      const fsrsState: FSRSState = {
        stability: 10,
        difficulty: 5,
        lastReview: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
        nextReview: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
      };

      const mockCard: Card = {
        id: mockCardId,
        deck_id: mockDeckId,
        user_id: mockUserId,
        recto: 'Question',
        verso: 'Answer',
        comment: null,
        recto_image: null,
        verso_image: null,
        recto_formula: false,
        verso_formula: false,
        reverse: true,
        stability: fsrsState.stability,
        difficulty: fsrsState.difficulty,
        last_review: fsrsState.lastReview,
        next_review: fsrsState.nextReview,
        created_at: new Date(),
        updated_at: new Date(),
      };

      (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce(createMockQueryResult([mockCard]));

      const result = await cardService.updateCardState(mockCardId, mockUserId, fsrsState);

      expect(result).toEqual(mockCard);
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE cards'),
        [
          fsrsState.stability,
          fsrsState.difficulty,
          fsrsState.lastReview,
          fsrsState.nextReview,
          null,
          null,
          mockCardId,
          mockUserId,
        ]
      );
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('updated_at = CURRENT_TIMESTAMP'),
        expect.arrayContaining([fsrsState.stability, fsrsState.difficulty])
      );
    });

    it('should handle null lastReview in FSRS state', async () => {
      const fsrsState: FSRSState = {
        stability: 5,
        difficulty: 4,
        lastReview: null,
        nextReview: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
      };

      const mockCard: Card = {
        id: mockCardId,
        deck_id: mockDeckId,
        user_id: mockUserId,
        recto: 'Question',
        verso: 'Answer',
        comment: null,
        recto_image: null,
        verso_image: null,
        recto_formula: false,
        verso_formula: false,
        reverse: true,
        stability: fsrsState.stability,
        difficulty: fsrsState.difficulty,
        last_review: null,
        next_review: fsrsState.nextReview,
        created_at: new Date(),
        updated_at: new Date(),
      };

      (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce(createMockQueryResult([mockCard]));

      const result = await cardService.updateCardState(mockCardId, mockUserId, fsrsState);

      expect(result).toEqual(mockCard);
      expect(pool.query).toHaveBeenCalledWith(
        expect.any(String),
        [fsrsState.stability, fsrsState.difficulty, null, fsrsState.nextReview, null, null, mockCardId, mockUserId]
      );
    });

    it('should return null when card not found', async () => {
      const fsrsState: FSRSState = {
        stability: 5,
        difficulty: 4,
        lastReview: new Date(),
        nextReview: new Date(),
      };

      (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce(createMockQueryResult([]));

      const result = await cardService.updateCardState(mockCardId, mockUserId, fsrsState);

      expect(result).toBeNull();
    });
  });
});
