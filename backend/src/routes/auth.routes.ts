/**
 * Auth Routes
 *
 * Register, login, refresh, and session endpoints. No auth middleware; no CSRF on these routes.
 * Refresh token is set in httpOnly cookie for SSR and XSS safety.
 */

import { Router, Response } from 'express';
import jwt from 'jsonwebtoken';
import { userService } from '@/services/user.service';
import { generateAccessToken, generateRefreshToken, JWTPayload } from '@/middleware/auth';
import { asyncHandler } from '@/middleware/errorHandler';
import { validateRequest } from '@/middleware/validation';
import { RegisterSchema, LoginSchema, RefreshBodySchema, ForgotPasswordSchema, ResetPasswordSchema } from '@/schemas/auth.schemas';
import { AppError, AuthenticationError } from '@/utils/errors';
import { JWT_SECRET, NODE_ENV, getAllowedOrigins, CORS_ORIGIN } from '@/config/env';
import { REFRESH_COOKIE } from '@/constants/http.constants';
import { refreshTokenService } from '@/services/refresh-token.service';
import { passwordResetService } from '@/services/password-reset.service';
import { StudyHealthDashboardService } from '@/services/study-health-dashboard.service';
import type { Request } from 'express';
import { logger } from '@/utils/logger';

const router = Router();
const studyHealthDashboardService = new StudyHealthDashboardService();

function maskEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  const [name, domain] = normalized.split('@');
  if (!name || !domain) return 'invalid-email';
  const visible = name.slice(0, 2);
  return `${visible}${'*'.repeat(Math.max(1, name.length - 2))}@${domain}`;
}

function authMeta(req: Request, email: string): Record<string, unknown> {
  return {
    requestId: req.requestId,
    path: req.path,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('user-agent') || 'unknown',
    email: maskEmail(email),
  };
}

function toUserResponse(user: { id: string; email: string; name: string | null; role: 'user' | 'admin' | 'dev' }) {
  return { id: user.id, email: user.email, name: user.name, role: user.role };
}

function getSessionMeta(req: Request): { userAgent?: string; ipAddress?: string } {
  return {
    userAgent: req.get('user-agent') || undefined,
    ipAddress: req.ip || undefined,
  };
}

/** Read refresh token from httpOnly cookie only. */
function getRefreshTokenFromRequest(req: Request): string | undefined {
  const fromCookie = req.cookies?.[REFRESH_COOKIE.NAME];
  if (typeof fromCookie === 'string' && fromCookie) return fromCookie;
  return undefined;
}

/** Use Secure cookie when over HTTPS (direct or via proxy with X-Forwarded-Proto). */
function isSecureRequest(req: Request): boolean {
  return req.secure || req.get('x-forwarded-proto') === 'https';
}

/** When behind a proxy, use the frontend host so the cookie is stored for that host. Only allow if host matches an allowed origin. */
function getCookieDomain(req: Request): string | undefined {
  const host = req.get('x-forwarded-host') || req.get('host') || '';
  const h = host.split(':')[0];
  const allowed = getAllowedOrigins();
  const originHosts = allowed.map((o) => {
    try {
      return new URL(o).hostname;
    } catch {
      return o;
    }
  });
  // Backend often sees its own host (e.g. localhost:4002). If an allowed origin is localhost (e.g. :3002), set Domain=localhost so the cookie is sent to the app on another port.
  if (h === 'localhost' && originHosts.includes('localhost')) return 'localhost';
  if (!h || h.includes('backend')) return undefined;
  if (!originHosts.includes(h)) return undefined;
  return h;
}

function setRefreshCookie(req: Request, res: Response, refreshToken: string): void {
  const secure = NODE_ENV === 'production' || isSecureRequest(req);
  const domain = getCookieDomain(req);
  res.cookie(REFRESH_COOKIE.NAME, refreshToken, {
    httpOnly: true,
    secure,
    sameSite: REFRESH_COOKIE.SAME_SITE,
    maxAge: REFRESH_COOKIE.MAX_AGE_MS,
    path: '/',
    ...(domain && { domain }),
  });
}

function clearRefreshCookie(req: Request, res: Response): void {
  const secure = NODE_ENV === 'production' || isSecureRequest(req);
  const domain = getCookieDomain(req);
  res.clearCookie(REFRESH_COOKIE.NAME, {
    path: '/',
    httpOnly: true,
    secure,
    sameSite: REFRESH_COOKIE.SAME_SITE,
    ...(domain && { domain }),
  });
}

/**
 * POST /api/auth/register
 * Create account and return tokens
 */
router.post(
  '/register',
  validateRequest(RegisterSchema),
  asyncHandler(async (req, res) => {
    const { email, password, name } = req.body;
    const user = await userService.createUser(email, password, name);

    const accessToken = generateAccessToken(user.id, user.email);
    const refreshToken = generateRefreshToken(user.id);
    await refreshTokenService.createSession(user.id, refreshToken, getSessionMeta(req));

    setRefreshCookie(req, res, refreshToken);

    return res.status(201).json({
      success: true,
      data: {
        accessToken,
        user: toUserResponse(user),
      },
    });
  })
);

/**
 * POST /api/auth/login
 * Validate credentials and return tokens
 */
