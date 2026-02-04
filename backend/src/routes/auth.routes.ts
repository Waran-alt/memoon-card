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
import { RegisterSchema, LoginSchema, RefreshBodySchema } from '@/schemas/auth.schemas';
import { AuthenticationError } from '@/utils/errors';
import { JWT_SECRET, NODE_ENV, CORS_ORIGIN, CORS_ORIGINS } from '@/config/env';
import { REFRESH_COOKIE } from '@/constants/http.constants';
import type { Request } from 'express';

const router = Router();

/** Origins allowed for CORS; used to validate cookie domain is not attacker-controlled. */
function getAllowedOrigins(): string[] {
  if (CORS_ORIGINS) {
    return CORS_ORIGINS.split(',').map((o) => o.trim());
  }
  return [CORS_ORIGIN];
}

function toUserResponse(user: { id: string; email: string; name: string | null }) {
  return { id: user.id, email: user.email, name: user.name };
}

/** Read refresh token from httpOnly cookie or body (e.g. for non-cookie clients). */
function getRefreshTokenFromRequest(req: Request): string | undefined {
  const fromCookie = req.cookies?.[REFRESH_COOKIE.NAME];
  const fromBody = req.body?.refreshToken;
  if (typeof fromCookie === 'string' && fromCookie) return fromCookie;
  if (typeof fromBody === 'string' && fromBody) return fromBody;
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
  // Don't set domain for internal backend host or plain localhost (let browser use default)
  if (!h || h === 'localhost' || h.includes('backend')) return undefined;
  const allowed = getAllowedOrigins();
  const originHosts = allowed.map((o) => {
    try {
      return new URL(o).hostname;
    } catch {
      return o;
    }
  });
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

    setRefreshCookie(req, res, refreshToken);

    return res.status(201).json({
      success: true,
      data: {
        accessToken,
        refreshToken,
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
    const user = await userService.getUserByEmail(email);

    if (!user) {
      throw new AuthenticationError('Invalid email or password');
    }

    const valid = await userService.verifyPassword(password, user.password_hash);
    if (!valid) {
      throw new AuthenticationError('Invalid email or password');
    }

    const accessToken = generateAccessToken(user.id, user.email);
    const refreshToken = generateRefreshToken(user.id);

    setRefreshCookie(req, res, refreshToken);

    return res.json({
      success: true,
      data: {
        accessToken,
        refreshToken,
        user: toUserResponse(user),
      },
    });
  })
);

/**
 * POST /api/auth/refresh
 * Exchange refresh token (from httpOnly cookie or body) for new access + refresh tokens
 */
router.post(
  '/refresh',
  validateRequest(RefreshBodySchema),
  asyncHandler(async (req, res) => {
    const token = getRefreshTokenFromRequest(req);

    if (!token) {
      throw new AuthenticationError('Refresh token required (cookie or body)');
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

    const user = await userService.getUserById(decoded.userId);
    if (!user) {
      throw new AuthenticationError('User not found');
    }

    const accessToken = generateAccessToken(decoded.userId, user.email);
    const newRefreshToken = generateRefreshToken(decoded.userId);

    setRefreshCookie(req, res, newRefreshToken);

    return res.json({
      success: true,
      data: {
        accessToken,
        refreshToken: newRefreshToken,
        user: toUserResponse(user),
      },
    });
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

    return res.json({
      success: true,
      data: { user: toUserResponse(user) },
    });
  })
);

/**
 * POST /api/auth/logout
 * Clear refresh cookie (client should discard access token).
 */
router.post(
  '/logout',
  asyncHandler(async (_req, res) => {
    clearRefreshCookie(_req, res);
    return res.status(204).send();
  })
);

export default router;
