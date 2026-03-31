/**
 * express-rate-limit for /api/auth. Forgot uses IP + per-email-hash buckets (grid 1.6).
 */
import { createHash } from 'crypto';
import type { Request } from 'express';
import rateLimit from 'express-rate-limit';
import {
  NODE_ENV,
  AUTH_RATE_LIMIT_WINDOW_MS,
  AUTH_RATE_LIMIT_MAX,
  FORGOT_PASSWORD_RATE_LIMIT_WINDOW_MS,
  FORGOT_PASSWORD_RATE_LIMIT_MAX,
  FORGOT_PASSWORD_EMAIL_RATE_LIMIT_WINDOW_MS,
  FORGOT_PASSWORD_EMAIL_RATE_LIMIT_MAX,
  RESET_PASSWORD_RATE_LIMIT_WINDOW_MS,
  RESET_PASSWORD_RATE_LIMIT_MAX,
} from '@/config/env';
import {
  AUTH_RATE_LIMIT,
  FORGOT_PASSWORD_RATE_LIMIT,
  FORGOT_PASSWORD_EMAIL_RATE_LIMIT,
  RESET_PASSWORD_RATE_LIMIT,
} from '@/constants/http.constants';

export const loginRegisterLimiter = rateLimit({
  windowMs: AUTH_RATE_LIMIT_WINDOW_MS ?? AUTH_RATE_LIMIT.WINDOW_MS,
  max:
    AUTH_RATE_LIMIT_MAX ??
    (NODE_ENV === 'production' ? AUTH_RATE_LIMIT.MAX : 2000),
  message: 'Too many login or registration attempts, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

export const forgotPasswordIpLimiter = rateLimit({
  windowMs: FORGOT_PASSWORD_RATE_LIMIT_WINDOW_MS ?? FORGOT_PASSWORD_RATE_LIMIT.WINDOW_MS,
  max: FORGOT_PASSWORD_RATE_LIMIT_MAX ?? FORGOT_PASSWORD_RATE_LIMIT.MAX,
  message: 'Too many password reset requests, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

function forgotPasswordEmailKey(req: Request): string {
  const b = req.body as { email?: unknown };
  const raw = typeof b?.email === 'string' ? b.email.trim().toLowerCase() : '';
  // Runs before Zod: invalid body falls back to IP-scoped key so we still rate-limit garbage traffic.
  if (!raw) {
    return `forgot:no-email:${req.ip ?? 'unknown'}`;
  }
  const h = createHash('sha256').update(raw).digest('hex');
  return `forgot:email:${h}`;
}

export const forgotPasswordEmailLimiter = rateLimit({
  windowMs:
    FORGOT_PASSWORD_EMAIL_RATE_LIMIT_WINDOW_MS ??
    FORGOT_PASSWORD_EMAIL_RATE_LIMIT.WINDOW_MS,
  max:
    FORGOT_PASSWORD_EMAIL_RATE_LIMIT_MAX ??
    FORGOT_PASSWORD_EMAIL_RATE_LIMIT.MAX,
  keyGenerator: (req) => forgotPasswordEmailKey(req as Request),
  message: 'Too many password reset requests for this email, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

export const resetPasswordLimiter = rateLimit({
  windowMs: RESET_PASSWORD_RATE_LIMIT_WINDOW_MS ?? RESET_PASSWORD_RATE_LIMIT.WINDOW_MS,
  max: RESET_PASSWORD_RATE_LIMIT_MAX ?? RESET_PASSWORD_RATE_LIMIT.MAX,
  message: 'Too many reset attempts, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});
