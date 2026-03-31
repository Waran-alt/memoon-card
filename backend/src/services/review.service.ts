/**
 * Single write path for scheduling: persists `review_logs`, updates card FSRS fields, and appends
 * matching `card_journey_events` (e.g. `rating_submitted`) via `CardJourneyService`.
 *
 * Called from card/review routes — keep journey idempotency keys stable when changing payloads.
 */
import { pool } from '../config/database';
import { FSRSState, ReviewResult, createFSRS } from './fsrs.service';
import { CardService } from './card.service';
import { UserSettings } from '../types/database';
import { FSRS_V6_DEFAULT_WEIGHTS, FSRS_CONSTANTS } from '../constants/fsrs.constants';
import { STUDY_INTERVAL } from '../constants/study.constants';
import { CardJourneyService } from './card-journey.service';
import { elapsedDaysAtRetrievability } from './fsrs-core.utils';
import { addDays, addMinutes, toValidDate } from './fsrs-time.utils';
type ReviewTiming = {
  /** Client ms when user revealed the question (front). */
  shownAt?: number;
  /** Client ms when user revealed the answer (back). */
  revealedAt?: number;
  /** Client ms when user submitted rating. */
  ratedAt?: number;
  /** ms from question reveal to answer reveal (stored; FSRS review_duration uses same). */
  thinkingDurationMs?: number;
  clientEventId?: string;
};

