/**
 * User-scoped categories and card-category assignments.
 * Categories are used to tag cards (e.g. vocabulary, grammar) for analytics and intel.
 */

import { pool } from '../config/database';
import { Category } from '../types/database';
import { NotFoundError, ValidationError } from '../utils/errors';
import { sanitizeHtml } from '../utils/sanitize';

export interface CategoryWithCardCount extends Category {
  card_count?: number;
}

export class CategoryService {
  async listByUserId(userId: string, withCardCount = false): Promise<CategoryWithCardCount[]> {
    if (withCardCount) {
      const result = await pool.query<CategoryWithCardCount>(
        `SELECT c.id, c.user_id, c.name, c.created_at,
                COUNT(cc.card_id)::int AS card_count
         FROM categories c
         LEFT JOIN card_categories cc ON cc.category_id = c.id
         LEFT JOIN cards card ON card.id = cc.card_id AND card.deleted_at IS NULL
         WHERE c.user_id = $1
         GROUP BY c.id, c.user_id, c.name, c.created_at
         ORDER BY c.name`,
        [userId]
      );
      return result.rows;
    }
    const result = await pool.query<Category>(
      'SELECT id, user_id, name, created_at FROM categories WHERE user_id = $1 ORDER BY name',
      [userId]
    );
    return result.rows;
  }

  async getById(categoryId: string, userId: string): Promise<Category | null> {
    const result = await pool.query<Category>(
      'SELECT id, user_id, name, created_at FROM categories WHERE id = $1 AND user_id = $2',
      [categoryId, userId]
    );
    return result.rows[0] || null;
  }

  async create(userId: string, name: string): Promise<Category> {
    const trimmed = name.trim();
    if (!trimmed) throw new ValidationError('Category name is required');
    const sanitized = sanitizeHtml(trimmed);
    const result = await pool.query<Category>(
      `INSERT INTO categories (user_id, name) VALUES ($1, $2)
       RETURNING id, user_id, name, created_at`,
      [userId, sanitized]
    );
    return result.rows[0];
  }

  async update(categoryId: string, userId: string, name: string): Promise<Category | null> {
    const trimmed = name.trim();
    if (!trimmed) throw new ValidationError('Category name is required');
    const sanitized = sanitizeHtml(trimmed);
    const result = await pool.query<Category>(
      `UPDATE categories SET name = $3, created_at = created_at
       WHERE id = $1 AND user_id = $2
       RETURNING id, user_id, name, created_at`,
      [categoryId, userId, sanitized]
    );
    return result.rows[0] || null;
  }

  async delete(categoryId: string, userId: string): Promise<boolean> {
    const result = await pool.query(
      'DELETE FROM categories WHERE id = $1 AND user_id = $2',
      [categoryId, userId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  /** Get categories attached to a card. Card must belong to user (via deck). */
  async getCategoriesForCard(cardId: string, userId: string): Promise<{ id: string; name: string }[]> {
    const result = await pool.query<{ id: string; name: string }>(
      `SELECT c.id, c.name FROM categories c
       INNER JOIN card_categories cc ON cc.category_id = c.id
       INNER JOIN cards card ON card.id = cc.card_id AND card.user_id = $2
       WHERE cc.card_id = $1`,
      [cardId, userId]
    );
    return result.rows;
  }

  /** Get categories for multiple cards in one query. Returns map of card_id -> categories. */
  async getCategoriesByCardIds(cardIds: string[], userId: string): Promise<Map<string, { id: string; name: string }[]>> {
    const map = new Map<string, { id: string; name: string }[]>();
    if (cardIds.length === 0) return map;
    const result = await pool.query<{ card_id: string; id: string; name: string }>(
      `SELECT cc.card_id, c.id, c.name FROM categories c
       INNER JOIN card_categories cc ON cc.category_id = c.id
       INNER JOIN cards card ON card.id = cc.card_id AND card.user_id = $2 AND card.deleted_at IS NULL
       WHERE cc.card_id = ANY($1::uuid[])`,
      [cardIds, userId]
    );
    for (const row of result.rows) {
      const list = map.get(row.card_id) ?? [];
      list.push({ id: row.id, name: row.name });
      map.set(row.card_id, list);
    }
    return map;
  }

  /** Replace categories for a card. categoryIds must all belong to user; card must belong to user. */
  async setCategoriesForCard(cardId: string, userId: string, categoryIds: string[]): Promise<void> {
    const cardCheck = await pool.query(
      'SELECT 1 FROM cards WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL',
      [cardId, userId]
    );
    if (cardCheck.rows.length === 0) throw new NotFoundError('Card');
    if (categoryIds.length > 0) {
      const catCheck = await pool.query<{ n: number }>(
        'SELECT COUNT(*)::int AS n FROM categories WHERE id = ANY($1::uuid[]) AND user_id = $2',
        [categoryIds, userId]
      );
      if (catCheck.rows[0]?.n !== categoryIds.length) throw new ValidationError('All category IDs must belong to you');
    }
    await pool.query('DELETE FROM card_categories WHERE card_id = $1', [cardId]);
    if (categoryIds.length > 0) {
      const values = categoryIds.map((_, i) => `($1, $${i + 2}::uuid)`).join(', ');
      await pool.query(
        `INSERT INTO card_categories (card_id, category_id) VALUES ${values}`,
        [cardId, ...categoryIds]
      );
    }
  }
}
