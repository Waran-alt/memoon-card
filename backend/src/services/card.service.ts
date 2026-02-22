import { pool } from '../config/database';
import {
  Card,
  CreateCardRequest,
  UpdateCardRequest,
} from '../types/database';
import { FSRSState } from '../services/fsrs.service';
import { sanitizeHtml } from '../utils/sanitize';

export class CardService {
  /**
   * Get all cards in a deck
   */
  async getCardsByDeckId(
    deckId: string,
    userId: string
  ): Promise<Card[]> {
    const result = await pool.query<Card>(
      'SELECT * FROM cards WHERE deck_id = $1 AND user_id = $2 AND deleted_at IS NULL ORDER BY created_at DESC',
      [deckId, userId]
    );
    return result.rows;
  }

  /**
   * Get a card by ID
   */
  async getCardById(cardId: string, userId: string): Promise<Card | null> {
    const result = await pool.query<Card>(
      'SELECT * FROM cards WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL',
      [cardId, userId]
    );
    return result.rows[0] || null;
  }

  /**
   * Create a new card
   */
  async createCard(
    deckId: string,
    userId: string,
    data: CreateCardRequest
  ): Promise<Card> {
    // Sanitize HTML content to prevent XSS
    const sanitizedRecto = sanitizeHtml(data.recto);
    const sanitizedVerso = sanitizeHtml(data.verso);
    const sanitizedComment = data.comment ? sanitizeHtml(data.comment) : null;

    const result = await pool.query<Card>(
      `INSERT INTO cards (
        user_id, deck_id, recto, verso, comment,
        recto_image, verso_image, recto_formula, verso_formula, reverse
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *`,
      [
        userId,
        deckId,
        sanitizedRecto,
        sanitizedVerso,
        sanitizedComment,
        data.recto_image || null,
        data.verso_image || null,
        data.recto_formula || false,
        data.verso_formula || false,
        data.reverse !== undefined ? data.reverse : true,
      ]
    );
    return result.rows[0];
  }

  /**
   * Update a card
   */
  async updateCard(
    cardId: string,
    userId: string,
    data: UpdateCardRequest
  ): Promise<Card | null> {
    const updates: string[] = [];
    const values: (string | number | boolean | null)[] = [];
    let paramCount = 1;

    if (data.recto !== undefined) {
      updates.push(`recto = $${paramCount++}`);
      values.push(sanitizeHtml(data.recto)); // Sanitize HTML
    }
    if (data.verso !== undefined) {
      updates.push(`verso = $${paramCount++}`);
      values.push(sanitizeHtml(data.verso)); // Sanitize HTML
    }
    if (data.comment !== undefined) {
      updates.push(`comment = $${paramCount++}`);
      values.push(data.comment ? sanitizeHtml(data.comment) : null); // Sanitize HTML
    }
    if (data.recto_image !== undefined) {
      updates.push(`recto_image = $${paramCount++}`);
      values.push(data.recto_image);
    }
    if (data.verso_image !== undefined) {
      updates.push(`verso_image = $${paramCount++}`);
      values.push(data.verso_image);
    }
    if (data.recto_formula !== undefined) {
      updates.push(`recto_formula = $${paramCount++}`);
      values.push(data.recto_formula);
    }
    if (data.verso_formula !== undefined) {
      updates.push(`verso_formula = $${paramCount++}`);
      values.push(data.verso_formula);
    }
    if (data.reverse !== undefined) {
      updates.push(`reverse = $${paramCount++}`);
      values.push(data.reverse);
    }

    if (updates.length === 0) {
      return this.getCardById(cardId, userId);
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(cardId, userId);

    const result = await pool.query<Card>(
      `UPDATE cards
       SET ${updates.join(', ')}
       WHERE id = $${paramCount++} AND user_id = $${paramCount++} AND deleted_at IS NULL
       RETURNING *`,
      values
    );
    return result.rows[0] || null;
  }

  /**
   * Delete a card
   */
  /**
   * Soft-delete a card. Row and FKs (review_logs, card_journey_events, etc.) are kept for study data.
   */
  async deleteCard(cardId: string, userId: string): Promise<boolean> {
    const result = await pool.query(
      'UPDATE cards SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL',
      [cardId, userId]
    );
    return result.rowCount !== null && result.rowCount > 0;
  }

  /**
   * Update card FSRS state. Optionally set pre-computed R-threshold timestamps.
   */
  async updateCardState(
    cardId: string,
    userId: string,
    state: FSRSState,
    riskTimestamps?: { criticalBefore: Date | null; highRiskBefore: Date | null }
  ): Promise<Card | null> {
    const criticalBefore = riskTimestamps?.criticalBefore ?? null;
    const highRiskBefore = riskTimestamps?.highRiskBefore ?? null;
    const result = await pool.query<Card>(
      `UPDATE cards
       SET stability = $1,
           difficulty = $2,
           last_review = $3,
           next_review = $4,
           critical_before = $5,
           high_risk_before = $6,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $7 AND user_id = $8 AND deleted_at IS NULL
       RETURNING *`,
      [
        state.stability,
        state.difficulty,
        state.lastReview,
        state.nextReview,
        criticalBefore,
        highRiskBefore,
        cardId,
        userId,
      ]
    );
    return result.rows[0] || null;
  }

  /**
   * Get due card count for a deck (for study-stats)
   */
  async getDueCount(deckId: string, userId: string): Promise<number> {
    const result = await pool.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM cards
       WHERE deck_id = $1 AND user_id = $2 AND deleted_at IS NULL
         AND next_review <= CURRENT_TIMESTAMP`,
      [deckId, userId]
    );
    return parseInt(result.rows[0]?.count ?? '0', 10);
  }

  /**
   * Get new card count for a deck (for study-stats)
   */
  async getNewCount(deckId: string, userId: string): Promise<number> {
    const result = await pool.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM cards
       WHERE deck_id = $1 AND user_id = $2 AND deleted_at IS NULL
         AND stability IS NULL`,
      [deckId, userId]
    );
    return parseInt(result.rows[0]?.count ?? '0', 10);
  }