/** Coerce to a finite number or null; prevents NaN from being written to the DB. */
function finiteOrNull(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Ensure next_review is strictly after last_review (min STUDY_INTERVAL.MIN_INTERVAL_MINUTES) so the card advances. */
const MIN_NEXT_REVIEW_OFFSET_MS = STUDY_INTERVAL.MIN_INTERVAL_MINUTES * 60 * 1000;
function ensureNextReviewInFuture(lastReview: Date, nextReview: Date): Date {
  if (nextReview.getTime() > lastReview.getTime() + MIN_NEXT_REVIEW_OFFSET_MS) return nextReview;
  return addMinutes(lastReview, STUDY_INTERVAL.MIN_INTERVAL_MINUTES);
}

export class ReviewService {
  private cardService: CardService;
  private journeyService: CardJourneyService;

  // Primary write path reviewCard loads the card with getCardById(cardId, userId) first; keep that invariant for any new entry points.

  constructor() {
    this.cardService = new CardService();
    this.journeyService = new CardJourneyService();
  }

  /**
   * Get user's FSRS settings or defaults
   */
  async getUserSettings(userId: string): Promise<{
    weights: number[];
    targetRetention: number;
  }> {
    const result = await pool.query<UserSettings>(
      'SELECT * FROM user_settings WHERE user_id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      // Return defaults (21 weights)
      return {
        weights: [...FSRS_V6_DEFAULT_WEIGHTS],
        targetRetention: FSRS_CONSTANTS.DEFAULT_TARGET_RETENTION,
      };
    }

    const settings = result.rows[0];
    const rawTargetRetention = Number(settings.target_retention);
    const targetRetention =
      Number.isFinite(rawTargetRetention) &&
      rawTargetRetention >= 0.5 &&
      rawTargetRetention <= 0.99
        ? rawTargetRetention
        : FSRS_CONSTANTS.DEFAULT_TARGET_RETENTION;

    // Ensure weights array has 21 elements (pad or truncate if needed)
    const normalizedWeights = Array.isArray(settings.fsrs_weights)
      ? settings.fsrs_weights.map((weight) => (Number.isFinite(weight) ? weight : 1.0))
      : [];
    const weights = normalizedWeights.length >= 21
      ? normalizedWeights.slice(0, 21)
      : [...normalizedWeights, ...Array(21 - normalizedWeights.length).fill(1.0)];

    return {
      weights,
      targetRetention,
    };
  }

  /**
   * Review a card and update its state
   */
  async reviewCard(
    cardId: string,
    userId: string,
    rating: 1 | 2 | 3 | 4,
    timing?: ReviewTiming
  ): Promise<ReviewResult | null> {
    // Get card
    const card = await this.cardService.getCardById(cardId, userId);
    if (!card) {
      return null;
    }

    // Get user settings
    const settings = await this.getUserSettings(userId);

    // Create FSRS instance
    const fsrs = createFSRS({
      weights: settings.weights,
      targetRetention: settings.targetRetention,
    });

    // Convert card to FSRS state (sanitize so NaN from DB never propagates)
    const nowForState = new Date();
    const cardStability = finiteOrNull(card.stability);
    const cardDifficulty = finiteOrNull(card.difficulty);
    const currentState: FSRSState | null =
      cardStability != null && cardDifficulty != null
        ? {
            stability: cardStability,
            difficulty: cardDifficulty,
            lastReview: card.last_review != null ? toValidDate(card.last_review, nowForState) : null,
            nextReview: toValidDate(card.next_review, nowForState),
          }
        : null;

    // FSRS v6 only (new cards, review, and lapses use the same scheduler)
    const reviewResult = fsrs.reviewCard(currentState, rating);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const lastReview = toValidDate(reviewResult.state.lastReview);
      let nextReview = toValidDate(reviewResult.state.nextReview);
      nextReview = ensureNextReviewInFuture(lastReview, nextReview);
      const stability = reviewResult.state.stability;
      const criticalBefore =
        stability > 0
          ? addDays(lastReview, elapsedDaysAtRetrievability(settings.weights, stability, 0.1))
          : null;
      const highRiskBefore =
        stability > 0
          ? addDays(lastReview, elapsedDaysAtRetrievability(settings.weights, stability, 0.5))
          : null;
      await client.query(
        `UPDATE cards
         SET stability = $1,
             difficulty = $2,
             last_review = $3,
             next_review = $4,
             critical_before = $5,
             high_risk_before = $6,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $7 AND user_id = $8`,
        [
          reviewResult.state.stability,
          reviewResult.state.difficulty,
          lastReview,
          nextReview,
          criticalBefore,
          highRiskBefore,
          cardId,
          userId,
        ]
      );

      const reviewLogId = await this.logReview(
        client,
        cardId,
        userId,
        rating,
        reviewResult,
        currentState,
        undefined,
        undefined,
        timing
      );

      const idBase =
        timing?.clientEventId ?? `${cardId}:${rating}:${Date.now()}`;
      await this.journeyService.appendEvents(
        userId,
        [
          {
            cardId,
            deckId: card.deck_id,
            eventType: 'rating_submitted',
            eventTime: timing?.ratedAt ?? timing?.revealedAt ?? timing?.shownAt ?? Date.now(),
            actor: 'user',
            source: 'review_service',
            idempotencyKey: `review:${idBase}`,
            reviewLogId,
            payload: {
              rating,
              reviewIntervalDays: reviewResult.interval,
            },
          },
        ],
        client
      );

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    return reviewResult;
  }

  /**
   * Log a review for optimization
   * 
   * Follows FSRS Optimizer schema: https://github.com/open-spaced-repetition/fsrs-optimizer
   * 
   * Required fields:
   * - card_id: Flashcard identifier
   * - review_time: Timestamp in milliseconds (UTC)
   * - review_rating: User's rating (1-4)
   * 
   * Optional fields:
   * - review_state: Learning phase (0=New, 1=Learning, 2=Review, 3=Relearning)
   * - review_duration: Time spent reviewing in milliseconds
   */
  private async logReview(
    client: { query: typeof pool.query },
    cardId: string,
    userId: string,
    rating: 1 | 2 | 3 | 4,
    reviewResult: ReviewResult,
    previousState: FSRSState | null,
    reviewDuration?: number, // Time spent reviewing in milliseconds
    reviewState?: 0 | 1 | 2 | 3, // Learning phase
    timing?: ReviewTiming
  ): Promise<string> {
    const now = new Date();
    const reviewTime = now.getTime(); // Timestamp in milliseconds (UTC)
    const thinkingMs =
      timing?.thinkingDurationMs != null && Number.isFinite(timing.thinkingDurationMs)
        ? Math.max(0, Math.round(timing.thinkingDurationMs))
        : timing?.shownAt != null && timing?.revealedAt != null
          ? Math.max(0, Math.round(timing.revealedAt - timing.shownAt))
          : null;
    const duration = reviewDuration ?? (thinkingMs != null ? thinkingMs : undefined);

    let elapsedDays = 0;
    let retrievabilityBefore = null;
    let determinedReviewState: 0 | 1 | 2 | 3 = 0; // Default to New

    if (previousState) {
      const lastReviewTime = previousState.lastReview?.getTime() || previousState.nextReview.getTime();
      elapsedDays = (now.getTime() - lastReviewTime) / (1000 * 60 * 60 * 24);
      
      // Calculate retrievability before review
      const fsrs = createFSRS();
      retrievabilityBefore = fsrs.calculateRetrievability(
        elapsedDays,
        previousState.stability
      );
      
      // Determine review state based on previous state
      // 0=New, 1=Learning, 2=Review, 3=Relearning
      if (previousState.stability === 0 || !previousState.lastReview) {
        determinedReviewState = 0; // New
      } else if (previousState.stability < 1) {
        determinedReviewState = 1; // Learning
      } else if (rating === 1) {
        determinedReviewState = 3; // Relearning (failed)
      } else {
        determinedReviewState = 2; // Review
      }
    } else {
      // New card
      determinedReviewState = 0; // New
    }

    // Use provided reviewState if available, otherwise use determined value
    const finalReviewState = reviewState ?? determinedReviewState;

    const scheduledDays = reviewResult.interval;
    // Never write NaN to DB: coerce to finite number or null (0 for new-card after-state when missing)
    const stabilityBefore = finiteOrNull(previousState?.stability);
    const difficultyBefore = finiteOrNull(previousState?.difficulty);
    const rawStability = reviewResult.state?.stability;
    const rawDifficulty = reviewResult.state?.difficulty;
    const stabilityAfter =
      finiteOrNull(rawStability) ??
      (previousState == null ? 0 : null);
    const difficultyAfter =
      finiteOrNull(rawDifficulty) ??
      (previousState == null ? 0 : null);
    if (stabilityAfter == null && process.env.NODE_ENV !== 'test') {
      console.warn('[review] logReview: stability_after still null', { cardId, rating, hasState: !!reviewResult.state });
    }

    const insertResult = await client.query<{ id: string }>(
      `INSERT INTO review_logs (
        card_id, user_id, rating, review_time, review_state, review_duration,
        shown_at, revealed_at, thinking_duration_ms,
        scheduled_days, elapsed_days, review_date,
        stability_before, difficulty_before, retrievability_before,
        stability_after, difficulty_after
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      RETURNING id`,
      [
        cardId,
        userId,
        rating,
        reviewTime,
        finalReviewState,
        duration ?? null,
        timing?.shownAt ?? null,
        timing?.revealedAt ?? null,
        thinkingMs,
        scheduledDays,
        elapsedDays,
        now,
        stabilityBefore,
        difficultyBefore,
        retrievabilityBefore,
        stabilityAfter,
        difficultyAfter,
      ]
    );
    return String(insertResult.rows[0]?.id);
  }

  /**
   * Batch review multiple cards (no per-card timing; used as fallback path).
   */
  async batchReview(
    reviews: Array<{ cardId: string; rating: 1 | 2 | 3 | 4 }>,
    userId: string
  ): Promise<Array<{ cardId: string; result: ReviewResult | null }>> {
    const results = await Promise.all(
      reviews.map(async ({ cardId, rating }) => ({
        cardId,
        result: await this.reviewCard(cardId, userId, rating, undefined),
      }))
    );
    return results;
  }

  /** Review counts per calendar day for a card (revision history). */
  async getReviewDayCountsForCard(
    cardId: string,
    userId: string,
    options?: { days?: number }
  ): Promise<Array<{ day: string; count: number }>> {
    const days = Math.max(1, Math.min(180, options?.days ?? 90));
    const result = await pool.query<{ day: string; count: string }>(
      `
      SELECT TO_CHAR(review_date::date, 'YYYY-MM-DD') AS day, COUNT(*)::int AS count
      FROM review_logs
      WHERE user_id = $1 AND card_id = $2
        AND review_date >= (CURRENT_DATE - ($3::int * INTERVAL '1 day'))
      GROUP BY review_date::date
      ORDER BY day DESC
      `,
      [userId, cardId, days]
    );
    return result.rows.map((row) => ({
      day: String(row.day),
      count: Number(row.count ?? 0),
    }));
  }

  /**
   * List review logs for a card (for card details / stats view).
   * Card must belong to user (caller should verify via getCardById first).
   */
  async getReviewLogsByCardId(
    cardId: string,
    userId: string,
    options?: { limit?: number }
  ): Promise<Array<{
    id: string;
    rating: number;
    review_time: number;
    review_date: Date;
    scheduled_days: number;
    elapsed_days: number;
    stability_before: number | null;
    difficulty_before: number | null;
    retrievability_before: number | null;
    stability_after: number | null;
    difficulty_after: number | null;
  }>> {
    const limit = Math.min(100, Math.max(1, options?.limit ?? 50));
    const result = await pool.query(
      `SELECT id, rating, review_time, review_date, scheduled_days, elapsed_days,
              stability_before, difficulty_before, retrievability_before,
              stability_after, difficulty_after
       FROM review_logs
       WHERE card_id = $1 AND user_id = $2
       ORDER BY review_time DESC
       LIMIT $3`,
      [cardId, userId, limit]
    );
    return result.rows.map((row) => ({
      id: row.id,
      rating: Number(row.rating),
      review_time: Number(row.review_time),
      review_date: row.review_date,
      scheduled_days: Number(row.scheduled_days),
      elapsed_days: Number(row.elapsed_days),
      stability_before: finiteOrNull(row.stability_before),
      difficulty_before: finiteOrNull(row.difficulty_before),
      retrievability_before: finiteOrNull(row.retrievability_before),
      stability_after: finiteOrNull(row.stability_after),
      difficulty_after: finiteOrNull(row.difficulty_after),
    }));
  }
}
