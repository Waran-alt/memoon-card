import { pool } from '../config/database';
import { Deck, CreateDeckRequest } from '../types/database';
import { sanitizeHtml } from '../utils/sanitize';
import { ValidationError } from '../utils/errors';
import { CategoryService } from './category.service';

export class DeckService {
  constructor(private readonly categoryService: CategoryService) {}
  /**
   * Get all decks for a user
   */
  async getDecksByUserId(userId: string): Promise<Deck[]> {
    const result = await pool.query<Deck>(
      'SELECT * FROM decks WHERE user_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC',
      [userId]
    );
    return result.rows;
  }

  /**
   * Get a deck by ID (includes default categories when present).
   */
  async getDeckById(deckId: string, userId: string): Promise<Deck | null> {
    const result = await pool.query<Deck>(
      'SELECT * FROM decks WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL',
      [deckId, userId]
    );
    const deck = result.rows[0] || null;
    if (!deck) return null;
    const catResult = await pool.query<{ id: string; name: string }>(
      `SELECT c.id, c.name FROM categories c
       INNER JOIN deck_categories dc ON dc.category_id = c.id
       WHERE dc.deck_id = $1 ORDER BY c.name`,
      [deckId]
    );
    (deck as Deck).categories = catResult.rows;
    return deck;
  }

  /**
   * Create a new deck. categoryNames are created (if not exist) and linked via deck_categories.
   * Returns the deck with categories populated (same shape as getDeckById).
   */
  async createDeck(userId: string, data: CreateDeckRequest): Promise<Deck> {
    // Sanitize HTML content to prevent XSS
    const sanitizedTitle = sanitizeHtml(data.title);
    const sanitizedDescription = data.description ? sanitizeHtml(data.description) : null;

    const showKnowledge = data.show_knowledge_on_card_creation === true;
    const result = await pool.query<Deck>(
      `INSERT INTO decks (user_id, title, description, show_knowledge_on_card_creation)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [userId, sanitizedTitle, sanitizedDescription, showKnowledge]
    );
    const deck = result.rows[0];
    const names = (data.categoryNames ?? []).filter((n) => typeof n === 'string' && n.trim().length > 0);
    if (names.length > 0) {
      const categoryIds: string[] = [];
      for (const name of names) {
        const cat = await this.categoryService.getOrCreateByName(userId, name);
        categoryIds.push(cat.id);
      }
      await this.linkCategoriesToDeck(deck.id, categoryIds);
    }
    return (await this.getDeckById(deck.id, userId)) ?? deck;
  }

  /** Link categories to a deck (used after create). Caller must ensure deck and categories belong to user. */
  async linkCategoriesToDeck(deckId: string, categoryIds: string[]): Promise<void> {
    if (categoryIds.length === 0) return;
    const values = categoryIds.map((_, i) => `($1, $${i + 2}::uuid)`).join(', ');
    await pool.query(
      `INSERT INTO deck_categories (deck_id, category_id) VALUES ${values}`,
      [deckId, ...categoryIds]
    );
  }

  /** Replace deck categories. Validates each category belongs to user. */
  async setDeckCategories(deckId: string, userId: string, categoryIds: string[]): Promise<void> {
    for (const catId of categoryIds) {
      const cat = await this.categoryService.getById(catId, userId);
      if (!cat) throw new ValidationError(`Category ${catId} not found or access denied`);
    }
    await pool.query('DELETE FROM deck_categories WHERE deck_id = $1', [deckId]);
    await this.linkCategoriesToDeck(deckId, categoryIds);
  }

  /**
   * Update a deck (title, description, show_knowledge_on_card_creation, category_ids).
   * category_ids replaces the deck's category associations.
   */
  async updateDeck(
    deckId: string,
    userId: string,
    data: Partial<CreateDeckRequest> & { category_ids?: string[] }
  ): Promise<Deck | null> {
    const updates: string[] = [];
    const values: (string | number | boolean | null)[] = [];
    let paramCount = 1;

    if (data.title !== undefined) {
      updates.push(`title = $${paramCount++}`);
      values.push(sanitizeHtml(data.title)); // Sanitize HTML
    }
    if (data.description !== undefined) {
      updates.push(`description = $${paramCount++}`);
      values.push(data.description ? sanitizeHtml(data.description) : null); // Sanitize HTML
    }
    if (data.show_knowledge_on_card_creation !== undefined) {
      updates.push(`show_knowledge_on_card_creation = $${paramCount++}`);
      values.push(data.show_knowledge_on_card_creation);
    }

    if (updates.length > 0) {
      updates.push(`updated_at = CURRENT_TIMESTAMP`);
      values.push(deckId, userId);

      const result = await pool.query<Deck>(
        `UPDATE decks
         SET ${updates.join(', ')}
         WHERE id = $${paramCount++} AND user_id = $${paramCount++} AND deleted_at IS NULL
         RETURNING *`,
        values
      );
      if (!result.rows[0]) return null;
    } else {
      const existing = await this.getDeckById(deckId, userId);
      if (!existing) return null;
    }

    if (data.category_ids !== undefined) {
      await this.setDeckCategories(deckId, userId, data.category_ids);
    }

    return this.getDeckById(deckId, userId);
  }

  /**
   * Soft-delete a deck. Row and FKs (cards, study_events, etc.) are kept; cards and study data remain.
   */
  async deleteDeck(deckId: string, userId: string): Promise<boolean> {
    const result = await pool.query(
      'UPDATE decks SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL',
      [deckId, userId]
    );
    return result.rowCount !== null && result.rowCount > 0;
  }

  /**
   * Get deck statistics
   */
  async getDeckStats(deckId: string, userId: string): Promise<{
    totalCards: number;
    dueCards: number;
    newCards: number;
    reviewedToday: number;
  }> {
    const now = new Date();
    const todayStart = new Date(now.setHours(0, 0, 0, 0));

    const stats = await pool.query(
      `SELECT 
        COUNT(*) as total_cards,
        COUNT(CASE WHEN next_review <= CURRENT_TIMESTAMP THEN 1 END) as due_cards,
        COUNT(CASE WHEN stability IS NULL THEN 1 END) as new_cards,
        COUNT(CASE WHEN last_review >= $1 THEN 1 END) as reviewed_today
       FROM cards
       WHERE deck_id = $2 AND user_id = $3 AND deleted_at IS NULL`,
      [todayStart, deckId, userId]
    );

    const row = stats.rows[0];
    return {
      totalCards: parseInt(row.total_cards, 10),
      dueCards: parseInt(row.due_cards, 10),
      newCards: parseInt(row.new_cards, 10),
      reviewedToday: parseInt(row.reviewed_today, 10),
    };
  }
}
