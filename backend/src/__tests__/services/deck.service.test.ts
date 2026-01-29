/**
 * Tests for DeckService
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DeckService } from '../../services/deck.service';
import { Deck, CreateDeckRequest } from '../../types/database';
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

describe('DeckService', () => {
  let deckService: DeckService;
  const mockUserId = 'user-123';
  const mockDeckId = 'deck-123';

  beforeEach(() => {
    deckService = new DeckService();
    vi.clearAllMocks();
  });

  describe('getDecksByUserId', () => {
    it('should return all decks for a user', async () => {
      const mockDecks: Deck[] = [
        {
          id: mockDeckId,
          user_id: mockUserId,
          title: 'Test Deck',
          description: 'Test Description',
          created_at: new Date(),
          updated_at: new Date(),
        },
      ];

      vi.mocked(pool.query).mockResolvedValueOnce(createMockQueryResult(mockDecks));

      const result = await deckService.getDecksByUserId(mockUserId);

      expect(result).toEqual(mockDecks);
      expect(pool.query).toHaveBeenCalledWith(
        'SELECT * FROM decks WHERE user_id = $1 ORDER BY created_at DESC',
        [mockUserId]
      );
    });

    it('should return empty array if no decks found', async () => {
      vi.mocked(pool.query).mockResolvedValueOnce(createMockQueryResult([]));

      const result = await deckService.getDecksByUserId(mockUserId);

      expect(result).toEqual([]);
    });
  });

  describe('getDeckById', () => {
    it('should return deck if found', async () => {
      const mockDeck: Deck = {
        id: mockDeckId,
        user_id: mockUserId,
        title: 'Test Deck',
        description: 'Test Description',
        created_at: new Date(),
        updated_at: new Date(),
      };

      vi.mocked(pool.query).mockResolvedValueOnce(createMockQueryResult([mockDeck]));

      const result = await deckService.getDeckById(mockDeckId, mockUserId);

      expect(result).toEqual(mockDeck);
      expect(pool.query).toHaveBeenCalledWith(
        'SELECT * FROM decks WHERE id = $1 AND user_id = $2',
        [mockDeckId, mockUserId]
      );
    });

    it('should return null if deck not found', async () => {
      vi.mocked(pool.query).mockResolvedValueOnce(createMockQueryResult([]));

      const result = await deckService.getDeckById(mockDeckId, mockUserId);

      expect(result).toBeNull();
    });
  });

  describe('createDeck', () => {
    it('should create a new deck', async () => {
      const createData: CreateDeckRequest = {
        title: 'New Deck',
        description: 'New Description',
      };

      const mockDeck: Deck = {
        id: mockDeckId,
        user_id: mockUserId,
        title: createData.title,
        description: createData.description,
        created_at: new Date(),
        updated_at: new Date(),
      };

      vi.mocked(pool.query).mockResolvedValueOnce(createMockQueryResult([mockDeck]));

      const result = await deckService.createDeck(mockUserId, createData);

      expect(result).toEqual(mockDeck);
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO decks'),
        [mockUserId, createData.title, createData.description]
      );
    });

    it('should handle null description', async () => {
      const createData: CreateDeckRequest = {
        title: 'New Deck',
      };

      const mockDeck: Deck = {
        id: mockDeckId,
        user_id: mockUserId,
        title: createData.title,
        description: null,
        created_at: new Date(),
        updated_at: new Date(),
      };

      vi.mocked(pool.query).mockResolvedValueOnce(createMockQueryResult([mockDeck]));

      const result = await deckService.createDeck(mockUserId, createData);

      expect(result).toEqual(mockDeck);
    });
  });

  describe('updateDeck', () => {
    it('should update an existing deck', async () => {
      const updateData: CreateDeckRequest = {
        title: 'Updated Deck',
        description: 'Updated Description',
      };

      const mockDeck: Deck = {
        id: mockDeckId,
        user_id: mockUserId,
        title: updateData.title,
        description: updateData.description,
        created_at: new Date(),
        updated_at: new Date(),
      };

      vi.mocked(pool.query).mockResolvedValueOnce(createMockQueryResult([mockDeck]));

      const result = await deckService.updateDeck(mockDeckId, mockUserId, updateData);

      expect(result).toEqual(mockDeck);
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE decks'),
        [updateData.title, updateData.description, mockDeckId, mockUserId]
      );
    });
  });

  describe('deleteDeck', () => {
    it('should delete a deck', async () => {
      vi.mocked(pool.query).mockResolvedValueOnce(createMockQueryResult([]));

      await deckService.deleteDeck(mockDeckId, mockUserId);

      expect(pool.query).toHaveBeenCalledWith(
        'DELETE FROM decks WHERE id = $1 AND user_id = $2',
        [mockDeckId, mockUserId]
      );
    });
  });
});
