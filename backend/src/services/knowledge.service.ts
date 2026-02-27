/**
 * User-scoped knowledge (learning unit). Can have 1, 2, or more linked cards.
 * Not tied to a deck; deck is for managing cards.
 */

import { pool } from '../config/database';
import { sanitizeHtml } from '../utils/sanitize';

export interface KnowledgeRow {
  id: string;
  user_id: string;
  content: string | null;
  created_at: Date;
  updated_at: Date;
  deleted_at?: Date | null;
}

export class KnowledgeService {
  async create(userId: string, content: string | null): Promise<KnowledgeRow> {
    const sanitized = content ? sanitizeHtml(content) : null;
    const result = await pool.query<KnowledgeRow>(
      `INSERT INTO knowledge (user_id, content) VALUES ($1, $2)
       RETURNING id, user_id, content, created_at, updated_at, deleted_at`,
      [userId, sanitized]
    );
    return result.rows[0];
  }

  async getById(knowledgeId: string, userId: string): Promise<KnowledgeRow | null> {
    const result = await pool.query<KnowledgeRow>(
      'SELECT id, user_id, content, created_at, updated_at, deleted_at FROM knowledge WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL',
      [knowledgeId, userId]
    );
    return result.rows[0] || null;
  }

  async listByUserId(userId: string): Promise<KnowledgeRow[]> {
    const result = await pool.query<KnowledgeRow>(
      'SELECT id, user_id, content, created_at, updated_at, deleted_at FROM knowledge WHERE user_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC',
      [userId]
    );
    return result.rows;
  }

  async update(knowledgeId: string, userId: string, content: string | null | undefined): Promise<KnowledgeRow | null> {
    if (content === undefined) {
      return this.getById(knowledgeId, userId);
    }
    const sanitized = content ? sanitizeHtml(content) : null;
    const result = await pool.query<KnowledgeRow>(
      `UPDATE knowledge SET content = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND user_id = $3 AND deleted_at IS NULL
       RETURNING id, user_id, content, created_at, updated_at, deleted_at`,
      [sanitized, knowledgeId, userId]
    );
    return result.rows[0] || null;
  }

  async softDelete(knowledgeId: string, userId: string): Promise<KnowledgeRow | null> {
    const result = await pool.query<KnowledgeRow>(
      `UPDATE knowledge SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL RETURNING id, user_id, content, created_at, updated_at, deleted_at`,
      [knowledgeId, userId]
    );
    return result.rows[0] || null;
  }
}
