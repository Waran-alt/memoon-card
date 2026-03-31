/**
 * App-wide limits. List/pagination caps should match Zod and shared VALIDATION_LIMITS where applicable.
 */

/**
 * Card and pre-study list limits (routes use Zod / validation middleware).
 */
export const API_LIMITS = {
  /** Default limit for card queries */
  DEFAULT_CARD_LIMIT: 20,
  
  /** Maximum limit for card queries */
  MAX_CARD_LIMIT: 100,
  
  /** Default limit for pre-study cards */
  DEFAULT_PRE_STUDY_LIMIT: 50,
  
  /** Maximum limit for pre-study cards */
  MAX_PRE_STUDY_LIMIT: 200,
} as const;

/**
 * Date/Time Constants
 */
export const TIME_CONSTANTS = {
  /** Milliseconds per day */
  MS_PER_DAY: 1000 * 60 * 60 * 24,
  
  /** Milliseconds per hour */
  MS_PER_HOUR: 1000 * 60 * 60,
  
  /** Hours per day */
  HOURS_PER_DAY: 24,
  
  /** Days per week */
  DAYS_PER_WEEK: 7,
  
  /** Days per month (approximate) */
  DAYS_PER_MONTH: 30,
} as const;

/**
 * Interval Message Thresholds
 */
export const INTERVAL_THRESHOLDS = {
  /** Less than 1 day - show in hours */
  ONE_DAY: 1,
  
  /** Less than 1 week - show in days */
  ONE_WEEK: 7,
  
  /** Less than 1 month - show in weeks */
  ONE_MONTH: 30,
} as const;

/**
 * Content Change Detection Constants
 */
export const CONTENT_CHANGE_THRESHOLDS = {
  /** Significant change threshold (percentage) */
  SIGNIFICANT: 30,
  
  /** Should reset stability threshold (percentage) */
  RESET: 50,
} as const;
