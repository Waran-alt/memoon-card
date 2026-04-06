/**
 * FSRS (Free Spaced Repetition Scheduler) Implementation
 * 
 * This file implements FSRS v6 with full 21-weight support.
 * Based on the algorithm by Jarrett Ye and the open-spaced-repetition project.
 * 
 * FSRS v6 Features:
 * - Same-day review handling (w₁₇, w₁₈, w₁₉)
 * - Overdue factor (w₂₀) for better long-break handling
 * - Extended parameter (w₂₁) for advanced tuning
 * - Unified learning phase (no separate learning steps needed)
 * 
 * References:
 * - https://github.com/open-spaced-repetition/fsrs4anki
 * - https://github.com/open-spaced-repetition/free-spaced-repetition-scheduler
 *
 * Pure scheduling math: no I/O; card state is supplied by callers (ReviewService / routes) after ownership checks.
 */

import {
  FSRS_V6_DEFAULT_WEIGHTS,
  FSRS_CONSTANTS,
  RETRIEVABILITY_THRESHOLDS,
} from '../constants/fsrs.constants';
import { API_LIMITS } from '../constants/app.constants';
import { detectContentChange } from './fsrs-content.utils';
import {
  calculateIntervalCore,
  calculateInitialDifficultyCore,
  calculateInitialStabilityCore,
  calculateRetrievabilityCore,
  updateDifficultyCore,
  updateStabilityFailureCore,
  updateStabilitySameDayCore,
  updateStabilitySuccessCore,
} from './fsrs-core.utils';
import {
  addDays,
  formatIntervalMessage,
  getElapsedDays,
  getElapsedHours,
  isSameDay,
} from './fsrs-time.utils';

// ============================================================================
// Types
// ============================================================================

export type Rating = 1 | 2 | 3 | 4; // Again, Hard, Good, Easy

export interface FSRSState {
  stability: number;      // Days until 90% retention
  difficulty: number;     // 1.0 to 10.0
  lastReview: Date | null;
  nextReview: Date;
}

export interface ReviewResult {
  state: FSRSState;
  retrievability: number; // 0.0 to 1.0
  interval: number;       // Days until next review
  message: string;        // Human-readable message
}

export interface FSRSConfig {
  weights: number[];           // 21 weights for FSRS v6
  targetRetention: number;     // Default: 0.9 (90%)
}

// ============================================================================
// FSRS Core Class
// ============================================================================

export class FSRS {
  private config: FSRSConfig;

  constructor(config?: Partial<FSRSConfig>) {
    this.config = {
      weights: config?.weights ?? [...FSRS_V6_DEFAULT_WEIGHTS],
      targetRetention: config?.targetRetention ?? FSRS_CONSTANTS.DEFAULT_TARGET_RETENTION,
    };

    // Validate weights - require exactly 21 weights
    const expectedWeights = 21;
    if (this.config.weights.length < expectedWeights) {
      throw new Error(
        `FSRS v6 requires exactly ${expectedWeights} weights, got ${this.config.weights.length}`
      );
    }
  }

  /**
   * Calculate Retrievability (R) - probability of recalling the card
   * 
   * @param elapsedDays Days since last review
   * @param stability Current stability in days
   * @returns Retrievability (0.0 to 1.0)
   */
  calculateRetrievability(elapsedDays: number, stability: number): number {
    return calculateRetrievabilityCore(this.config.weights, elapsedDays, stability);
  }

