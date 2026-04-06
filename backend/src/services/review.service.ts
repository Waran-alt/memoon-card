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
import { addDays, addMinutes, isValidDate, toValidDate } from './fsrs-time.utils';
import { ValidationError, ConflictError } from '../utils/errors';

/** Returned from reviewCard / correctLastReviewRating when a review log row exists. */
export type ReviewWithLogId = ReviewResult & { reviewLogId: string };

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
  if (!isValidDate(lastReview)) return addMinutes(toValidDate(undefined), STUDY_INTERVAL.MIN_INTERVAL_MINUTES);
  if (!isValidDate(nextReview)) return addMinutes(lastReview, STUDY_INTERVAL.MIN_INTERVAL_MINUTES);
  if (nextReview.getTime() > lastReview.getTime() + MIN_NEXT_REVIEW_OFFSET_MS) return nextReview;
  return addMinutes(lastReview, STUDY_INTERVAL.MIN_INTERVAL_MINUTES);
}

/** Never pass Invalid Date to PostgreSQL (avoids timestamptz parse errors). */
function timestampForPg(d: Date, fallback: Date = new Date()): Date {
  return isValidDate(d) ? d : fallback;
}

function optionalTimestampForPg(d: Date): Date | null {
  return isValidDate(d) ? d : null;
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
  ): Promise<ReviewWithLogId | null> {
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

    let reviewLogId = '';
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const lastReview = timestampForPg(toValidDate(reviewResult.state.lastReview));
      let nextReview = timestampForPg(toValidDate(reviewResult.state.nextReview));
      nextReview = ensureNextReviewInFuture(lastReview, nextReview);
      nextReview = timestampForPg(nextReview, lastReview);
      const stability = reviewResult.state.stability;
      const criticalBefore =
        stability > 0
          ? optionalTimestampForPg(
              addDays(lastReview, elapsedDaysAtRetrievability(settings.weights, stability, 0.1))
            )
          : null;
      const highRiskBefore =
        stability > 0
          ? optionalTimestampForPg(
              addDays(lastReview, elapsedDaysAtRetrievability(settings.weights, stability, 0.5))
            )
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

      const reviewMoment = new Date();
      reviewLogId = await this.logReview(
        client,
        cardId,
        userId,
        rating,
        reviewResult,
        currentState,
        undefined,
        undefined,
        timing,
        {
          last_review: card.last_review != null ? new Date(card.last_review) : null,
          next_review: card.next_review != null ? new Date(card.next_review) : null,
        },
        reviewMoment
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

    return { ...reviewResult, reviewLogId };
  }

  /**
   * Replace the rating on the latest review log for this card (same review moment, same FSRS step).
   * Recomputes FSRS from snapshot columns on that log row; does not insert a second review log.
   */
  async correctLastReviewRating(
    cardId: string,
    userId: string,
    newRating: 1 | 2 | 3 | 4
  ): Promise<ReviewWithLogId | null> {
    const card = await this.cardService.getCardById(cardId, userId);
    if (!card) return null;

    const settings = await this.getUserSettings(userId);
    const fsrs = createFSRS({
      weights: settings.weights,
      targetRetention: settings.targetRetention,
    });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const logRes = await client.query<
        Record<string, unknown> & {
          id: string;
          rating: number;
          review_date: Date;
          stability_before: unknown;
          difficulty_before: unknown;
          last_review_before: Date | null;
          next_review_before: Date | null;
        }
      >(
        `SELECT rl.id, rl.rating, rl.review_date, rl.review_time,
                rl.stability_before, rl.difficulty_before,
                rl.last_review_before, rl.next_review_before,
                rl.shown_at, rl.revealed_at, rl.thinking_duration_ms
         FROM review_logs rl
         WHERE rl.card_id = $1 AND rl.user_id = $2
         ORDER BY rl.review_time DESC
         LIMIT 1
         FOR UPDATE`,
        [cardId, userId]
      );

      const row = logRes.rows[0];
      if (!row) {
        throw new ValidationError('No review to correct.');
      }

      const logMs = new Date(row.review_date).getTime();
      const cardLastMs = card.last_review != null ? new Date(card.last_review).getTime() : null;
      if (cardLastMs == null || Math.abs(cardLastMs - logMs) > 20_000) {
        throw new ConflictError('Cannot correct: the latest review does not match the card state.');
      }

      const prevStability = finiteOrNull(row.stability_before);
      const prevDifficulty = finiteOrNull(row.difficulty_before);
      let previousState: FSRSState | null = null;
      if (prevStability != null && prevDifficulty != null) {
        if (row.last_review_before == null || row.next_review_before == null) {
          throw new ValidationError('Rating correction is not available for this review.');
        }
        previousState = {
          stability: prevStability,
          difficulty: prevDifficulty,
          lastReview: row.last_review_before != null ? toValidDate(row.last_review_before) : null,
          nextReview: toValidDate(row.next_review_before),
        };
      }

      const reviewMoment = new Date(row.review_date);
      const reviewResult = fsrs.reviewCard(previousState, newRating, { reviewAt: reviewMoment });

      const lastReview = timestampForPg(toValidDate(reviewResult.state.lastReview));
      let nextReview = timestampForPg(toValidDate(reviewResult.state.nextReview));
      nextReview = ensureNextReviewInFuture(lastReview, nextReview);
      nextReview = timestampForPg(nextReview, lastReview);
      const stability = reviewResult.state.stability;
      const criticalBefore =
        stability > 0
          ? optionalTimestampForPg(
              addDays(lastReview, elapsedDaysAtRetrievability(settings.weights, stability, 0.1))
            )
          : null;
      const highRiskBefore =
        stability > 0
          ? optionalTimestampForPg(
              addDays(lastReview, elapsedDaysAtRetrievability(settings.weights, stability, 0.5))
            )
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

      const timing: ReviewTiming | undefined =
        row.shown_at != null || row.revealed_at != null || row.thinking_duration_ms != null
          ? {
              shownAt: row.shown_at != null ? Number(row.shown_at) : undefined,
              revealedAt: row.revealed_at != null ? Number(row.revealed_at) : undefined,
              thinkingDurationMs:
                row.thinking_duration_ms != null ? Number(row.thinking_duration_ms) : undefined,
            }
          : undefined;

      const computed = this.computeReviewLogDerivedFields(
        newRating,
        reviewResult,
        previousState,
        timing,
        reviewMoment
      );

      await client.query(
        `UPDATE review_logs SET
          rating = $1,
          review_state = $2,
          scheduled_days = $3,
          elapsed_days = $4,
          retrievability_before = $5,
          stability_after = $6,
          difficulty_after = $7
        WHERE id = $8`,
        [
          newRating,
          computed.finalReviewState,
          computed.scheduledDays,
          computed.elapsedDays,
          computed.retrievabilityBefore,
          computed.stabilityAfter,
          computed.difficultyAfter,
          row.id,
        ]
      );

      const previousRating = Number(row.rating);
      await this.journeyService.appendEvents(
        userId,
        [
          {
            cardId,
            deckId: card.deck_id ?? null,
            eventType: 'rating_corrected',
            eventTime: Date.now(),
            actor: 'user',
            source: 'review_service',
            idempotencyKey: `rating-corrected:${row.id}:${newRating}:${Date.now()}`,
            reviewLogId: String(row.id),
            payload: {
              previousRating,
              newRating,
              reviewIntervalDays: reviewResult.interval,
            },
          },
        ],
        client
      );

      await client.query('COMMIT');
      return { ...reviewResult, reviewLogId: String(row.id) };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Shared derived fields for INSERT (logReview) and UPDATE (correctLastReviewRating).
   */
  private computeReviewLogDerivedFields(
    rating: 1 | 2 | 3 | 4,
    reviewResult: ReviewResult,
    previousState: FSRSState | null,
    timing: ReviewTiming | undefined,
    reviewMoment: Date,
    reviewState?: 0 | 1 | 2 | 3
  ): {
    finalReviewState: number;
    scheduledDays: number;
    elapsedDays: number;
    retrievabilityBefore: number | null;
    stabilityAfter: number | null;
    difficultyAfter: number | null;
  } {
    let elapsedDays = 0;
    let retrievabilityBefore: number | null = null;
    let determinedReviewState: 0 | 1 | 2 | 3 = 0;

    if (previousState) {
      const lastReviewTime =
        previousState.lastReview != null && isValidDate(previousState.lastReview)
          ? previousState.lastReview.getTime()
          : isValidDate(previousState.nextReview)
            ? previousState.nextReview.getTime()
            : null;
      if (lastReviewTime != null && Number.isFinite(lastReviewTime)) {
        elapsedDays =
          (reviewMoment.getTime() - lastReviewTime) / (1000 * 60 * 60 * 24);
      }

      const fsrs = createFSRS();
      retrievabilityBefore = finiteOrNull(
        fsrs.calculateRetrievability(elapsedDays, previousState.stability)
      );

      if (previousState.stability === 0 || !previousState.lastReview) {
        determinedReviewState = 0;
      } else if (previousState.stability < 1) {
        determinedReviewState = 1;
      } else if (rating === 1) {
        determinedReviewState = 3;
      } else {
        determinedReviewState = 2;
      }
    } else {
      determinedReviewState = 0;
    }

    const finalReviewState = reviewState ?? determinedReviewState;
    const scheduledDays = Number.isFinite(reviewResult.interval) ? reviewResult.interval : 0;
    const rawStability = reviewResult.state?.stability;
    const rawDifficulty = reviewResult.state?.difficulty;
    const stabilityAfter =
      finiteOrNull(rawStability) ?? (previousState == null ? 0 : null);
    const difficultyAfter =
      finiteOrNull(rawDifficulty) ?? (previousState == null ? 0 : null);

    return {
      finalReviewState,
      scheduledDays,
      elapsedDays,
      retrievabilityBefore,
      stabilityAfter,
      difficultyAfter,
    };
  }

  /**
   * Log a review for optimization
   *
   * Follows FSRS Optimizer schema: https://github.com/open-spaced-repetition/fsrs-optimizer
   */
  private async logReview(
    client: { query: typeof pool.query },
    cardId: string,
    userId: string,
    rating: 1 | 2 | 3 | 4,
    reviewResult: ReviewResult,
    previousState: FSRSState | null,
    reviewDuration: number | undefined,
    reviewState: 0 | 1 | 2 | 3 | undefined,
    timing: ReviewTiming | undefined,
    cardSnapshotBefore: { last_review: Date | null; next_review: Date | null },
    reviewMoment: Date
  ): Promise<string> {
    const reviewTime = reviewMoment.getTime();
    const thinkingMs =
      timing?.thinkingDurationMs != null && Number.isFinite(timing.thinkingDurationMs)
        ? Math.max(0, Math.round(timing.thinkingDurationMs))
        : timing?.shownAt != null && timing?.revealedAt != null
          ? Math.max(0, Math.round(timing.revealedAt - timing.shownAt))
          : null;
    const duration = reviewDuration ?? (thinkingMs != null ? thinkingMs : undefined);

    const derived = this.computeReviewLogDerivedFields(
      rating,
      reviewResult,
      previousState,
      timing,
      reviewMoment,
      reviewState
    );

    const stabilityBefore = finiteOrNull(previousState?.stability);
    const difficultyBefore = finiteOrNull(previousState?.difficulty);
    if (derived.stabilityAfter == null && process.env.NODE_ENV !== 'test') {
      console.warn('[review] logReview: stability_after still null', {
        cardId,
        rating,
        hasState: !!reviewResult.state,
      });
    }

    const insertResult = await client.query<{ id: string }>(
      `INSERT INTO review_logs (
        card_id, user_id, rating, review_time, review_state, review_duration,
        shown_at, revealed_at, thinking_duration_ms,
        scheduled_days, elapsed_days, review_date,
        stability_before, difficulty_before, retrievability_before,
        stability_after, difficulty_after,
        last_review_before, next_review_before
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
      RETURNING id`,
      [
        cardId,
        userId,
        rating,
        reviewTime,
        derived.finalReviewState,
        duration ?? null,
        timing?.shownAt ?? null,
        timing?.revealedAt ?? null,
        thinkingMs,
        derived.scheduledDays,
        derived.elapsedDays,
        reviewMoment,
        stabilityBefore,
        difficultyBefore,
        derived.retrievabilityBefore,
        derived.stabilityAfter,
        derived.difficultyAfter,
        cardSnapshotBefore.last_review,
        cardSnapshotBefore.next_review,
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
  ): Promise<Array<{ cardId: string; result: ReviewWithLogId | null }>> {
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
