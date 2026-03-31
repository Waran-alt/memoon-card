/**
 * FSRS (Free Spaced Repetition Scheduler) Constants
 *
 * Default weights and algorithm parameters for FSRS v6 (user overrides live in `user_settings`).
 * Changing defaults impacts new users and optimizer baselines; keep shared with Python optimizer expectations.
 *
 * References:
 * - https://github.com/open-spaced-repetition/fsrs4anki
 * - https://github.com/open-spaced-repetition/free-spaced-repetition-scheduler
 */

/**
 * FSRS v6 Default Weights (21 weights)
 * 
 * Official default parameters from FSRS-6 algorithm.
 * Source: https://github.com/open-spaced-repetition/fsrs4anki/wiki/The-Algorithm
 * 
 * These values are derived from millions of review logs and optimized for general use.
 * 
 * Weight descriptions:
 * - w₀-w₃: Initial Stability for ratings (Again, Hard, Good, Easy)
 * - w₄-w₇: Initial Difficulty calculation
 * - w₈-w₁₀: Success Stability update factors
 * - w₁₁-w₁₄: Failure Stability update factors
 * - w₁₅-w₁₆: Interval modifiers (Hard, Easy)
 * - w₁₇-w₁₈: Same-day review handling
 * - w₁₉: Same-day review stability decay
 * - w₂₀: Retrievability decay factor
 * - w₂₁: Extended parameter for advanced tuning
 */
export const FSRS_V6_DEFAULT_WEIGHTS: readonly number[] = [
  0.212,   // w₀: Initial Stability for Again
  1.2931,  // w₁: Initial Stability for Hard
  2.3065,  // w₂: Initial Stability for Good
  8.2956, // w₃: Initial Stability for Easy
  6.4133,  // w₄: Initial Difficulty base
  0.8334,  // w₅: Initial Difficulty spread
  3.0194,  // w₆: Difficulty weight
  0.001,   // w₇: Difficulty mean reversion
  1.8722,  // w₈: Success Stability base
  0.1666,  // w₉: Success Stability diminishing returns
  0.796,   // w₁₀: Success Stability retrievability factor
  1.4835,  // w₁₁: Failure Stability base
  0.0614,  // w₁₂: Failure Stability difficulty factor
  0.2629,  // w₁₃: Failure Stability preservation
  1.6483,  // w₁₄: Failure Stability retrievability factor
  0.6014,  // w₁₅: Hard interval modifier
  1.8729,  // w₁₆: Easy interval modifier
  0.5425,  // w₁₇: Same-day review stability multiplier
  0.0912,  // w₁₈: Same-day review offset
  0.0658,  // w₁₉: Same-day review stability decay
  0.1542,  // w₂₀: Retrievability decay factor
  0.1542,  // w₂₁: Extended parameter (currently same as w₂₀)
] as const;

/**
 * FSRS Algorithm Constants
 */
export const FSRS_CONSTANTS = {
  /** Default target retention rate (90%) */
  DEFAULT_TARGET_RETENTION: 0.9,
  
  /** Natural logarithm of 0.9 (used in interval calculation) */
  LN_09: Math.log(0.9),
  
  /** Minimum interval in days (prevents zero or negative intervals) */
  MIN_INTERVAL_DAYS: 0.1,
  
  /** Difficulty bounds */
  DIFFICULTY: {
    MIN: 1.0,
    MAX: 10.0,
  },
  
  /** Same-day review time thresholds (in hours) */
  SAME_DAY: {
    /** Hours considered as same day */
    THRESHOLD_HOURS: 24,
    /** Hours for full same-day boost */
    FULL_BOOST_HOURS: 4,
  },
} as const;

/**
 * Retrievability Thresholds
 * Used for risk assessment and card categorization
 */
export const RETRIEVABILITY_THRESHOLDS = {
  /** Critical risk threshold - cards below this need immediate review */
  CRITICAL: 0.85,
  
  /** Optimal range upper bound */
  OPTIMAL_MAX: 0.92,
  
  /** High retrievability threshold - cards above this are fresh */
  HIGH: 0.9,
  
  /** Low retrievability threshold - cards below this are at risk */
  LOW: 0.7,
} as const;
