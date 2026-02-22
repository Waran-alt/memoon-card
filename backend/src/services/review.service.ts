import { pool } from '../config/database';
import { FSRSState, ReviewResult, createFSRS } from './fsrs.service';
import { CardService } from './card.service';
import { UserSettings, Card } from '../types/database';
import { FSRS_V6_DEFAULT_WEIGHTS, FSRS_CONSTANTS } from '../constants/fsrs.constants';
import { ShortLoopPolicyService, StudyIntensityMode } from './short-loop-policy.service';
import { StudyEventsService } from './study-events.service';
import { CardJourneyService } from './card-journey.service';
import { elapsedDaysAtRetrievability } from './fsrs-core.utils';
import { addDays } from './fsrs-time.utils';

type ReviewTiming = {
  shownAt?: number;
  revealedAt?: number;
  sessionId?: string;
  sequenceInSession?: number;
  clientEventId?: string;
  intensityMode?: StudyIntensityMode;
};

export class ReviewService {
  private cardService: CardService;
  private shortLoopPolicy: ShortLoopPolicyService;
  private studyEventsService: StudyEventsService;
  private journeyService: CardJourneyService;

  constructor() {
    this.cardService = new CardService();
    this.shortLoopPolicy = new ShortLoopPolicyService();
    this.studyEventsService = new StudyEventsService();
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

    // Convert card to FSRS state
    const currentState: FSRSState | null = card.stability !== null
      ? {
          stability: card.stability,
          difficulty: card.difficulty!,
          lastReview: card.last_review,
          nextReview: card.next_review,
        }
      : null;

    // Review card
    const reviewResult = fsrs.reviewCard(currentState, rating);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const lastReview = reviewResult.state.lastReview!;
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
          reviewResult.state.lastReview,
          reviewResult.state.nextReview,
          criticalBefore,
          highRiskBefore,
          cardId,
          userId,
        ]
      );

      const shortLoopDecision = await this.shortLoopPolicy.evaluateAndPersist({
        client,
        userId,
        card,
        rating,
        sessionId: timing?.sessionId,
        intensityMode: timing?.intensityMode,
      });

      const reviewLogId = await this.logReview(
        client,
        cardId,
        userId,
        rating,
        reviewResult,
        currentState,
        undefined,
        undefined,
        timing,
        shortLoopDecision
      );

      await this.studyEventsService.logEvents(userId, [
        {
          eventType: 'rating_submitted',
          clientEventId: timing?.clientEventId,
          sessionId: timing?.sessionId,
          cardId,
          deckId: card.deck_id,
          occurredAtClient: timing?.revealedAt ?? timing?.shownAt,
          sequenceInSession: timing?.sequenceInSession,
          payload: {
            rating,
            reviewIntervalDays: reviewResult.interval,
            shortLoopDecision,
          },
        },
        {
          eventType: 'short_loop_decision',
          sessionId: timing?.sessionId,
          cardId,
          deckId: card.deck_id,
          sequenceInSession: timing?.sequenceInSession,
          payload: shortLoopDecision,
        },
      ], client);

      const idBase =
        timing?.clientEventId ??
        `${cardId}:${rating}:${timing?.sessionId ?? 'none'}:${timing?.sequenceInSession ?? 0}:${Date.now()}`;
      await this.journeyService.appendEvents(
        userId,
        [
          {
            cardId,
            deckId: card.deck_id,
            sessionId: timing?.sessionId,
            eventType: 'rating_submitted',
            eventTime: timing?.revealedAt ?? timing?.shownAt ?? Date.now(),
            actor: 'user',
            source: 'review_service',
            idempotencyKey: `review:${idBase}`,
            reviewLogId,
            payload: {
              rating,
              reviewIntervalDays: reviewResult.interval,
              shortLoopDecision,
            },
          },
          {
            cardId,
            deckId: card.deck_id,
            sessionId: timing?.sessionId,
            eventType: 'short_loop_decision',
            eventTime: Date.now(),
            actor: 'system',
            source: 'review_service',
            idempotencyKey: `review-decision:${idBase}`,
            payload: shortLoopDecision as unknown as Record<string, unknown>,
          },
        ],
        client
      );

      await client.query('COMMIT');
      reviewResult.shortLoopDecision = shortLoopDecision;
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
    timing?: ReviewTiming,
    shortLoopDecision?: ReviewResult['shortLoopDecision']
  ): Promise<string> {
    const now = new Date();
    const reviewTime = now.getTime(); // Timestamp in milliseconds (UTC)
    const duration =
      reviewDuration ??
      (timing?.shownAt != null ? Math.max(0, Math.round(reviewTime - timing.shownAt)) : undefined);
    
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

    const insertResult = await client.query<{ id: string }>(
      `INSERT INTO review_logs (
        card_id, user_id, rating, review_time, review_state, review_duration,
        shown_at, revealed_at, session_id,
        loop_iteration, adaptive_gap_seconds, fatigue_score_at_review, importance_mode, policy_decision_code,
        scheduled_days, elapsed_days, review_date,
        stability_before, difficulty_before, retrievability_before
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
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
        timing?.sessionId ?? null,
        shortLoopDecision?.loopIteration ?? null,
        shortLoopDecision?.nextGapSeconds ?? null,
        shortLoopDecision?.fatigueScore ?? null,
        shortLoopDecision?.importanceMode ?? null,
        shortLoopDecision?.reason ?? null,
        scheduledDays,
        elapsedDays,
        now,
        previousState?.stability || null,
        previousState?.difficulty || null,
        retrievabilityBefore,
      ]
    );
    return String(insertResult.rows[0]?.id);
  }

  /**
   * Batch review multiple cards
   */
  async batchReview(
    reviews: Array<{ cardId: string; rating: 1 | 2 | 3 | 4 }>,
    userId: string
  ): Promise<Array<{ cardId: string; result: ReviewResult | null }>> {
    const results = await Promise.all(
      reviews.map(async ({ cardId, rating }) => ({
        cardId,
        result: await this.reviewCard(cardId, userId, rating),
      }))
    );
    return results;
  }

  async getUserStudyIntensity(
    userId: string
  ): Promise<'light' | 'default' | 'intensive'> {
    const result = await pool.query<{ study_intensity_mode: string }>(
      'SELECT study_intensity_mode FROM user_settings WHERE user_id = $1',
      [userId]
    );
    const value = result.rows[0]?.study_intensity_mode;
    if (value === 'light' || value === 'intensive') return value;
    return 'default';
  }

  async updateUserStudyIntensity(
    userId: string,
    intensityMode: 'light' | 'default' | 'intensive'
  ): Promise<'light' | 'default' | 'intensive'> {
    await pool.query(
      `INSERT INTO user_settings (user_id, fsrs_weights, target_retention, study_intensity_mode, updated_at)
       VALUES ($1, $2::float8[], $3, $4, NOW())
       ON CONFLICT (user_id)
       DO UPDATE SET
         study_intensity_mode = $4,
         updated_at = NOW()`,
      [userId, FSRS_V6_DEFAULT_WEIGHTS, FSRS_CONSTANTS.DEFAULT_TARGET_RETENTION, intensityMode]
    );
    return intensityMode;
  }

  /**
   * Apply management penalty (push next review forward) when user saw card content
   * outside of study (e.g. while editing). New cards (stability null) are unchanged.
   */
  async applyManagementPenaltyToCard(
    cardId: string,
    userId: string,
    revealedForSeconds: number = 30
  ): Promise<Card | null> {
    const card = await this.cardService.getCardById(cardId, userId);
    if (!card) return null;
    if (card.stability === null) return card; // New card, nothing to postpone

    const settings = await this.getUserSettings(userId);
    const fsrs = createFSRS({
      weights: settings.weights,
      targetRetention: settings.targetRetention,
    });

    const state: FSRSState = {
      stability: card.stability,
      difficulty: card.difficulty!,
      lastReview: card.last_review,
      nextReview: card.next_review,
    };
    const newState = fsrs.applyManagementPenalty(state, revealedForSeconds);
    const lastReview = newState.lastReview!;
    const stability = newState.stability;
    const criticalBefore =
      stability > 0
        ? addDays(lastReview, elapsedDaysAtRetrievability(settings.weights, stability, 0.1))
        : null;
    const highRiskBefore =
      stability > 0
        ? addDays(lastReview, elapsedDaysAtRetrievability(settings.weights, stability, 0.5))
        : null;
    await this.cardService.updateCardState(cardId, userId, newState, {
      criticalBefore,
      highRiskBefore,
    });
    return this.cardService.getCardById(cardId, userId);
  }
}
