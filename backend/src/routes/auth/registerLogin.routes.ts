/**
 * POST /register and POST /login (loginRegisterLimiter). Issues Bearer access + httpOnly refresh cookie (grid 1.6, 1.3).
 */
import { Router } from 'express';
import { userService } from '@/services/user.service';
import { generateAccessToken, generateRefreshToken } from '@/middleware/auth';
import { asyncHandler } from '@/middleware/errorHandler';
import { validateRequest } from '@/middleware/validation';
import { RegisterSchema, LoginSchema } from '@/schemas/auth.schemas';
import { AuthenticationError } from '@/utils/errors';
import { refreshTokenService } from '@/services/refresh-token.service';
import { logger } from '@/utils/logger';
import {
  authMeta,
  getSessionMeta,
  setRefreshCookie,
  toUserResponse,
} from '@/routes/auth-route.helpers';
import { loginRegisterLimiter } from './authLimiters';

export const registerLoginRouter = Router();

registerLoginRouter.post(
  '/register',
  loginRegisterLimiter,
  validateRequest(RegisterSchema),
  asyncHandler(async (req, res) => {
    const { email, password, name, trustDevice } = req.body as {
      email: string;
      password: string;
      name?: string | null;
      trustDevice: boolean;
    };
    const user = await userService.createUser(email, password, name);
    const accessToken = generateAccessToken(user.id, user.email);
    const refreshToken = generateRefreshToken(user.id, { trustedDevice: trustDevice });
    await refreshTokenService.createSession(user.id, refreshToken, getSessionMeta(req));
    setRefreshCookie(req, res, refreshToken);
    return res.status(201).json({
      success: true,
      data: { accessToken, user: toUserResponse(user) },
    });
  })
);

registerLoginRouter.post(
  '/login',
  loginRegisterLimiter,
  validateRequest(LoginSchema),
  asyncHandler(async (req, res) => {
    const { email, password, trustDevice } = req.body as {
      email: string;
      password: string;
      trustDevice: boolean;
    };
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
    const refreshToken = generateRefreshToken(user.id, { trustedDevice: trustDevice });
    await refreshTokenService.createSession(user.id, refreshToken, getSessionMeta(req));
    setRefreshCookie(req, res, refreshToken);
    logger.info('Login succeeded', {
      ...authMeta(req, normalizedEmail),
      userId: user.id,
    });
    return res.json({
      success: true,
      data: { accessToken, user: toUserResponse(user) },
    });
  })
);
