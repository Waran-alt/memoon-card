import { pool } from '../config/database';
import {
  Card,
  CreateCardRequest,
  UpdateCardRequest,
  ExportCardItem,
  ImportCardItem,
} from '../types/database';
import { FSRSState } from '../services/fsrs.service';
import { sanitizeHtml } from '../utils/sanitize';
import { elapsedDaysAtRetrievability } from './fsrs-core.utils';
import { addDays } from './fsrs-time.utils';

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

    const knowledgeId = data.knowledge_id ?? null;
    const result = await pool.query<Card>(
      `INSERT INTO cards (
        user_id, deck_id, recto, verso, comment,
        recto_image, verso_image, recto_formula, verso_formula, reverse, knowledge_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
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
        knowledgeId,
      ]
    );
    return result.rows[0];
  }

  /**
   * Create a card with optional FSRS metadata (for import with applyMetadata).
   * When metadata is provided, inserts with stability, difficulty, last_review, next_review, is_important.
   */
  async createCardWithOptionalMetadata(
    deckId: string,
    userId: string,
    data: {
      recto: string;
      verso: string;
      comment?: string | null;
      reverse?: boolean;
      recto_formula?: boolean;
      verso_formula?: boolean;
      stability?: number | null;
      difficulty?: number | null;
      next_review?: string | null;
      last_review?: string | null;
      is_important?: boolean;
    }
  ): Promise<Card> {
    const sanitizedRecto = sanitizeHtml(data.recto);
    const sanitizedVerso = sanitizeHtml(data.verso);
    const sanitizedComment = data.comment ? sanitizeHtml(data.comment) : null;
    const reverse = data.reverse !== undefined ? data.reverse : true;
    const rectoFormula = data.recto_formula ?? false;
    const versoFormula = data.verso_formula ?? false;
    const isImportant = data.is_important ?? false;

    const hasMetadata =
      data.stability != null ||
      data.difficulty != null ||
      (data.next_review != null && data.next_review !== '') ||
      (data.last_review != null && data.last_review !== '');

    if (!hasMetadata) {
      return this.createCard(deckId, userId, {
        recto: data.recto,
        verso: data.verso,
        comment: data.comment ?? undefined,
        reverse,
        recto_formula: rectoFormula,
        verso_formula: versoFormula,
      });
    }

    const nextReview = data.next_review ? new Date(data.next_review) : new Date();
    const lastReview = data.last_review ? new Date(data.last_review) : null;
    const stability = data.stability ?? null;
    const difficulty = data.difficulty ?? null;

    const result = await pool.query<Card>(
      `INSERT INTO cards (
        user_id, deck_id, recto, verso, comment,
        recto_image, verso_image, recto_formula, verso_formula, reverse, knowledge_id,
        stability, difficulty, last_review, next_review, is_important
      )
      VALUES ($1, $2, $3, $4, $5, NULL, NULL, $6, $7, $8, NULL, $9, $10, $11, $12, $13)
      RETURNING *`,
      [
        userId,
        deckId,
        sanitizedRecto,
        sanitizedVerso,
        sanitizedComment,
        rectoFormula,
        versoFormula,
        reverse,
        stability,
        difficulty,
        lastReview,
        nextReview,
        isImportant,
      ]
    );
    return result.rows[0];
  }

  /**
   * Build export list for a deck (content-only or full with metadata).
   */
  async getCardsForExport(
    deckId: string,
    userId: string,
    format: 'content' | 'full'
  ): Promise<ExportCardItem[]> {
    const cards = await this.getCardsByDeckId(deckId, userId);
    return cards.map((c) => {
      const item: ExportCardItem = {
        recto: c.recto,
        verso: c.verso,
        comment: c.comment ?? null,
        reverse: c.reverse,
        recto_formula: c.recto_formula,
        verso_formula: c.verso_formula,
      };
      if (format === 'full') {
        item.stability = c.stability ?? null;
        item.difficulty = c.difficulty ?? null;
        item.next_review = c.next_review ? c.next_review.toISOString() : null;
        item.last_review = c.last_review ? c.last_review.toISOString() : null;
        item.is_important = c.is_important ?? false;
      }
      return item;
    });
  }

  /**
   * Import cards into a deck. When options.applyMetadata is true, uses metadata from payload when present.
   */
  async importCards(
    deckId: string,
    userId: string,
    cards: ImportCardItem[],
    options: { applyMetadata?: boolean }
  ): Promise<Card[]> {
    const applyMetadata = options.applyMetadata === true;
    const created: Card[] = [];
    for (const item of cards) {
      const card = applyMetadata
        ? await this.createCardWithOptionalMetadata(deckId, userId, {
            recto: item.recto,
            verso: item.verso,
            comment: item.comment ?? null,
            reverse: item.reverse,
            recto_formula: item.recto_formula,
            verso_formula: item.verso_formula,
            stability: item.stability,
            difficulty: item.difficulty,
            next_review: item.next_review ?? null,
            last_review: item.last_review ?? null,
            is_important: item.is_important,
          })
        : await this.createCard(deckId, userId, {
            recto: item.recto,
            verso: item.verso,
            comment: item.comment ?? undefined,
            reverse: item.reverse,
            recto_formula: item.recto_formula,
            verso_formula: item.verso_formula,
          });
      created.push(card);
    }
    return created;
  }

  /**
   * Create a reversed card from an existing card, same deck and knowledge.
   * Optionally pass newCardOverrides for the new card's content (e.g. from two-zone UI); otherwise uses swapped recto/verso from source.
   * Sets both cards' reverse_card_id to form the pair.
   */
  async createReversedCard(
    sourceCardId: string,
    userId: string,
    newCardOverrides?: { recto: string; verso: string; comment?: string | null }
  ): Promise<Card | null> {
    const source = await this.getCardById(sourceCardId, userId);
    if (!source) return null;
    const reversed = await this.createCard(source.deck_id, userId, {
      recto: newCardOverrides?.recto ?? source.verso,
      verso: newCardOverrides?.verso ?? source.recto,
      comment: (newCardOverrides?.comment !== undefined ? newCardOverrides.comment : source.comment) ?? undefined,
      recto_image: source.verso_image ?? undefined,
      verso_image: source.recto_image ?? undefined,
      recto_formula: source.recto_formula,
      verso_formula: source.verso_formula,
      reverse: true,
      knowledge_id: source.knowledge_id ?? undefined,
    });
    await pool.query(
      `UPDATE cards SET reverse_card_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND user_id = $3`,
      [reversed.id, source.id, userId]
    );
    await pool.query(
      `UPDATE cards SET reverse_card_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND user_id = $3`,
      [source.id, reversed.id, userId]
    );
    return this.getCardById(reversed.id, userId);
  }

  /**
   * Create two cards as a reverse pair (same knowledge_id, mutual reverse_card_id).
   * Returns [cardA, cardB] in order.
   */
  async createCardPair(
    deckId: string,
    userId: string,
    knowledgeId: string | null,
    cardA: CreateCardRequest,
    cardB: CreateCardRequest
  ): Promise<[Card, Card]> {
    const a = await this.createCard(deckId, userId, { ...cardA, knowledge_id: knowledgeId ?? undefined });
    const b = await this.createCard(deckId, userId, { ...cardB, knowledge_id: knowledgeId ?? undefined });
    await pool.query(
      `UPDATE cards SET reverse_card_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND user_id = $3`,
      [b.id, a.id, userId]
    );
    await pool.query(
      `UPDATE cards SET reverse_card_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND user_id = $3`,
      [a.id, b.id, userId]
    );
    const aUpdated = await this.getCardById(a.id, userId);
    const bUpdated = await this.getCardById(b.id, userId);
    return [aUpdated!, bUpdated!];
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
   * Recompute critical_before and high_risk_before for all of a user's cards using the given weights.
   * Call after user's fsrs_weights change (optimizer run or snapshot activation).
   * New cards (stability NULL) get both timestamps set to NULL.
   */
  async recomputeRiskTimestampsForUser(userId: string, weights: number[]): Promise<number> {
    const result = await pool.query<{ id: string; stability: number | null; last_review: Date | null }>(
      `SELECT id, stability, last_review FROM cards
       WHERE user_id = $1 AND deleted_at IS NULL`,
      [userId]
    );
    const rows = result.rows;
    if (rows.length === 0) return 0;

    const ids: string[] = [];
    const criticalBefores: (Date | null)[] = [];
    const highRiskBefores: (Date | null)[] = [];

    for (const row of rows) {
      ids.push(row.id);
      if (row.stability == null || row.stability <= 0 || row.last_review == null) {
        criticalBefores.push(null);
        highRiskBefores.push(null);
      } else {
        criticalBefores.push(
          addDays(row.last_review, elapsedDaysAtRetrievability(weights, row.stability, 0.1))
        );
        highRiskBefores.push(
          addDays(row.last_review, elapsedDaysAtRetrievability(weights, row.stability, 0.5))
        );
      }
    }

    await pool.query(
      `UPDATE cards AS c
       SET critical_before = d.cb, high_risk_before = d.hrb, updated_at = CURRENT_TIMESTAMP
       FROM (
         SELECT unnest($1::uuid[]) AS id, unnest($2::timestamptz[]) AS cb, unnest($3::timestamptz[]) AS hrb
       ) AS d
       WHERE c.id = d.id AND c.user_id = $4`,
      [ids, criticalBefores, highRiskBefores, userId]
    );
    return rows.length;
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
