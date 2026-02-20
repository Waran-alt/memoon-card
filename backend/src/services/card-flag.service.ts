import { pool } from '../config/database';
import type { CardFlag } from '../types/database';

export interface CreateCardFlagInput {
  reason: string;
  note?: string | null;
  sessionId?: string | null;
}

export interface FlagWithCard {
  id: string;
  card_id: string;
  user_id: string;
  reason: string;
  note: string | null;
  flagged_during_session_id: string | null;
  resolved: boolean;
  created_at: Date;
  deck_id: string;
  deck_title: string;
  recto_snippet: string;
}

export interface ListFlagsOptions {
  deckId?: string;
  resolved?: boolean;
  limit?: number;
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

  async listFlags(userId: string, options: ListFlagsOptions = {}): Promise<FlagWithCard[]> {
    const { deckId, resolved, limit = 100 } = options;
    const conditions: string[] = ['f.user_id = $1'];
    const params: (string | number | boolean)[] = [userId];
    let paramIndex = 2;
    if (deckId !== undefined) {
      conditions.push(`c.deck_id = $${paramIndex++}`);
      params.push(deckId);
    }
    if (resolved !== undefined) {
      conditions.push(`f.resolved = $${paramIndex++}`);
      params.push(resolved);
    }
    params.push(limit);
    const result = await pool.query<FlagWithCard>(
      `SELECT f.id, f.card_id, f.user_id, f.reason, f.note, f.flagged_during_session_id,
              f.resolved, f.created_at,
              c.deck_id, d.title AS deck_title,
              LEFT(c.recto, 80) AS recto_snippet
       FROM card_flags f
       JOIN cards c ON c.id = f.card_id AND c.deleted_at IS NULL
       JOIN decks d ON d.id = c.deck_id AND d.deleted_at IS NULL
       WHERE ${conditions.join(' AND ')}
       ORDER BY f.created_at DESC
       LIMIT $${paramIndex}`,
      params
    );
    return result.rows;
  }

  async resolveFlag(flagId: string, userId: string, resolved: boolean): Promise<CardFlag | null> {
    const result = await pool.query<CardFlag>(
      `UPDATE card_flags SET resolved = $1
       WHERE id = $2 AND user_id = $3
       RETURNING *`,
      [resolved, flagId, userId]
    );
    return result.rows[0] || null;
  }
}