  /**
   * Review a card and update its state
   * 
   * @param state Current FSRS state (null for new cards)
   * @param rating User's rating (1-4)
   * @returns Updated state and review information
   */
  reviewCard(
    state: FSRSState | null,
    rating: Rating,
    options?: { reviewAt?: Date }
  ): ReviewResult {
    const now = options?.reviewAt ?? new Date();
    let newState: FSRSState;

    if (!state || state.stability === 0) {
      // New card - initialize
      const stability = calculateInitialStabilityCore(this.config.weights, rating);
      const difficulty = calculateInitialDifficultyCore(this.config.weights, rating);
      const interval = calculateIntervalCore(
        this.config.weights,
        this.config.targetRetention,
        stability,
        rating
      );

      newState = {
        stability,
        difficulty,
        lastReview: now,
        nextReview: addDays(now, interval),
      };
    } else {
      // Existing card - update
      const elapsedDays = getElapsedDays(state.lastReview ?? state.nextReview, now);
      const elapsedHours = getElapsedHours(state.lastReview ?? state.nextReview, now);
      const isSameDayReview = state.lastReview && isSameDay(state.lastReview, now);
      
      const retrievability = this.calculateRetrievability(elapsedDays, state.stability);

      // Update difficulty
      const newDifficulty = updateDifficultyCore(this.config.weights, state.difficulty, rating);

      // Update stability
      let newStability: number;
      if (rating === 1) {
        // Failed
        newStability = updateStabilityFailureCore(
          this.config.weights,
          state.stability,
          newDifficulty,
          retrievability
        );
      } else {
        // Passed
        newStability = updateStabilitySuccessCore(
          this.config.weights,
          state.stability,
          newDifficulty,
          retrievability
        );
      }

      // Apply same-day review adjustment (FSRS v6)
      // Only applies if reviewed within 24 hours on the same day
      if (isSameDayReview && elapsedHours < 24) {
        // Apply same-day review formula (FSRS v6)
        newStability = updateStabilitySameDayCore(
          this.config.weights,
          newStability,
          getElapsedHours(state.lastReview!, now),
          rating
        );
      }

      // Calculate interval
      const interval = calculateIntervalCore(
        this.config.weights,
        this.config.targetRetention,
        newStability,
        rating
      );

      newState = {
        stability: newStability,
        difficulty: newDifficulty,
        lastReview: now,
        nextReview: addDays(now, interval),
      };
    }

    // Calculate current retrievability for display
    const currentRetrievability = newState.lastReview
      ? this.calculateRetrievability(
          0, // Just reviewed, so 0 days elapsed
          newState.stability
        )
      : 1.0;

    // Generate human-readable message
    const interval = getElapsedDays(now, newState.nextReview);
    const message = formatIntervalMessage(interval);

    return {
      state: newState,
      retrievability: currentRetrievability,
      interval,
      message,
    };
  }

  /**
   * Get cards due for review (R <= target retention)
   * 
   * @param cards Array of cards with FSRS state
   * @returns Cards that are due
   */
  getDueCards(cards: Array<{ state: FSRSState; id: string }>): Array<{ id: string; state: FSRSState; retrievability: number }> {
    const now = new Date();
    const targetRetention = this.config.targetRetention;

    return cards
      .map(card => {
        const elapsedDays = getElapsedDays(
          card.state.lastReview ?? card.state.nextReview,
          now
        );
        const retrievability = this.calculateRetrievability(
          elapsedDays,
          card.state.stability
        );

        return {
          id: card.id,
          state: card.state,
          retrievability,
        };
      })
      .filter(card => card.retrievability <= targetRetention)
      .sort((a, b) => a.retrievability - b.retrievability); // Most at-risk first
  }

  /**
   * Get cards for cram mode (sorted by retrievability)
   * 
   * @param cards Array of cards with FSRS state
   * @param limit Maximum number of cards to return
   * @returns Cards sorted by retrievability (lowest first)
   */
  getCramCards(
    cards: Array<{ state: FSRSState; id: string }>,
    limit: number = API_LIMITS.DEFAULT_PRE_STUDY_LIMIT
  ): Array<{ id: string; state: FSRSState; retrievability: number; risk: 'critical' | 'optimal' | 'safe' }> {
    const now = new Date();

    return cards
      .map(card => {
        const elapsedDays = getElapsedDays(
          card.state.lastReview ?? card.state.nextReview,
          now
        );
        const retrievability = this.calculateRetrievability(
          elapsedDays,
          card.state.stability
        );

        let risk: 'critical' | 'optimal' | 'safe';
        if (retrievability < RETRIEVABILITY_THRESHOLDS.CRITICAL) {
          risk = 'critical';
        } else if (retrievability <= RETRIEVABILITY_THRESHOLDS.OPTIMAL_MAX) {
          risk = 'optimal';
        } else {
          risk = 'safe';
        }

        return {
          id: card.id,
          state: card.state,
          retrievability,
          risk,
        };
      })
      .sort((a, b) => a.retrievability - b.retrievability)
      .slice(0, limit);
  }

  /**
   * Detect if content changed significantly
   * 
   * @param oldContent Original content
   * @param newContent New content
   * @returns Change detection result
   */
  detectContentChange(
    oldContent: string,
    newContent: string
  ): {
    changePercent: number;
    isSignificant: boolean; // >30% change
    shouldReset: boolean;    // >50% change
  } {
    return detectContentChange(oldContent, newContent);
  }

  /**
   * Reset card stability (treat as new card)
   * 
   * Use when content changed significantly (>50% or user requests)
   * 
   * @param state Current FSRS state
   * @returns Reset state (stability/difficulty null, due immediately)
   */
  resetCardStability(_state: FSRSState): FSRSState {
    return {
      stability: 0, // Will be set on next review
      difficulty: null as unknown as number, // Will be set on next review
      lastReview: null,
      nextReview: new Date(), // Due immediately
    };
  }

}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create FSRS instance with default v6 weights (21 weights)
 */
export function createFSRS(config?: Partial<FSRSConfig>): FSRS {
  return new FSRS({
    ...config,
    weights: config?.weights ?? [...FSRS_V6_DEFAULT_WEIGHTS],
  });
}
