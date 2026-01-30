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

/** Stricter rate limit for auth (login/register) to mitigate brute force */
export const AUTH_RATE_LIMIT = {
  WINDOW_MS: 15 * 60 * 1000, // 15 minutes
  MAX: 10, // max attempts per window per IP
} as const;
