/**
 * Tests for CardFlagService
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CardFlagService } from '@/services/card-flag.service';
import { pool } from '@/config/database';
import { createMockQueryResult } from '@/__tests__/utils/test-helpers';
import type { CardFlag } from '@/types/database';

vi.mock('@/config/database', () => ({
  pool: {
    query: vi.fn(),
  },
}));

describe('CardFlagService', () => {
  let service: CardFlagService;
  const mockUserId = 'user-123';
  const mockCardId = 'card-456';

  beforeEach(() => {
    service = new CardFlagService();
    vi.clearAllMocks();
  });

  describe('createFlag', () => {
    it('creates a flag and returns the row when card exists', async () => {
      const mockFlag: CardFlag = {
        id: 'flag-789',
        card_id: mockCardId,
        user_id: mockUserId,
        reason: 'wrong_content',
        note: 'Fix the answer',
        flagged_during_session_id: 'session-abc',
        resolved: false,
        created_at: new Date(),
      };
      (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        createMockQueryResult([mockFlag])
      );

      const result = await service.createFlag(mockCardId, mockUserId, {
        reason: 'wrong_content',
        note: 'Fix the answer',
        sessionId: 'session-abc',
      });

      expect(result).toEqual(mockFlag);
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO card_flags'),
        [mockCardId, mockUserId, 'wrong_content', 'Fix the answer', 'session-abc']
      );
    });

    it('truncates reason to 50 characters', async () => {
      const longReason = 'a'.repeat(60);
      const mockFlag: CardFlag = {
        id: 'flag-789',
        card_id: mockCardId,
        user_id: mockUserId,
        reason: 'a'.repeat(50),
        note: null,
        flagged_during_session_id: null,
        resolved: false,
        created_at: new Date(),
      };
      (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        createMockQueryResult([mockFlag])
      );

      await service.createFlag(mockCardId, mockUserId, { reason: longReason });

      expect(pool.query).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([mockCardId, mockUserId, 'a'.repeat(50), null, null])
      );
    });

    it('returns null when card does not exist or is deleted', async () => {
      (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        createMockQueryResult([])
      );

      const result = await service.createFlag(mockCardId, mockUserId, {
        reason: 'typo',
      });

      expect(result).toBeNull();
    });

    it('passes null for optional note and sessionId', async () => {
      (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        createMockQueryResult([
          {
            id: 'flag-789',
            card_id: mockCardId,
            user_id: mockUserId,
            reason: 'duplicate',
            note: null,
            flagged_during_session_id: null,
            resolved: false,
            created_at: new Date(),
          },
        ])
      );

      await service.createFlag(mockCardId, mockUserId, { reason: 'duplicate' });

      expect(pool.query).toHaveBeenCalledWith(
        expect.any(String),
        [mockCardId, mockUserId, 'duplicate', null, null]
      );
    });
  });
});
