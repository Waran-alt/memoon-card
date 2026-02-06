/**
 * FSRS Optimizer Integration Constants
 *
 * Thresholds aligned with FSRS community practice: first run needs enough data
 * for stable weights; subsequent runs need meaningful new data or time passed.
 */

export const OPTIMIZER_CONFIG = {
  /** Minimum total reviews for first optimization (stable weights) */
  MIN_REVIEW_COUNT_FIRST: 400,
  /** Minimum new reviews since last run for subsequent optimization */
  MIN_REVIEW_COUNT_SUBSEQUENT: 200,
  /** Minimum days since last optimization for subsequent run (or enough new reviews) */
  MIN_DAYS_SINCE_LAST_OPT: 14,
  /** @deprecated Use MIN_REVIEW_COUNT_FIRST for eligibility */
  MIN_REVIEW_COUNT: 400,

  /** Maximum buffer size for optimizer output (10MB) */
  MAX_BUFFER_BYTES: 10 * 1024 * 1024,
  
  /** Timeout for optimizer execution (5 minutes) */
  EXECUTION_TIMEOUT_MS: 300000,
  
  /** Timeout for checking optimizer availability (5 seconds) */
  CHECK_TIMEOUT_MS: 5000,
  
  /** Maximum length of error output to log (500 characters) */
  ERROR_OUTPUT_MAX_LENGTH: 500,
  
  /** Default timezone if not specified */
  DEFAULT_TIMEZONE: 'UTC',
  
  /** Default day start hour (4 AM) */
  DEFAULT_DAY_START: 4,

  /** Milliseconds per day (for days-since-last calculation) */
  MS_PER_DAY: 24 * 60 * 60 * 1000,
} as const;
