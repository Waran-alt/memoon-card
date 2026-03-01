/**
 * Validation limits shared by frontend (UI, client checks) and backend (API validation).
 * Single source of truth; both apps import from @memoon-card/shared.
 */
export const VALIDATION_LIMITS = {
  /** Deck title maximum length */
  DECK_TITLE_MAX: 200,
  /** Deck description maximum length */
  DECK_DESCRIPTION_MAX: 1000,
  /** Card recto/verso maximum length */
  CARD_CONTENT_MAX: 5000,
  /** Card comment maximum length */
  CARD_COMMENT_MAX: 2000,
  /** Knowledge content (textarea) maximum length */
  KNOWLEDGE_CONTENT_MAX: 10000,
  /** Batch review maximum count (backend) */
  BATCH_REVIEW_MAX: 100,
  /** Query limit maximum (backend) */
  QUERY_LIMIT_MAX: 100,
  /** Query limit minimum (backend) */
  QUERY_LIMIT_MIN: 1,
  /** Password minimum length */
  PASSWORD_MIN_LENGTH: 8,
  /** Password maximum length (backend; bcrypt uses first 72 bytes) */
  PASSWORD_MAX_LENGTH: 128,
  /** Refresh token max length (backend) */
  REFRESH_TOKEN_MAX_LENGTH: 2048,
  /** Email maximum length (backend) */
  EMAIL_MAX_LENGTH: 255,
  /** User name maximum length (backend) */
  USER_NAME_MAX_LENGTH: 255,
} as const;

/**
 * Study / learning interval constants.
 * Single source of truth for minimum interval (next_review floor, reverse-pair gap, Short-FSRS default).
 */
export const STUDY_INTERVAL = {
  /** Minimum interval in minutes (next_review advance, reverse-pair gap, learning default). */
  MIN_INTERVAL_MINUTES: 1,
  /** Maximum allowed for user setting learning_min_interval_minutes (1–120). */
  MAX_LEARNING_INTERVAL_MINUTES: 120,
} as const;
