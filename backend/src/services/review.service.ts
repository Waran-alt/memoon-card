import { pool } from '../config/database';
import { ReviewLog } from '../types/database';
import { FSRSState, ReviewResult, createFSRS } from './fsrs.service';
import { CardService } from './card.service';
import { UserSettings } from '../types/database';

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
        weights: [
          0.4, 0.9, 2.3, 10.9, 4.93, 0.94, 0.86, 0.01, 1.49, 0.14, 0.94,
          2.18, 0.05, 0.34, 1.26, 0.29, 2.61, 0.5, 0.3, 0.8, 9.0, 1.0,
        ],
        targetRetention: 0.9,
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
    rating: 1 | 2 | 3 | 4
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
    await this.logReview(cardId, userId, rating, reviewResult, currentState);

    return reviewResult;
  }

  /**
   * Log a review for optimization
   */
  private async logReview(
    cardId: string,
    userId: string,
    rating: 1 | 2 | 3 | 4,
    reviewResult: ReviewResult,
    previousState: FSRSState | null
  ): Promise<void> {
    const now = new Date();
    let elapsedDays = 0;
    let retrievabilityBefore = null;

    if (previousState) {
      const lastReviewTime = previousState.lastReview?.getTime() || previousState.nextReview.getTime();
      elapsedDays = (now.getTime() - lastReviewTime) / (1000 * 60 * 60 * 24);
      
      // Calculate retrievability before review
      const fsrs = createFSRS();
      retrievabilityBefore = fsrs.calculateRetrievability(
        elapsedDays,
        previousState.stability
      );
    }

    const scheduledDays = reviewResult.interval;

    await pool.query(
      `INSERT INTO review_logs (
        card_id, user_id, rating, scheduled_days, elapsed_days,
        review_date, stability_before, difficulty_before, retrievability_before
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        cardId,
        userId,
        rating,
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
}
