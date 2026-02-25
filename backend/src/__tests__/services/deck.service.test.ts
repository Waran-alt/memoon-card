/**
 * Tests for DeckService
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DeckService } from '@/services/deck.service';
import { Deck, CreateDeckRequest } from '@/types/database';
import { pool } from '@/config/database';
import { createMockQueryResult } from '@/__tests__/utils/test-helpers';

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

// Mock CategoryService for DeckService constructor
const mockGetOrCreateByName = vi.fn();
vi.mock('@/services/category.service', () => ({
  CategoryService: vi.fn().mockImplementation(() => ({
    getOrCreateByName: mockGetOrCreateByName,
  })),
}));

describe('DeckService', () => {
  let deckService: DeckService;
  const mockUserId = 'user-123';
  const mockDeckId = 'deck-123';

  beforeEach(async () => {
    const { CategoryService } = await import('@/services/category.service');
    deckService = new DeckService(new CategoryService());
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

      (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce(createMockQueryResult(mockDecks));

      const result = await deckService.getDecksByUserId(mockUserId);

      expect(result).toEqual(mockDecks);
      expect(pool.query).toHaveBeenCalledWith(
        'SELECT * FROM decks WHERE user_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC',
        [mockUserId]
      );
    });

    it('should return empty array if no decks found', async () => {
      (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce(createMockQueryResult([]));

      const result = await deckService.getDecksByUserId(mockUserId);

      expect(result).toEqual([]);
    });
  });

  describe('getDeckById', () => {
    it('should return deck if found (with categories)', async () => {
      const mockDeck: Deck = {
        id: mockDeckId,
        user_id: mockUserId,
        title: 'Test Deck',
        description: 'Test Description',
        created_at: new Date(),
        updated_at: new Date(),
      };

      (pool.query as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(createMockQueryResult([mockDeck]))
        .mockResolvedValueOnce(createMockQueryResult([]));

      const result = await deckService.getDeckById(mockDeckId, mockUserId);

      expect(result).toEqual({ ...mockDeck, categories: [] });
      expect(pool.query).toHaveBeenNthCalledWith(
        1,
        'SELECT * FROM decks WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL',
        [mockDeckId, mockUserId]
      );
    });

    it('should return null if deck not found', async () => {
      (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce(createMockQueryResult([]));

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
        description: createData.description ?? null,
        created_at: new Date(),
        updated_at: new Date(),
      };

      (pool.query as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(createMockQueryResult([mockDeck]))
        .mockResolvedValueOnce(createMockQueryResult([mockDeck]))
        .mockResolvedValueOnce(createMockQueryResult([]));

      const result = await deckService.createDeck(mockUserId, createData);

      expect(result).toMatchObject({ ...mockDeck, categories: [] });
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

      (pool.query as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(createMockQueryResult([mockDeck]))
        .mockResolvedValueOnce(createMockQueryResult([mockDeck]))
        .mockResolvedValueOnce(createMockQueryResult([]));

      const result = await deckService.createDeck(mockUserId, createData);

      expect(result).toMatchObject({ ...mockDeck, categories: [] });
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
        description: updateData.description ?? null,
        created_at: new Date(),
        updated_at: new Date(),
      };

      (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce(createMockQueryResult([mockDeck]));

      const result = await deckService.updateDeck(mockDeckId, mockUserId, updateData);

      expect(result).toEqual(mockDeck);
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE decks'),
        [updateData.title, updateData.description, mockDeckId, mockUserId]
      );
    });
  });

  describe('deleteDeck', () => {
    it('should soft-delete a deck (set deleted_at)', async () => {
      (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce(createMockQueryResult([]));

      await deckService.deleteDeck(mockDeckId, mockUserId);

      expect(pool.query).toHaveBeenCalledWith(
        'UPDATE decks SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL',
        [mockDeckId, mockUserId]
      );
    });
  });
});
