import { pool } from '../config/database';
import type { CardFlag } from '../types/database';

export interface CreateCardFlagInput {
  reason: string;
  note?: string | null;
  sessionId?: string | null;
}

export class CardFlagService {
  async createFlag(cardId: string, userId: string, input: CreateCardFlagInput): Promise<CardFlag | null> {
    const result = await pool.query<CardFlag>(
      `INSERT INTO card_flags (card_id, user_id, reason, note, flagged_during_session_id)
       SELECT $1, $2, $3, $4, $5
       FROM cards c
       WHERE c.id = $1 AND c.user_id = $2 AND c.deleted_at IS NULL
       RETURNING *`,
      [
        cardId,
        userId,
        input.reason.slice(0, 50),
        input.note ?? null,
        input.sessionId ?? null,
      ]
    );
    return result.rows[0] || null;
  }
}