  /**
   * Count due cards with critical_before <= now (R < 0.1). Uses pre-computed column when set.
   */
  async getCriticalCount(deckId: string, userId: string): Promise<number> {
    const result = await pool.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM cards
       WHERE deck_id = $1 AND user_id = $2 AND deleted_at IS NULL
         AND next_review <= CURRENT_TIMESTAMP
         AND critical_before IS NOT NULL AND critical_before <= CURRENT_TIMESTAMP`,
      [deckId, userId]
    );
    return parseInt(result.rows[0]?.count ?? '0', 10);
  }

  /**
   * Count due cards with high_risk_before <= now (R < 0.5). Uses pre-computed column when set.
   */
  async getHighRiskCount(deckId: string, userId: string): Promise<number> {
    const result = await pool.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM cards
       WHERE deck_id = $1 AND user_id = $2 AND deleted_at IS NULL
         AND next_review <= CURRENT_TIMESTAMP
         AND high_risk_before IS NOT NULL AND high_risk_before <= CURRENT_TIMESTAMP`,
      [deckId, userId]
    );
    return parseInt(result.rows[0]?.count ?? '0', 10);
  }

  /**
   * Get due cards for a deck
   */
  async getDueCards(deckId: string, userId: string): Promise<Card[]> {
    const result = await pool.query<Card>(
      `SELECT * FROM cards
       WHERE deck_id = $1 AND user_id = $2 AND deleted_at IS NULL
         AND next_review <= CURRENT_TIMESTAMP
       ORDER BY next_review ASC`,
      [deckId, userId]
    );
    return result.rows;
  }

  /**
   * Get due cards that are at critical risk (critical_before <= now). For "Study at-risk only" mode.
   */
  async getDueCardsAtRiskOnly(deckId: string, userId: string): Promise<Card[]> {
    const result = await pool.query<Card>(
      `SELECT * FROM cards
       WHERE deck_id = $1 AND user_id = $2 AND deleted_at IS NULL
         AND next_review <= CURRENT_TIMESTAMP
         AND critical_before IS NOT NULL AND critical_before <= CURRENT_TIMESTAMP
       ORDER BY critical_before ASC`,
      [deckId, userId]
    );
    return result.rows;
  }

  /**
   * Get new cards (not yet reviewed)
   */
  async getNewCards(
    deckId: string,
    userId: string,
    limit: number = 20
  ): Promise<Card[]> {
    const result = await pool.query<Card>(
      `SELECT * FROM cards
       WHERE deck_id = $1 AND user_id = $2 AND deleted_at IS NULL
         AND stability IS NULL
       ORDER BY created_at ASC
       LIMIT $3`,
      [deckId, userId, limit]
    );
    return result.rows;
  }

  /**
   * Reset card stability (treat as new)
   */
  async resetCardStability(cardId: string, userId: string): Promise<Card | null> {
    const result = await pool.query<Card>(
      `UPDATE cards
       SET stability = NULL,
           difficulty = NULL,
           last_review = NULL,
           next_review = CURRENT_TIMESTAMP,
           critical_before = NULL,
           high_risk_before = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
       RETURNING *`,
      [cardId, userId]
    );
    return result.rows[0] || null;
  }

  /**
   * Mark or unmark card importance.
   */
  async updateCardImportance(
    cardId: string,
    userId: string,
    isImportant: boolean
  ): Promise<Card | null> {
    const result = await pool.query<Card>(
      `UPDATE cards
       SET is_important = $1,
           importance_updated_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND user_id = $3 AND deleted_at IS NULL
       RETURNING *`,
      [isImportant, cardId, userId]
    );
    return result.rows[0] || null;
  }
}
