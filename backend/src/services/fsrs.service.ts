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
// Default Weights
// ============================================================================

/**
 * FSRS v6 Default Weights (21 weights)
 * Derived from millions of review logs
 * Includes same-day review handling, overdue factor, and extended parameters
 */
export const FSRS_V6_DEFAULT_WEIGHTS: readonly number[] = [
  0.4,   // w₀: Initial Stability for Again
  0.9,   // w₁: Initial Stability for Hard
  2.3,   // w₂: Initial Stability for Good
  10.9,  // w₃: Initial Stability for Easy
  4.93,  // w₄: Initial Difficulty base
  0.94,  // w₅: Initial Difficulty spread
  0.86,  // w₆: Difficulty weight
  0.01,  // w₇: Difficulty mean reversion
  1.49,  // w₈: Success Stability base
  0.14,  // w₉: Success Stability diminishing returns
  0.94,  // w₁₀: Success Stability retrievability factor
  2.18,  // w₁₁: Failure Stability base
  0.05,  // w₁₂: Failure Stability difficulty factor
  0.34,  // w₁₃: Failure Stability preservation
  1.26,  // w₁₄: Failure Stability retrievability factor
  0.29,  // w₁₅: Hard interval modifier
  2.61,  // w₁₆: Easy interval modifier
  0.5,   // w₁₇: Same-day Stability (first review)
  0.3,   // w₁₈: Same-day Stability (subsequent reviews)
  0.8,   // w₁₉: Short-term saturation cap
  9.0,   // w₂₀: Overdue factor (for v6 retrievability formula)
  1.0,   // w₂₁: Extended parameter for advanced tuning
] as const;

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
      targetRetention: config?.targetRetention ?? 0.9,
    };

    this.managementConfig = {
      minRevealSeconds: managementConfig?.minRevealSeconds ?? 5,
      fuzzingHoursMin: managementConfig?.fuzzingHoursMin ?? 4,
      fuzzingHoursMax: managementConfig?.fuzzingHoursMax ?? 8,
      adaptiveFuzzing: managementConfig?.adaptiveFuzzing ?? true,
      warnBeforeManaging: managementConfig?.warnBeforeManaging ?? true,
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
    if (stability <= 0) return 0;
    if (elapsedDays <= 0) return 1;

    // FSRS v6 formula (with overdue factor w₂₀)
    // R(t,S) = (1 + w₂₀ * (t/S))^(-1)
    const w20 = this.config.weights[20];
    return Math.pow(1 + w20 * (elapsedDays / stability), -1);
  }

  /**
   * Calculate initial Stability (S₀) for a new card
   * 
   * @param rating User's rating (1-4)
   * @returns Initial stability in days
   */
  private calculateInitialStability(rating: Rating): number {
    // S₀(G) = w_{G-1}
    // w₀ for Again (1), w₁ for Hard (2), w₂ for Good (3), w₃ for Easy (4)
    return this.config.weights[rating - 1];
  }

  /**
   * Calculate initial Difficulty (D₀) for a new card
   * 
   * @param rating User's rating (1-4)
   * @returns Initial difficulty (1.0 to 10.0)
   */
  private calculateInitialDifficulty(rating: Rating): number {
    // D₀(G) = w₄ - (G - 3) * w₅
    const w4 = this.config.weights[4];
    const w5 = this.config.weights[5];
    const d0 = w4 - (rating - 3) * w5;
    return this.clampDifficulty(d0);
  }

  /**
   * Update Difficulty after a review
   * 
   * @param currentDifficulty Current difficulty
   * @param rating User's rating (1-4)
   * @returns New difficulty
   */
  private updateDifficulty(currentDifficulty: number, rating: Rating): number {
    const w6 = this.config.weights[6];
    const w7 = this.config.weights[7];
    const w4 = this.config.weights[4];
    const w5 = this.config.weights[5];

    // D₀(3) = w₄ (for Good rating)
    const d0Good = w4;

    // D_new = w₇ * D₀(3) + (1 - w₇) * (D_old - w₆ * (G - 3))
    const dNew = w7 * d0Good + (1 - w7) * (currentDifficulty - w6 * (rating - 3));

    return this.clampDifficulty(dNew);
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
    const w8 = this.config.weights[8];
    const w9 = this.config.weights[9];
    const w10 = this.config.weights[10];

    // S_new = S * (1 + e^w₈ * (11 - D) * S^(-w₉) * (e^(w₁₀ * (1 - R)) - 1))
    const growthFactor = 1 + Math.exp(w8) * (11 - difficulty) * 
      Math.pow(currentStability, -w9) * 
      (Math.exp(w10 * (1 - retrievability)) - 1);

    return currentStability * growthFactor;
  }

  /**
   * Update Stability after a failed review (G = 1)
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
    const w11 = this.config.weights[11];
    const w12 = this.config.weights[12];
    const w13 = this.config.weights[13];
    const w14 = this.config.weights[14];

    // S_new = w₁₁ * D^(-w₁₂) * ((S + 1)^w₁₃ - 1) * e^(w₁₄ * (1 - R))
    return w11 * Math.pow(difficulty, -w12) * 
      (Math.pow(currentStability + 1, w13) - 1) * 
      Math.exp(w14 * (1 - retrievability));
  }

  /**
   * Calculate interval (days) until next review
   * 
   * @param stability Current stability
   * @param rating User's rating (for Hard/Easy modifiers)
   * @returns Interval in days
   */
  private calculateInterval(stability: number, rating: Rating): number {
    const targetRetention = this.config.targetRetention;
    const ln09 = Math.log(0.9);

    // Base interval: I = (S / ln(0.9)) * ln(R_target)
    let interval = (stability / ln09) * Math.log(targetRetention);

    // Apply Hard/Easy modifiers
    if (rating === 2) { // Hard
      const w15 = this.config.weights[15];
      interval *= w15;
    } else if (rating === 4) { // Easy
      const w16 = this.config.weights[16];
      interval *= w16;
    }

    // Ensure minimum interval of 0.1 days
    return Math.max(0.1, interval);
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
    return (to.getTime() - from.getTime()) / (1000 * 60 * 60);
  }

  /**
   * Update Stability for same-day reviews (FSRS v6)
   * 
   * @param currentStability Current stability
   * @param lastReview Last review date
   * @param now Current date
   * @param isFirstReviewOfDay Whether this is the first review today
   * @returns Adjusted stability for same-day review
   */
  private updateStabilitySameDay(
    currentStability: number,
    lastReview: Date,
    now: Date,
    isFirstReviewOfDay: boolean
  ): number {
    const elapsedHours = this.getElapsedHours(lastReview, now);
    
    // Only apply same-day logic if reviewed within 24 hours
    if (elapsedHours >= 24) {
      return currentStability;
    }

    const w17 = this.config.weights[17];
    const w18 = this.config.weights[18];
    const w19 = this.config.weights[19];

    // Use w17 for first review of day, w18 for subsequent same-day reviews
    const sameDayWeight = isFirstReviewOfDay ? w17 : w18;
    
    // Apply same-day boost with saturation cap (w19)
    const boost = sameDayWeight * Math.min(1, elapsedHours / 4); // 4 hours = full boost
    const cappedBoost = Math.min(boost, w19);
    
    return currentStability * (1 + cappedBoost);
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
        // If it's the same day, this is NOT the first review of the day
        // First review would have lastReview on a different day
        const isFirstReviewOfDay = false; // Same day = subsequent review
        newStability = this.updateStabilitySameDay(
          newStability,
          state.lastReview!,
          now,
          isFirstReviewOfDay
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
    limit: number = 50
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
        if (retrievability < 0.85) {
          risk = 'critical';
        } else if (retrievability <= 0.92) {
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

  private clampDifficulty(d: number): number {
    return Math.max(1.0, Math.min(10.0, d));
  }

  private getElapsedDays(from: Date, to: Date): number {
    const ms = to.getTime() - from.getTime();
    return ms / (1000 * 60 * 60 * 24);
  }

  private addDays(date: Date, days: number): Date {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  }

  private formatIntervalMessage(days: number): string {
    if (days < 1) {
      const hours = Math.round(days * 24);
      if (hours < 1) {
        return 'Review again soon';
      }
      return `Review in ${hours} hour${hours !== 1 ? 's' : ''}`;
    }

    const roundedDays = Math.round(days);
    if (roundedDays === 1) {
      return 'Review tomorrow';
    } else if (roundedDays < 7) {
      return `Review in ${roundedDays} days`;
    } else if (roundedDays < 30) {
      const weeks = Math.round(roundedDays / 7);
      return `Review in ${weeks} week${weeks !== 1 ? 's' : ''}`;
    } else {
      const months = Math.round(roundedDays / 30);
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
    const now = new Date();
    const elapsedDays = this.getElapsedDays(
      state.lastReview ?? state.nextReview,
      now
    );
    const retrievability = this.calculateRetrievability(elapsedDays, state.stability);
    const hoursUntilDue = this.getElapsedHours(now, state.nextReview);

    // Risk factors
    const rFactor = 1 - retrievability; // Lower R = higher risk
    const timeFactor = Math.max(0, 1 - hoursUntilDue / 24); // Sooner = higher risk
    const stabilityFactor = state.stability < 1 ? 1 : Math.min(1, 1 / state.stability); // Lower S = higher risk

    // Weighted risk calculation
    const riskPercent = Math.min(100, (
      rFactor * 50 +        // Retrievability: 50% weight
      timeFactor * 30 +     // Time until due: 30% weight
      stabilityFactor * 20  // Stability: 20% weight
    ) * 100);

    // Determine risk level
    let riskLevel: 'low' | 'medium' | 'high' | 'critical';
    let recommendedAction: 'safe' | 'pre-study' | 'avoid';
    
    if (riskPercent >= 70) {
      riskLevel = 'critical';
      recommendedAction = 'avoid';
    } else if (riskPercent >= 50) {
      riskLevel = 'high';
      recommendedAction = 'pre-study';
    } else if (riskPercent >= 30) {
      riskLevel = 'medium';
      recommendedAction = 'pre-study';
    } else {
      riskLevel = 'low';
      recommendedAction = 'safe';
    }

    return {
      cardId: '', // Will be set by caller
      riskLevel,
      riskPercent,
      retrievability,
      stability: state.stability,
      hoursUntilDue,
      recommendedAction,
    };
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
    const risks = cards.map(card => {
      const risk = this.calculateManagementRisk(card.state);
      return { ...risk, cardId: card.id };
    });

    const totalCards = cards.length;
    const criticalCards = risks.filter(r => r.riskLevel === 'critical').length;
    const highRiskCards = risks.filter(r => r.riskLevel === 'high').length;
    const mediumRiskCards = risks.filter(r => r.riskLevel === 'medium').length;
    const lowRiskCards = risks.filter(r => r.riskLevel === 'low').length;
    const atRiskCards = criticalCards + highRiskCards + mediumRiskCards;

    const avgRisk = risks.reduce((sum, r) => sum + r.riskPercent, 0) / totalCards;

    // Recommend pre-study for high/critical risk cards
    const recommendedPreStudyCount = criticalCards + highRiskCards;

    return {
      totalCards,
      atRiskCards,
      riskPercent: avgRisk,
      criticalCards,
      highRiskCards,
      mediumRiskCards,
      lowRiskCards,
      recommendedPreStudyCount,
    };
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
    // No penalty for quick glances
    if (revealedForSeconds < this.managementConfig.minRevealSeconds) {
      return state;
    }

    const now = new Date();
    const hoursUntilDue = this.getElapsedHours(now, state.nextReview);
    const elapsedDays = this.getElapsedDays(state.lastReview ?? state.nextReview, now);
    const retrievability = this.calculateRetrievability(elapsedDays, state.stability);

    // If card is not due soon, no penalty needed
    if (hoursUntilDue > 24) {
      return state;
    }

    // Calculate adaptive fuzzing based on card state
    let fuzzingHours: number;
    if (this.managementConfig.adaptiveFuzzing) {
      // Base fuzzing
      const baseFuzzing = this.managementConfig.fuzzingHoursMin;

      // Adjust based on stability
      // Low stability (< 1 day): Proportional fuzzing (don't over-penalize)
      // High stability (> 7 days): Minimal fuzzing (card is strong)
      let stabilityMultiplier = 1;
      if (state.stability < 1) {
        // For low stability, fuzzing should be proportional to stability
        // e.g., 0.5 day stability → 0.5x fuzzing
        stabilityMultiplier = Math.max(0.3, state.stability);
      } else if (state.stability > 7) {
        // High stability cards are strong, less fuzzing needed
        stabilityMultiplier = 0.5;
      }

      // Adjust based on retrievability
      // High R (>0.9): Less fuzzing (card is fresh)
      // Low R (<0.7): More fuzzing (card is at risk)
      let rMultiplier = 1;
      if (retrievability > 0.9) {
        rMultiplier = 0.7; // Card is fresh, less penalty
      } else if (retrievability < 0.7) {
        rMultiplier = 1.2; // Card is at risk, more penalty
      }

      // Adjust based on time until due
      let timeMultiplier = 1;
      if (hoursUntilDue < 2) {
        timeMultiplier = 1.5; // Due very soon, more penalty
      } else if (hoursUntilDue < 6) {
        timeMultiplier = 1.2;
      }

      // Calculate final fuzzing
      fuzzingHours = baseFuzzing * stabilityMultiplier * rMultiplier * timeMultiplier;
      fuzzingHours = Math.min(fuzzingHours, this.managementConfig.fuzzingHoursMax);
      fuzzingHours = Math.max(fuzzingHours, 0.5); // Minimum 30 minutes
    } else {
      // Fixed fuzzing
      const range = this.managementConfig.fuzzingHoursMax - this.managementConfig.fuzzingHoursMin;
      fuzzingHours = this.managementConfig.fuzzingHoursMin + Math.random() * range;
    }

    // Push next_review forward (DO NOT touch stability/difficulty)
    return {
      ...state,
      nextReview: this.addHours(state.nextReview, fuzzingHours),
    };
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
    targetRetention: number = 0.95,
    limit: number = 50
  ): Array<{ id: string; state: FSRSState; risk: ManagementRisk }> {
    const risks = cards.map(card => {
      const risk = this.calculateManagementRisk(card.state);
      return {
        id: card.id,
        state: card.state,
        risk: { ...risk, cardId: card.id },
      };
    });

    // Filter cards that need pre-study (medium/high/critical risk)
    // and are below target retention
    const now = new Date();
    return risks
      .filter(item => {
        const elapsedDays = this.getElapsedDays(
          item.state.lastReview ?? item.state.nextReview,
          now
        );
        const retrievability = this.calculateRetrievability(
          elapsedDays,
          item.state.stability
        );
        return (
          item.risk.riskLevel !== 'low' &&
          retrievability < targetRetention
        );
      })
      .sort((a, b) => b.risk.riskPercent - a.risk.riskPercent)
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
    if (oldContent === newContent) {
      return { changePercent: 0, isSignificant: false, shouldReset: false };
    }

    // Simple similarity calculation (can be improved with diff algorithms)
    const similarity = this.calculateSimilarity(oldContent, newContent);
    const changePercent = (1 - similarity) * 100;

    return {
      changePercent,
      isSignificant: changePercent > 30,
      shouldReset: changePercent > 50,
    };
  }

  /**
   * Reset card stability (treat as new card)
   * 
   * Use when content changed significantly (>50% or user requests)
   * 
   * @param state Current FSRS state
   * @returns Reset state (stability/difficulty null, due immediately)
   */
  resetCardStability(state: FSRSState): FSRSState {
    return {
      stability: 0, // Will be set on next review
      difficulty: null as any, // Will be set on next review
      lastReview: null,
      nextReview: new Date(), // Due immediately
    };
  }

  /**
   * Calculate similarity between two strings
   * Simple implementation using Levenshtein distance
   */
  private calculateSimilarity(str1: string, str2: string): number {
    if (str1 === str2) return 1;
    if (str1.length === 0 || str2.length === 0) return 0;

    const maxLength = Math.max(str1.length, str2.length);
    const distance = this.levenshteinDistance(str1, str2);
    return 1 - distance / maxLength;
  }

  /**
   * Calculate Levenshtein distance between two strings
   */
  private levenshteinDistance(str1: string, str2: string): number {
    const matrix: number[][] = [];

    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }

    return matrix[str2.length][str1.length];
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