router.post(
  '/login',
  validateRequest(LoginSchema),
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const user = await userService.getUserByEmail(normalizedEmail);

    if (!user) {
      logger.warn('Login failed: user not found', {
        ...authMeta(req, normalizedEmail),
        reason: 'user_not_found',
      });
      throw new AuthenticationError('Invalid email or password');
    }

    const valid = await userService.verifyPassword(password, user.password_hash);
    if (!valid) {
      logger.warn('Login failed: invalid password', {
        ...authMeta(req, normalizedEmail),
        userId: user.id,
        reason: 'invalid_password',
      });
      throw new AuthenticationError('Invalid email or password');
    }

    const accessToken = generateAccessToken(user.id, user.email);
    const refreshToken = generateRefreshToken(user.id);
    await refreshTokenService.createSession(user.id, refreshToken, getSessionMeta(req));

    setRefreshCookie(req, res, refreshToken);

    logger.info('Login succeeded', {
      ...authMeta(req, normalizedEmail),
      userId: user.id,
    });

    return res.json({
      success: true,
      data: {
        accessToken,
        user: toUserResponse(user),
      },
    });
  })
);

/**
 * POST /api/auth/refresh
 * Exchange refresh token from httpOnly cookie for a new access token + rotated cookie
 */
router.post(
  '/refresh',
  validateRequest(RefreshBodySchema),
  asyncHandler(async (req, res) => {
    const startedAtMs = Date.now();
    let statusCode = 200;
    let outcome: string = 'success';
    let metricUserId: string | null = null;
    try {
      const token = getRefreshTokenFromRequest(req);

      if (!token) {
        throw new AuthenticationError('Refresh token cookie required');
      }

      let decoded: JWTPayload;
      try {
        decoded = jwt.verify(token, JWT_SECRET) as JWTPayload;
      } catch {
        throw new AuthenticationError('Invalid or expired refresh token');
      }

      if (!decoded.userId) {
        throw new AuthenticationError('Invalid refresh token');
      }
      metricUserId = decoded.userId;

      const user = await userService.getUserById(decoded.userId);
      if (!user) {
        throw new AuthenticationError('User not found');
      }

      const accessToken = generateAccessToken(decoded.userId, user.email);
      const newRefreshToken = generateRefreshToken(decoded.userId);
      await refreshTokenService.rotateSession(
        decoded.userId,
        token,
        newRefreshToken,
        getSessionMeta(req)
      );

      setRefreshCookie(req, res, newRefreshToken);

      return res.json({
        success: true,
        data: {
          accessToken,
          user: toUserResponse(user),
        },
      });
    } catch (error) {
      statusCode = error instanceof AppError ? error.statusCode : 500;
      const message = error instanceof Error ? error.message.toLowerCase() : '';
      outcome = message.includes('reuse') ? 'reuse_detected' : 'failure';
      throw error;
    } finally {
      void studyHealthDashboardService.recordAuthRefreshMetric({
        userId: metricUserId,
        statusCode,
        durationMs: Date.now() - startedAtMs,
        outcome,
      });
    }
  })
);

/**
 * GET /api/auth/session
 * Return current user from httpOnly refresh cookie (for SSR). No auth header required.
 */
router.get(
  '/session',
  asyncHandler(async (req, res) => {
    const token = getRefreshTokenFromRequest(req);

    if (!token) {
      throw new AuthenticationError('Not authenticated');
    }

    let decoded: JWTPayload;
    try {
      decoded = jwt.verify(token, JWT_SECRET) as JWTPayload;
    } catch {
      throw new AuthenticationError('Invalid or expired session');
    }

    if (!decoded.userId) {
      throw new AuthenticationError('Invalid session');
    }

    const user = await userService.getUserById(decoded.userId);
    if (!user) {
      throw new AuthenticationError('User not found');
    }
    await refreshTokenService.validateActiveToken(decoded.userId, token);

    return res.json({
      success: true,
      data: { user: toUserResponse(user) },
    });
  })
);

/**
 * POST /api/auth/forgot-password
 * Request a password reset. Always returns the same success message (do not reveal if email exists).
 * In development the reset link is logged to the server console.
 */
router.post(
  '/forgot-password',
  validateRequest(ForgotPasswordSchema),
  asyncHandler(async (req, res) => {
    const { email, resetLinkBaseUrl } = req.body;
    const user = await userService.getUserByEmail(email);
    if (user) {
      const { token, expiresAt } = await passwordResetService.createToken(user.id);
      const baseUrl = (resetLinkBaseUrl && String(resetLinkBaseUrl).trim()) || CORS_ORIGIN;
      const resetLink = `${baseUrl.replace(/\/$/, '')}/reset-password?token=${encodeURIComponent(token)}`;
      passwordResetService.sendResetEmail(user.email, resetLink);
    }
    return res.json({
      success: true,
      message: 'If an account exists for this email, you will receive a password reset link.',
    });
  })
);

/**
 * POST /api/auth/reset-password
 * Set a new password using a valid reset token. Token is single-use.
 */
router.post(
  '/reset-password',
  validateRequest(ResetPasswordSchema),
  asyncHandler(async (req, res) => {
    const { token, newPassword } = req.body;
    const userId = await passwordResetService.getUserIdForToken(token);
    if (!userId) {
      throw new AppError('Invalid or expired reset link. Please request a new one.', 400);
    }
    await userService.updatePassword(userId, newPassword);
    await passwordResetService.consumeToken(token);
    return res.json({ success: true, message: 'Password has been reset. You can sign in with your new password.' });
  })
);

/**
 * POST /api/auth/logout
 * Clear refresh cookie (client should discard access token).
 */
router.post(
  '/logout',
  asyncHandler(async (_req, res) => {
    const token = getRefreshTokenFromRequest(_req);
    if (token) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload;
        if (decoded.userId) {
          await refreshTokenService.revokeToken(decoded.userId, token);
        }
      } catch {
        // Cookie may already be invalid/expired.
      }
    }
    clearRefreshCookie(_req, res);
    return res.status(204).send();
  })
);

export default router;
