/**
 * Authentication Middleware
 * 
 * JWT token verification and user authentication
 */

import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { JWT_SECRET, JWT_ACCESS_EXPIRES_IN, JWT_REFRESH_EXPIRES_IN } from '../config/env';
import { AuthenticationError, AuthorizationError } from '../utils/errors';
import { HTTP_HEADERS } from '../constants/http.constants';
import { pool } from '@/config/database';

export interface JWTPayload {
  userId: string;
  email?: string;
  jti?: string; // JWT ID – unique per refresh token to avoid duplicate hash when two refresh requests run in parallel
  iat?: number;
  exp?: number;
}

/**
 * Authentication middleware
 * Verifies JWT token and extracts user ID. Throws AuthenticationError for errorHandler.
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
    const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload;
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
 * Admin-only middleware (user management: block users, assign roles).
 * Requires authMiddleware to run first and populate req.userId.
 */
export async function requireAdmin(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  const userId = getUserId(req);
  const result = await pool.query<{ role: string }>(
    'SELECT role FROM users WHERE id = $1',
    [userId]
  );
  const role = result.rows[0]?.role;
  if (role !== 'admin') {
    return next(new AuthorizationError('Admin access required'));
  }
  return next();
}

/**
 * Dev-only middleware (technical APIs: feature flags, debug, reserved panels).
 * Requires authMiddleware to run first and populate req.userId.
 */
export async function requireDev(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  const userId = getUserId(req);
  const result = await pool.query<{ role: string }>(
    'SELECT role FROM users WHERE id = $1',
    [userId]
  );
  const role = result.rows[0]?.role;
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
    expiresIn,
  } as jwt.SignOptions);
}

/**
 * Generate JWT refresh token for user (long-lived).
 * Includes jti so each token has a unique hash, avoiding duplicate key when two refresh requests run in parallel.
 */
export function generateRefreshToken(userId: string): string {
  const payload: JWTPayload = {
    userId,
    jti: crypto.randomUUID(),
  };

  const expiresIn = JWT_REFRESH_EXPIRES_IN;

  return jwt.sign(payload, JWT_SECRET, {
    expiresIn,
  } as jwt.SignOptions);
}

