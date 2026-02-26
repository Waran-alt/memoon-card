import { pool } from '../config/database';
import { FSRSState, ReviewResult, createFSRS } from './fsrs.service';
import { CardService } from './card.service';
import { UserSettings, Card } from '../types/database';
import { FSRS_V6_DEFAULT_WEIGHTS, FSRS_CONSTANTS } from '../constants/fsrs.constants';
import { StudyEventsService } from './study-events.service';
import { CardJourneyService } from './card-journey.service';
import { LearningConfigService, type LearningConfig } from './learning-config.service';
import {
  getInitialShortStabilityMinutes,
  updateShortStability,
  predictIntervalMinutes,
  clampIntervalMinutes,
  shouldGraduateShortTerm,
  type Rating,
} from './short-fsrs.service';
import { elapsedDaysAtRetrievability } from './fsrs-core.utils';
import { addDays, addMinutes, toValidDate } from './fsrs-time.utils';
type ReviewTiming = {
  shownAt?: number;
  revealedAt?: number;
  sessionId?: string;
  sequenceInSession?: number;
  clientEventId?: string;
  intensityMode?: 'light' | 'default' | 'intensive';
};

export class ReviewService {
  private cardService: CardService;
  private studyEventsService: StudyEventsService;
  private journeyService: CardJourneyService;
  private learningConfigService: LearningConfigService;

