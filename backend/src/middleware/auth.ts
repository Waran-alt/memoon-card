/**
 * Bearer access JWT (HS256, see security-jwt.constants). Sets req.userId; refresh stays httpOnly under routes/auth.
 * requireAdmin / requireDev load role from DB — mount after authMiddleware. getUserId is what routes use for tenant scope (grid 1.2, 1.7, 2.9).
 */

import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import {
  JWT_SECRET,
  JWT_ACCESS_EXPIRES_IN,
  JWT_REFRESH_EXPIRES_IN,
  JWT_REFRESH_TRUSTED_EXPIRES_IN,
} from '../config/env';
import { AuthenticationError, AuthorizationError } from '../utils/errors';
import { HTTP_HEADERS } from '../constants/http.constants';
import { JWT_SIGN_OPTIONS_BASE, JWT_VERIFY_OPTIONS } from '@/constants/security-jwt.constants';
import { pool } from '@/config/database';

export interface JWTPayload {
  userId: string;
  email?: string;
  jti?: string; // JWT ID – unique per refresh token to avoid duplicate hash when two refresh requests run in parallel
  /** Trusted device: longer-lived refresh; preserved across token rotation. */
  td?: boolean;
  iat?: number;
  exp?: number;
}

/**
 * Verifies Bearer access JWT only. Refresh tokens use httpOnly cookies and are checked under routes/auth.
 */
export function authMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new AuthenticationError('No token provided'));
  }

  const token = authHeader.substring(HTTP_HEADERS.BEARER_PREFIX_LENGTH);
  if (!token) return next(new AuthenticationError('Token is required'));

  try {
    const decoded = jwt.verify(token, JWT_SECRET, JWT_VERIFY_OPTIONS) as unknown as JWTPayload;
    if (!decoded.userId) return next(new AuthenticationError('Invalid token payload'));
    req.userId = decoded.userId;
    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      return next(new AuthenticationError('Token has expired'));
    }
    if (error instanceof jwt.JsonWebTokenError) {
      return next(new AuthenticationError('Invalid token'));
    }
    next(error);
  }
}


/**
 * Helper to get user ID from request
 * Throws error if not authenticated
 */
export function getUserId(req: Request): string {
  if (!req.userId) {
    throw new AuthenticationError('User not authenticated');
  }
  return req.userId;
}

/**
 * Load `users.role` for gates below. Admin and dev are distinct: admin !== dev (grid 1.7).
 */
async function getUserRole(userId: string): Promise<string | undefined> {
  const result = await pool.query<{ role: string }>(
    'SELECT role FROM users WHERE id = $1',
    [userId]
  );
  return result.rows[0]?.role;
}

/** Must run after authMiddleware. */
export async function requireAdmin(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  const userId = getUserId(req);
  const role = await getUserRole(userId);
  if (role !== 'admin') {
    return next(new AuthorizationError('Admin access required'));
  }
  return next();
}

/** Must run after authMiddleware. Dev role does not grant admin routes. */
export async function requireDev(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  const userId = getUserId(req);
  const role = await getUserRole(userId);
  if (role !== 'dev') {
    return next(new AuthorizationError('Dev access required'));
  }
  return next();
}

/**
 * Generate JWT access token for user (short-lived)
 */
export function generateAccessToken(userId: string, email?: string): string {
  const payload: JWTPayload = {
    userId,
    email,
  };
  
  const expiresIn = JWT_ACCESS_EXPIRES_IN;
  
  return jwt.sign(payload, JWT_SECRET, {
    ...JWT_SIGN_OPTIONS_BASE,
    expiresIn,
  } as jwt.SignOptions);
}

/**
 * Generate JWT refresh token for user (long-lived).
 * Includes jti so each token has a unique hash, avoiding duplicate key when two refresh requests run in parallel.
 */
export function generateRefreshToken(
  userId: string,
  options?: { trustedDevice?: boolean }
): string {
  const trusted = options?.trustedDevice === true;
  const expiresIn = trusted ? JWT_REFRESH_TRUSTED_EXPIRES_IN : JWT_REFRESH_EXPIRES_IN;
  const payload: JWTPayload = {
    userId,
    jti: crypto.randomUUID(),
    ...(trusted ? { td: true } : {}),
  };

  return jwt.sign(payload, JWT_SECRET, {
    ...JWT_SIGN_OPTIONS_BASE,
    expiresIn,
  } as jwt.SignOptions);
}
