import { pool } from '../config/database';
import { FSRSState, ReviewResult, createFSRS } from './fsrs.service';
import { CardService } from './card.service';
import { UserSettings, Card } from '../types/database';
import { FSRS_V6_DEFAULT_WEIGHTS, FSRS_CONSTANTS } from '../constants/fsrs.constants';

export class ReviewService {
  private cardService: CardService;

  constructor() {
    this.cardService = new CardService();
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
    // Ensure weights array has 21 elements (pad or truncate if needed)
    const weights = settings.fsrs_weights.length >= 21
      ? settings.fsrs_weights.slice(0, 21)
      : [...settings.fsrs_weights, ...Array(21 - settings.fsrs_weights.length).fill(1.0)];
    
    return {
      weights,
      targetRetention: settings.target_retention,
    };
  }

  /**
   * Review a card and update its state
   */
  async reviewCard(
    cardId: string,
    userId: string,
    rating: 1 | 2 | 3 | 4,
    timing?: { shownAt?: number; revealedAt?: number; sessionId?: string }
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

    // Update card state
    await this.cardService.updateCardState(cardId, userId, reviewResult.state);

    // Log review
    await this.logReview(cardId, userId, rating, reviewResult, currentState, undefined, undefined, timing);

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
    cardId: string,
    userId: string,
    rating: 1 | 2 | 3 | 4,
    reviewResult: ReviewResult,
    previousState: FSRSState | null,
    reviewDuration?: number, // Time spent reviewing in milliseconds
    reviewState?: 0 | 1 | 2 | 3, // Learning phase
    timing?: { shownAt?: number; revealedAt?: number; sessionId?: string }
  ): Promise<void> {
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

    await pool.query(
      `INSERT INTO review_logs (
        card_id, user_id, rating, review_time, review_state, review_duration,
        shown_at, revealed_at, session_id,
        scheduled_days, elapsed_days, review_date,
        stability_before, difficulty_before, retrievability_before
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
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
    await this.cardService.updateCardState(cardId, userId, newState);
    return this.cardService.getCardById(cardId, userId);
  }
}