  constructor() {
    this.cardService = new CardService();
    this.studyEventsService = new StudyEventsService();
    this.journeyService = new CardJourneyService();
    this.learningConfigService = new LearningConfigService();
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

    // Convert card to FSRS state (sanitize dates so invalid DB values don't produce NaN timestamps)
    const nowForState = new Date();
    const currentState: FSRSState | null = card.stability !== null
      ? {
          stability: card.stability,
          difficulty: card.difficulty!,
          lastReview: card.last_review != null ? toValidDate(card.last_review, nowForState) : null,
          nextReview: toValidDate(card.next_review, nowForState),
        }
      : null;

    const shortTermEnabled = await this.learningConfigService.isShortTermLearningEnabled(userId);
    const learningConfig = shortTermEnabled
      ? await this.learningConfigService.getLearningConfig(userId)
      : null;

    const inLearning = card.short_stability_minutes != null;
    const isNewCard = card.stability === null;
    const isLapse = !isNewCard && rating === 1;
    const lapseEntersLearning =
      isLapse &&
      learningConfig &&
      this.learningConfigService.shouldApplyLearningToLapse(card, learningConfig);

    if (
      shortTermEnabled &&
      learningConfig &&
      (isNewCard || inLearning || lapseEntersLearning)
    ) {
      return this.reviewCardShortFSRS(
        cardId,
        userId,
        card,
        rating,
        currentState,
        settings,
        learningConfig,
        timing,
        fsrs
      );
    }

    // Review card (normal FSRS path)
    const reviewResult = fsrs.reviewCard(currentState, rating);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const lastReview = toValidDate(reviewResult.state.lastReview);
      const nextReview = toValidDate(reviewResult.state.nextReview);
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
          },
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
   * Short-FSRS path: new card, lapse entering learning, or card in learning.
   * Updates short-term state, predicts next review, or graduates and runs FSRS once.
   */
  private async reviewCardShortFSRS(
    cardId: string,
    userId: string,
    card: Card,
    rating: Rating,
    currentState: FSRSState | null,
    settings: { weights: number[]; targetRetention: number },
    learningConfig: LearningConfig,
    timing: ReviewTiming | undefined,
    fsrs: ReturnType<typeof createFSRS>
  ): Promise<ReviewResult | null> {
    const now = new Date();
    const inLearning = card.short_stability_minutes != null;
    const isNewCard = card.stability === null;
    const isLapse = !isNewCard && rating === 1;

    let stability: number;
    let difficulty: number;
    let lastReview: Date;
    let nextReview: Date;
    let criticalBefore: Date | null = null;
    let highRiskBefore: Date | null = null;
    let shortStabilityMinutes: number | null = null;
    let learningReviewCount: number | null = null;
    let learningReviewCountAtGraduate: number | null = null;
    let graduatedFromLearningAt: Date | null = null;
    let reviewState: 0 | 1 | 2 | 3 = 0;
    let intervalDays: number;
    const targetRetention = learningConfig.targetRetentionShort;
    const minMin = learningConfig.minIntervalMinutes;
    const maxMin = learningConfig.maxIntervalMinutes;
    const capDays = learningConfig.graduationCapDays;
    const maxAttempts = learningConfig.maxAttemptsBeforeGraduate;

    if (isNewCard) {
      const sShort = getInitialShortStabilityMinutes(rating, learningConfig.shortFsrsParams);
      let intervalMin = predictIntervalMinutes(sShort, targetRetention);
      intervalMin = clampIntervalMinutes(intervalMin, minMin, maxMin);
      nextReview = addMinutes(now, intervalMin);
      lastReview = now;
      stability = 0;
      difficulty = 0;
      shortStabilityMinutes = sShort;
      learningReviewCount = 1;
      intervalDays = intervalMin / (24 * 60);
      reviewState = 0;
    } else if (isLapse && learningConfig.applyToLapses !== 'off') {
      const lapseResult = fsrs.reviewCard(currentState!, 1);
      stability = lapseResult.state.stability;
      difficulty = lapseResult.state.difficulty;
      lastReview = lapseResult.state.lastReview!;
      criticalBefore =
        stability > 0
          ? addDays(lastReview, elapsedDaysAtRetrievability(settings.weights, stability, 0.1))
          : null;
      highRiskBefore =
        stability > 0
          ? addDays(lastReview, elapsedDaysAtRetrievability(settings.weights, stability, 0.5))
          : null;
      const sShort = getInitialShortStabilityMinutes(rating, learningConfig.shortFsrsParams);
      let intervalMin = predictIntervalMinutes(sShort, targetRetention);
      intervalMin = clampIntervalMinutes(intervalMin, minMin, maxMin);
      nextReview = addMinutes(now, intervalMin);
      shortStabilityMinutes = sShort;
      learningReviewCount = 1;
      intervalDays = intervalMin / (24 * 60);
      reviewState = 3;
    } else if (inLearning) {
      lastReview = now;
      const elapsedMinutes = card.last_review
        ? (now.getTime() - new Date(card.last_review).getTime()) / (60 * 1000)
        : 0;
      const sShortOld = card.short_stability_minutes ?? getInitialShortStabilityMinutes(rating, learningConfig.shortFsrsParams);
      const sShortNew = updateShortStability(sShortOld, Math.max(0, elapsedMinutes), rating, learningConfig.shortFsrsParams);
      const countNew = (card.learning_review_count ?? 0) + 1;
      let intervalMin = predictIntervalMinutes(sShortNew, targetRetention);
      intervalMin = clampIntervalMinutes(intervalMin, minMin, maxMin);

      const forceGraduate = countNew >= maxAttempts;
      const graduateByInterval = shouldGraduateShortTerm(intervalMin, capDays);
      const graduate = forceGraduate || graduateByInterval;

      if (graduate) {
        const gradState: FSRSState | null =
          card.stability != null
            ? {
                stability: card.stability,
                difficulty: card.difficulty!,
                lastReview: card.last_review != null ? toValidDate(card.last_review, now) : null,
                nextReview: toValidDate(card.next_review, now),
              }
            : null;
        const gradResult = fsrs.reviewCard(gradState, rating);
        stability = gradResult.state.stability;
        difficulty = gradResult.state.difficulty;
        nextReview = gradResult.state.nextReview;
        criticalBefore =
          stability > 0
            ? addDays(lastReview, elapsedDaysAtRetrievability(settings.weights, stability, 0.1))
            : null;
        highRiskBefore =
          stability > 0
            ? addDays(lastReview, elapsedDaysAtRetrievability(settings.weights, stability, 0.5))
            : null;
        shortStabilityMinutes = null;
        learningReviewCountAtGraduate = countNew;
        learningReviewCount = null;
        graduatedFromLearningAt = now;
        intervalDays = gradResult.interval;
        reviewState = 2;
      } else {
        nextReview = addMinutes(now, intervalMin);
        stability = card.stability ?? 0;
        difficulty = card.difficulty ?? 0;
        criticalBefore = card.critical_before ?? null;
        highRiskBefore = card.high_risk_before ?? null;
        shortStabilityMinutes = sShortNew;
        learningReviewCount = countNew;
        intervalDays = intervalMin / (24 * 60);
        reviewState = 1;
      }
    } else {
      return null;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      await client.query(
        `UPDATE cards
         SET stability = $1, difficulty = $2, last_review = $3, next_review = $4,
             critical_before = $5, high_risk_before = $6,
             short_stability_minutes = $7, learning_review_count = $8, graduated_from_learning_at = $9,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $10 AND user_id = $11`,
        [
          stability,
          difficulty,
          toValidDate(lastReview),
          toValidDate(nextReview),
          criticalBefore != null ? toValidDate(criticalBefore) : null,
          highRiskBefore != null ? toValidDate(highRiskBefore) : null,
          shortStabilityMinutes,
          learningReviewCount,
          graduatedFromLearningAt != null ? toValidDate(graduatedFromLearningAt) : null,
          cardId,
          userId,
        ]
      );

      const learningState = graduatedFromLearningAt != null
          ? { phase: 'graduated' as const, nextReviewInDays: intervalDays, learningReviewCount: learningReviewCountAtGraduate ?? undefined }
          : shortStabilityMinutes != null
            ? { phase: 'learning' as const, nextReviewInMinutes: Math.round((nextReview.getTime() - now.getTime()) / (60 * 1000)), learningReviewCount: learningReviewCount ?? undefined }
            : undefined;
        const message = graduatedFromLearningAt != null
            ? (intervalDays >= 1 ? `Next review in ${Math.round(intervalDays)} day(s)` : `Next review in ${(intervalDays * 24).toFixed(0)} hour(s)`)
            : `Next in ${Math.round((nextReview.getTime() - now.getTime()) / (60 * 1000))} min`;
        const syntheticResult: ReviewResult = {
          state: {
            stability,
            difficulty,
            lastReview,
            nextReview,
          },
          retrievability: 0,
          interval: intervalDays,
          message,
          learningState,
        };

      await this.logReview(
        client,
        cardId,
        userId,
        rating,
        syntheticResult,
        currentState,
        undefined,
        reviewState,
        timing
      );

      await client.query('COMMIT');
      return syntheticResult;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
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
        scheduled_days, elapsed_days, review_date,
        stability_before, difficulty_before, retrievability_before
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
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

    const nowFallback = new Date();
    const state: FSRSState = {
      stability: card.stability,
      difficulty: card.difficulty!,
      lastReview: card.last_review != null ? toValidDate(card.last_review, nowFallback) : null,
      nextReview: toValidDate(card.next_review, nowFallback),
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
