/**
 * Input Validation Constants
 * 
 * Maximum lengths and limits for user input validation
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
  
  /** Batch review maximum count */
  BATCH_REVIEW_MAX: 100,
  
  /** Query limit maximum */
  QUERY_LIMIT_MAX: 100,
  
  /** Query limit minimum */
  QUERY_LIMIT_MIN: 1,

  /** Password minimum length (auth) */
  PASSWORD_MIN_LENGTH: 8,

  /** Password maximum length (auth) - prevents bcrypt DoS; bcrypt uses first 72 bytes */
  PASSWORD_MAX_LENGTH: 128,

  /** Refresh token max length (JWT can be ~1–2KB) */
  REFRESH_TOKEN_MAX_LENGTH: 2048,

  /** Email maximum length */
  EMAIL_MAX_LENGTH: 255,

  /** User name maximum length */
  USER_NAME_MAX_LENGTH: 255,
} as const;
