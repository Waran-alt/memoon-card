/**
 * HTTP Status Codes and Response Constants
 */

export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
} as const;

export const HTTP_HEADERS = {
  /** CORS options success status */
  OPTIONS_SUCCESS_STATUS: 200,
  
  /** Bearer token prefix length */
  BEARER_PREFIX_LENGTH: 7, // "Bearer ".length
} as const;

export const SECURITY_HEADERS = {
  /** HSTS max age in seconds (1 year) */
  HSTS_MAX_AGE_SECONDS: 31536000,
  
  /** HSTS include subdomains */
  HSTS_INCLUDE_SUBDOMAINS: true,
  
  /** HSTS preload */
  HSTS_PRELOAD: true,
} as const;

/** Rate limit for login + register only (refresh/session are not counted). Per IP. */
export const AUTH_RATE_LIMIT = {
  WINDOW_MS: 15 * 60 * 1000, // 15 minutes
  /** Production cap for POST /login and /register only; refresh no longer shares this bucket. */
  MAX: 30,
} as const;

/** Refresh token httpOnly cookie (SSR + XSS-safe) */
export const REFRESH_COOKIE = {
  NAME: 'refresh_token',
  MAX_AGE_MS: 7 * 24 * 60 * 60 * 1000, // 7 days, match JWT_REFRESH_EXPIRES_IN
  SAME_SITE: 'lax' as const,
} as const;
