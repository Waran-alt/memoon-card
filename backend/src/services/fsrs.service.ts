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
 */

import {
  FSRS_V6_DEFAULT_WEIGHTS,
  FSRS_CONSTANTS,
  RETRIEVABILITY_THRESHOLDS,
} from '../constants/fsrs.constants';
import {
  DEFAULT_MANAGEMENT_CONFIG,
} from '../constants/management.constants';
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
  addHours,
  formatIntervalMessage,
  getElapsedDays,
  getElapsedHours,
  isSameDay,
} from './fsrs-time.utils';
import {
  applyManagementPenaltyToState,
  calculateDeckManagementRiskForCards,
  calculateManagementRiskForState,
  getPreStudyCardsByRisk,
} from './fsrs-management.utils';

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
  learningState?: { phase: 'learning' | 'graduated'; nextReviewInMinutes?: number; nextReviewInDays?: number; learningReviewCount?: number; nextReviewTomorrow?: boolean };
}

export interface FSRSConfig {
  weights: number[];           // 21 weights for FSRS v6
  targetRetention: number;     // Default: 0.9 (90%)
}

/**
 * Management view tracking for cards
 * 
 * When users manage cards (edit, filter, handle duplicates), they may
 * passively see card content. This can weaken active recall.
 * 
 * Management views do NOT affect FSRS stability/difficulty, but may
 * apply "fuzzing" to push next_review forward if answer was revealed.
 */
export interface ManagementView {
  cardId: string;
  action: 'edit' | 'duplicate_check' | 'filter' | 'tag' | 'other';
  revealedAt: Date;
  revealedForSeconds: number;
  contentChanged: boolean;
  changePercent?: number; // 0-100, if content changed
}

export interface ManagementPenaltyConfig {
  minRevealSeconds: number;    // Minimum seconds to trigger penalty (default: 5)
  fuzzingHoursMin: number;      // Minimum fuzzing hours (default: 4)
  fuzzingHoursMax: number;       // Maximum fuzzing hours (default: 8)
  adaptiveFuzzing: boolean;      // Adjust based on card state (default: true)
  warnBeforeManaging: boolean;   // Show risk warning before managing (default: true)
}

export interface ManagementRisk {
  cardId: string;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  riskPercent: number;          // 0-100
  retrievability: number;        // Current R
  stability: number;
  hoursUntilDue: number;
  recommendedAction: 'safe' | 'pre-study' | 'avoid';
}

export interface DeckManagementRisk {
  totalCards: number;
  atRiskCards: number;
  riskPercent: number;           // Average risk
  criticalCards: number;          // Risk > 70%
  highRiskCards: number;          // Risk 50-70%
  mediumRiskCards: number;        // Risk 30-50%
  lowRiskCards: number;           // Risk < 30%
  recommendedPreStudyCount: number; // Cards to review before managing
}

// ============================================================================
// FSRS Core Class
// ============================================================================

export class FSRS {
  private config: FSRSConfig;
  private managementConfig: ManagementPenaltyConfig;

