/**
 * Tests for KnowledgeService
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { KnowledgeService } from '@/services/knowledge.service';
import type { KnowledgeRow } from '@/services/knowledge.service';
import { pool } from '@/config/database';
import { createMockQueryResult } from '@/__tests__/utils/test-helpers';

vi.mock('@/config/database', () => ({
  pool: {
    query: vi.fn(),
  },
}));

vi.mock('@/utils/sanitize', () => ({
  sanitizeHtml: vi.fn((input: string) => input),
}));

describe('KnowledgeService', () => {
  let knowledgeService: KnowledgeService;
  const mockUserId = 'user-123';
  const mockKnowledgeId = 'knowledge-123';

  beforeEach(() => {
    knowledgeService = new KnowledgeService();
    vi.clearAllMocks();
  });

  describe('create', () => {
    it('should create knowledge with content', async () => {
      const content = 'Some context for the card pair.';
      const mockRow: KnowledgeRow = {
        id: mockKnowledgeId,
        user_id: mockUserId,
        content,
        created_at: new Date(),
        updated_at: new Date(),
      };

      (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce(createMockQueryResult([mockRow]));

      const result = await knowledgeService.create(mockUserId, content);

      expect(result).toEqual(mockRow);
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO knowledge'),
        [mockUserId, content]
      );
    });

    it('should create knowledge with null content', async () => {
      const mockRow: KnowledgeRow = {
        id: mockKnowledgeId,
        user_id: mockUserId,
        content: null,
        created_at: new Date(),
        updated_at: new Date(),
      };

      (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce(createMockQueryResult([mockRow]));

      const result = await knowledgeService.create(mockUserId, null);

      expect(result.content).toBeNull();
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO knowledge'),
        [mockUserId, null]
      );
    });
  });

  describe('getById', () => {
    it('should return knowledge when found and not deleted', async () => {
      const mockRow: KnowledgeRow = {
        id: mockKnowledgeId,
        user_id: mockUserId,
        content: 'Test content',
        created_at: new Date(),
        updated_at: new Date(),
      };

      (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce(createMockQueryResult([mockRow]));

      const result = await knowledgeService.getById(mockKnowledgeId, mockUserId);

      expect(result).toEqual(mockRow);
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('deleted_at IS NULL'),
        [mockKnowledgeId, mockUserId]
      );
    });

    it('should return null when not found', async () => {
      (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce(createMockQueryResult([]));

      const result = await knowledgeService.getById(mockKnowledgeId, mockUserId);

      expect(result).toBeNull();
    });
  });

  describe('listByUserId', () => {
    it('should return all non-deleted knowledge for user', async () => {
      const mockRows: KnowledgeRow[] = [
        {
          id: mockKnowledgeId,
          user_id: mockUserId,
          content: 'First',
          created_at: new Date(),
          updated_at: new Date(),
        },
      ];

      (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce(createMockQueryResult(mockRows));

      const result = await knowledgeService.listByUserId(mockUserId);

      expect(result).toEqual(mockRows);
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('deleted_at IS NULL'),
        [mockUserId]
      );
    });

    it('should return empty array when none found', async () => {
      (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce(createMockQueryResult([]));

      const result = await knowledgeService.listByUserId(mockUserId);

      expect(result).toEqual([]);
    });
  });

  describe('update', () => {
    it('should update content when provided', async () => {
      const newContent = 'Updated content';
      const mockRow: KnowledgeRow = {
        id: mockKnowledgeId,
        user_id: mockUserId,
        content: newContent,
        created_at: new Date(),
        updated_at: new Date(),
      };

      (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce(createMockQueryResult([mockRow]));

      const result = await knowledgeService.update(mockKnowledgeId, mockUserId, newContent);

      expect(result).toEqual(mockRow);
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE knowledge'),
        [newContent, mockKnowledgeId, mockUserId]
      );
    });

    it('should clear content when null provided', async () => {
      const mockRow: KnowledgeRow = {
        id: mockKnowledgeId,
        user_id: mockUserId,
        content: null,
        created_at: new Date(),
        updated_at: new Date(),
      };

      (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce(createMockQueryResult([mockRow]));

      const result = await knowledgeService.update(mockKnowledgeId, mockUserId, null);

      expect(result?.content).toBeNull();
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE knowledge'),
        [null, mockKnowledgeId, mockUserId]
      );
    });

    it('should return getById when content is undefined (no-op)', async () => {
      const mockRow: KnowledgeRow = {
        id: mockKnowledgeId,
        user_id: mockUserId,
        content: 'Unchanged',
        created_at: new Date(),
        updated_at: new Date(),
      };

      (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce(createMockQueryResult([mockRow]));

      const result = await knowledgeService.update(mockKnowledgeId, mockUserId, undefined);

      expect(result).toEqual(mockRow);
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT'),
        [mockKnowledgeId, mockUserId]
      );
      expect(pool.query).not.toHaveBeenCalledWith(
        expect.stringContaining('UPDATE knowledge'),
        expect.anything()
      );
    });
  });

  describe('softDelete', () => {
    it('should set deleted_at and return the row', async () => {
      const mockRow: KnowledgeRow = {
        id: mockKnowledgeId,
        user_id: mockUserId,
        content: 'Deleted',
        created_at: new Date(),
        updated_at: new Date(),
        deleted_at: new Date(),
      };

      (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce(createMockQueryResult([mockRow]));

      const result = await knowledgeService.softDelete(mockKnowledgeId, mockUserId);

      expect(result).toEqual(mockRow);
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('deleted_at = CURRENT_TIMESTAMP'),
        [mockKnowledgeId, mockUserId]
      );
    });

    it('should return null when row not found or already deleted', async () => {
      (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce(createMockQueryResult([]));

      const result = await knowledgeService.softDelete(mockKnowledgeId, mockUserId);

      expect(result).toBeNull();
    });
  });
});
