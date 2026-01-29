/**
 * Tests for CardService
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CardService } from '../../services/card.service';
import { Card, CreateCardRequest } from '../../types/database';
import { pool } from '../../config/database';
import { createMockQueryResult } from '../utils/test-helpers';

// Mock database pool
vi.mock('../../config/database', () => ({
  pool: {
    query: vi.fn(),
  },
}));

// Mock sanitize
vi.mock('../../utils/sanitize', () => ({
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

      vi.mocked(pool.query).mockResolvedValueOnce(createMockQueryResult(mockCards));

      const result = await cardService.getCardsByDeckId(mockDeckId, mockUserId);

      expect(result).toEqual(mockCards);
      expect(pool.query).toHaveBeenCalledWith(
        'SELECT * FROM cards WHERE deck_id = $1 AND user_id = $2 ORDER BY created_at DESC',
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

      vi.mocked(pool.query).mockResolvedValueOnce(createMockQueryResult([mockCard]));

      const result = await cardService.getCardById(mockCardId, mockUserId);

      expect(result).toEqual(mockCard);
    });

    it('should return null if card not found', async () => {
      vi.mocked(pool.query).mockResolvedValueOnce(createMockQueryResult([]));

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
        comment: createData.comment,
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

      vi.mocked(pool.query).mockResolvedValueOnce(createMockQueryResult([mockCard]));

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

      vi.mocked(pool.query).mockResolvedValueOnce(createMockQueryResult([mockCard]));

      const result = await cardService.updateCard(mockCardId, mockUserId, updateData);

      expect(result).toEqual(mockCard);
    });
  });

  describe('deleteCard', () => {
    it('should delete a card', async () => {
      vi.mocked(pool.query).mockResolvedValueOnce(createMockQueryResult([]));

      await cardService.deleteCard(mockCardId, mockUserId);

      expect(pool.query).toHaveBeenCalledWith(
        'DELETE FROM cards WHERE id = $1 AND user_id = $2',
        [mockCardId, mockUserId]
      );
    });
  });
});