  constructor(
    config?: Partial<FSRSConfig>,
    managementConfig?: Partial<ManagementPenaltyConfig>
  ) {
    this.config = {
      weights: config?.weights ?? [...FSRS_V6_DEFAULT_WEIGHTS],
      targetRetention: config?.targetRetention ?? FSRS_CONSTANTS.DEFAULT_TARGET_RETENTION,
    };

    this.managementConfig = {
      minRevealSeconds: managementConfig?.minRevealSeconds ?? DEFAULT_MANAGEMENT_CONFIG.MIN_REVEAL_SECONDS,
      fuzzingHoursMin: managementConfig?.fuzzingHoursMin ?? DEFAULT_MANAGEMENT_CONFIG.FUZZING_HOURS_MIN,
      fuzzingHoursMax: managementConfig?.fuzzingHoursMax ?? DEFAULT_MANAGEMENT_CONFIG.FUZZING_HOURS_MAX,
      adaptiveFuzzing: managementConfig?.adaptiveFuzzing ?? DEFAULT_MANAGEMENT_CONFIG.ADAPTIVE_FUZZING,
      warnBeforeManaging: managementConfig?.warnBeforeManaging ?? DEFAULT_MANAGEMENT_CONFIG.WARN_BEFORE_MANAGING,
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
   * Note: Only actual reviews with ratings affect FSRS state. Management views
   * (editing, filtering, handling duplicates) do not count, as the app's purpose
   * is memorization through active recall, not passive exposure.
   * 
   * @param state Current FSRS state (null for new cards)
   * @param rating User's rating (1-4)
   * @returns Updated state and review information
   */
  reviewCard(
    state: FSRSState | null,
    rating: Rating
  ): ReviewResult {
    const now = new Date();
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

  // ============================================================================
  // Management View Handling
  // ============================================================================

  /**
   * Calculate management risk for a single card
   * 
   * Risk is based on:
   * - Retrievability (lower R = higher risk)
   * - Time until due (sooner = higher risk)
   * - Stability (lower S = higher risk from fuzzing)
   * 
   * @param state Current FSRS state
   * @returns Risk assessment
   */
  calculateManagementRisk(state: FSRSState): ManagementRisk {
    return calculateManagementRiskForState(state, {
      now: new Date(),
      getElapsedDays,
      getElapsedHours,
      calculateRetrievability: this.calculateRetrievability.bind(this),
    });
  }

  /**
   * Calculate management risk for an entire deck
   * 
   * @param cards Array of cards with FSRS state
   * @returns Deck-level risk assessment
   */
  calculateDeckManagementRisk(
    cards: Array<{ id: string; state: FSRSState }>
  ): DeckManagementRisk {
    return calculateDeckManagementRiskForCards(cards, this.calculateManagementRisk.bind(this));
  }

  /**
   * Apply management penalty (fuzzing) if user revealed answer during management
   * 
   * This pushes next_review forward without affecting stability/difficulty.
   * Fuzzing is now adaptive based on card state:
   * - High stability + due soon: Minimal fuzzing (card is strong)
   * - Low stability: Proportional fuzzing (don't over-penalize)
   * - Medium stability: Standard fuzzing
   * 
   * @param state Current FSRS state
   * @param revealedForSeconds How long answer was revealed
   * @returns Updated state with fuzzed next_review (or original if no penalty)
   */
  applyManagementPenalty(
    state: FSRSState,
    revealedForSeconds: number
  ): FSRSState {
    return applyManagementPenaltyToState(state, revealedForSeconds, this.managementConfig, {
      now: new Date(),
      getElapsedDays,
      getElapsedHours,
      calculateRetrievability: this.calculateRetrievability.bind(this),
      addHours,
    });
  }

  /**
   * Get cards recommended for pre-study before management
   * 
   * Uses higher target retention (e.g., 95%) to strengthen cards
   * before user manages the deck.
   * 
   * @param cards Array of cards with FSRS state
   * @param targetRetention Optional: Higher retention for pre-study (default: 0.95)
   * @param limit Maximum number of cards to return
   * @returns Cards sorted by risk (highest first)
   */
  getPreStudyCards(
    cards: Array<{ id: string; state: FSRSState }>,
    targetRetention: number = FSRS_CONSTANTS.PRE_STUDY_TARGET_RETENTION,
    limit: number = API_LIMITS.DEFAULT_PRE_STUDY_LIMIT
  ): Array<{ id: string; state: FSRSState; risk: ManagementRisk }> {
    return getPreStudyCardsByRisk(
      cards,
      targetRetention,
      limit,
      this.calculateManagementRisk.bind(this),
      {
        now: new Date(),
        getElapsedDays,
        getElapsedHours,
        calculateRetrievability: this.calculateRetrievability.bind(this),
      }
    );
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
export function createFSRS(
  config?: Partial<FSRSConfig>,
  managementConfig?: Partial<ManagementPenaltyConfig>
): FSRS {
  return new FSRS(
    {
      ...config,
      weights: config?.weights ?? [...FSRS_V6_DEFAULT_WEIGHTS],
    },
    managementConfig
  );
}
