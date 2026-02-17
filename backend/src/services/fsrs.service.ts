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
import { INTERVAL_THRESHOLDS, TIME_CONSTANTS, API_LIMITS } from '../constants/app.constants';
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
  shortLoopDecision?: {
    enabled: boolean;
    action: 'reinsert_today' | 'defer' | 'graduate_to_fsrs';
    reason: string;
    nextGapSeconds: number | null;
    loopIteration: number;
    fatigueScore: number | null;
    importanceMode: 'light' | 'default' | 'intensive';
  };
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
   * Calculate initial Stability (S₀) for a new card
   * 
   * @param rating User's rating (1-4)
   * @returns Initial stability in days
   */
  private calculateInitialStability(rating: Rating): number {
    return calculateInitialStabilityCore(this.config.weights, rating);
  }

  /**
   * Calculate initial Difficulty (D₀) for a new card
   * 
   * FSRS-6 formula: D₀(G) = w₄ - e^(w₅ * (G - 1)) + 1
   * where w₄ = D₀(1), i.e., the initial difficulty when the first rating is Again.
   * 
   * Source: https://expertium.github.io/Algorithm.html
   * 
   * @param rating User's rating (1-4)
   * @returns Initial difficulty (1.0 to 10.0)
   */
  private calculateInitialDifficulty(rating: Rating): number {
    return calculateInitialDifficultyCore(this.config.weights, rating);
  }

  /**
   * Update Difficulty after a review
   * 
   * FSRS-6 formula with linear damping and mean reversion:
   * 1. ΔD(G) = -w₆ * (G - 3)
   * 2. D' = D + ΔD * (10 - D) / 9  (linear damping)
   * 3. D'' = w₇ * D₀(4) + (1 - w₇) * D'  (mean reversion)
   * 
   * In FSRS-6, D₀(4) (Easy) is the target of mean reversion.
   * Source: https://expertium.github.io/Algorithm.html
   * 
   * @param currentDifficulty Current difficulty
   * @param rating User's rating (1-4)
   * @returns New difficulty
   */
  private updateDifficulty(currentDifficulty: number, rating: Rating): number {
    return updateDifficultyCore(this.config.weights, currentDifficulty, rating);
  }

  /**
   * Update Stability after a successful review (G > 1)
   * 
   * @param currentStability Current stability
   * @param difficulty Current difficulty
   * @param retrievability Current retrievability
   * @returns New stability
   */
  private updateStabilitySuccess(
    currentStability: number,
    difficulty: number,
    retrievability: number
  ): number {
    return updateStabilitySuccessCore(
      this.config.weights,
      currentStability,
      difficulty,
      retrievability
    );
  }

  /**
   * Update Stability after a failed review (G = 1)
   * 
   * FSRS-6 formula: S'_f(D,S,R) = min(w₁₁ * D^(-w₁₂) * ((S + 1)^w₁₃ - 1) * e^(w₁₄ * (1 - R)), S)
   * 
   * The min(..., S) ensures that post-lapse stability can never be greater than
   * stability before the lapse.
   * 
   * Source: https://expertium.github.io/Algorithm.html
   * 
   * @param currentStability Current stability
   * @param difficulty Current difficulty
   * @param retrievability Current retrievability
   * @returns New stability
   */
  private updateStabilityFailure(
    currentStability: number,
    difficulty: number,
    retrievability: number
  ): number {
    return updateStabilityFailureCore(
      this.config.weights,
      currentStability,
      difficulty,
      retrievability
    );
  }

  /**
   * Calculate interval (days) until next review
   * 
   * @param stability Current stability
   * @param rating User's rating (for Hard/Easy modifiers)
   * @returns Interval in days
   */
  private calculateInterval(stability: number, rating: Rating): number {
    return calculateIntervalCore(this.config.weights, this.config.targetRetention, stability, rating);
  }

  /**
   * Check if two dates are on the same day
   */
  private isSameDay(date1: Date, date2: Date): boolean {
    return (
      date1.getFullYear() === date2.getFullYear() &&
      date1.getMonth() === date2.getMonth() &&
      date1.getDate() === date2.getDate()
    );
  }

  /**
   * Get hours elapsed between two dates
   */
  private getElapsedHours(from: Date, to: Date): number {
    return (to.getTime() - from.getTime()) / TIME_CONSTANTS.MS_PER_HOUR;
  }

  /**
   * Update Stability for same-day reviews (FSRS v6)
   * 
   * Formula: S'(S,G) = S * e^(w₁₇ * (G - 3 + w₁₈)) * S^(-w₁₉)
   * 
   * @param currentStability Current stability
   * @param lastReview Last review date
   * @param now Current date
   * @param rating User's rating (1-4)
   * @returns Adjusted stability for same-day review
   */
  private updateStabilitySameDay(
    currentStability: number,
    lastReview: Date,
    now: Date,
    rating: Rating
  ): number {
    const elapsedHours = this.getElapsedHours(lastReview, now);
    return updateStabilitySameDayCore(this.config.weights, currentStability, elapsedHours, rating);
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
      const stability = this.calculateInitialStability(rating);
      const difficulty = this.calculateInitialDifficulty(rating);
      const interval = this.calculateInterval(stability, rating);

      newState = {
        stability,
        difficulty,
        lastReview: now,
        nextReview: this.addDays(now, interval),
      };
    } else {
      // Existing card - update
      const elapsedDays = this.getElapsedDays(state.lastReview ?? state.nextReview, now);
      const elapsedHours = this.getElapsedHours(state.lastReview ?? state.nextReview, now);
      const isSameDayReview = state.lastReview && this.isSameDay(state.lastReview, now);
      
      const retrievability = this.calculateRetrievability(elapsedDays, state.stability);

      // Update difficulty
      const newDifficulty = this.updateDifficulty(state.difficulty, rating);

      // Update stability
      let newStability: number;
      if (rating === 1) {
        // Failed
        newStability = this.updateStabilityFailure(
          state.stability,
          newDifficulty,
          retrievability
        );
      } else {
        // Passed
        newStability = this.updateStabilitySuccess(
          state.stability,
          newDifficulty,
          retrievability
        );
      }

      // Apply same-day review adjustment (FSRS v6)
      // Only applies if reviewed within 24 hours on the same day
      if (isSameDayReview && elapsedHours < 24) {
        // Apply same-day review formula (FSRS v6)
        newStability = this.updateStabilitySameDay(
          newStability,
          state.lastReview!,
          now,
          rating
        );
      }

      // Calculate interval
      const interval = this.calculateInterval(newStability, rating);

      newState = {
        stability: newStability,
        difficulty: newDifficulty,
        lastReview: now,
        nextReview: this.addDays(now, interval),
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
    const interval = this.getElapsedDays(now, newState.nextReview);
    const message = this.formatIntervalMessage(interval);

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
        const elapsedDays = this.getElapsedDays(
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
        const elapsedDays = this.getElapsedDays(
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
  // Helper Methods
  // ============================================================================

  private getElapsedDays(from: Date, to: Date): number {
    const ms = to.getTime() - from.getTime();
    return ms / TIME_CONSTANTS.MS_PER_DAY;
  }

  private addDays(date: Date, days: number): Date {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  }

  private formatIntervalMessage(days: number): string {
    if (days < INTERVAL_THRESHOLDS.ONE_DAY) {
      const hours = Math.round(days * TIME_CONSTANTS.HOURS_PER_DAY);
      if (hours < 1) {
        return 'Review again soon';
      }
      return `Review in ${hours} hour${hours !== 1 ? 's' : ''}`;
    }

    const roundedDays = Math.round(days);
    if (roundedDays === 1) {
      return 'Review tomorrow';
    } else if (roundedDays < INTERVAL_THRESHOLDS.ONE_WEEK) {
      return `Review in ${roundedDays} days`;
    } else if (roundedDays < INTERVAL_THRESHOLDS.ONE_MONTH) {
      const weeks = Math.round(roundedDays / TIME_CONSTANTS.DAYS_PER_WEEK);
      return `Review in ${weeks} week${weeks !== 1 ? 's' : ''}`;
    } else {
      const months = Math.round(roundedDays / TIME_CONSTANTS.DAYS_PER_MONTH);
      return `Review in ${months} month${months !== 1 ? 's' : ''}`;
    }
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
      getElapsedDays: this.getElapsedDays.bind(this),
      getElapsedHours: this.getElapsedHours.bind(this),
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
      getElapsedDays: this.getElapsedDays.bind(this),
      getElapsedHours: this.getElapsedHours.bind(this),
      calculateRetrievability: this.calculateRetrievability.bind(this),
      addHours: this.addHours.bind(this),
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
        getElapsedDays: this.getElapsedDays.bind(this),
        getElapsedHours: this.getElapsedHours.bind(this),
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

  private addHours(date: Date, hours: number): Date {
    const result = new Date(date);
    result.setTime(result.getTime() + hours * 60 * 60 * 1000);
    return result;
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
