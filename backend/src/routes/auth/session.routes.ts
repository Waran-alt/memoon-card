/**
 * POST /refresh and GET /session. Refresh rotation + session rows via refreshTokenService; cookie from auth-route.helpers.
 * Router is under /api/auth (before global CSRF on mutating /api — auth paths exempt by mount order, grid 1.3).
 */
import { Router } from 'express';
import { userService } from '@/services/user.service';
import { generateAccessToken, generateRefreshToken, JWTPayload } from '@/middleware/auth';
import { asyncHandler } from '@/middleware/errorHandler';
import { validateRequest } from '@/middleware/validation';
import { RefreshBodySchema } from '@/schemas/auth.schemas';
import { AppError, AuthenticationError } from '@/utils/errors';
import { refreshTokenService } from '@/services/refresh-token.service';
import { StudyHealthDashboardService } from '@/services/study-health-dashboard.service';
import {
  getRefreshTokenFromRequest,
  getSessionMeta,
  setRefreshCookie,
  toUserResponse,
} from '@/routes/auth-route.helpers';
import { verifyRefreshJwt } from './jwtRefreshVerify';

const studyHealthDashboardService = new StudyHealthDashboardService();

export const sessionRouter = Router();

sessionRouter.post(
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
        decoded = verifyRefreshJwt(token);
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
      const newRefreshToken = generateRefreshToken(decoded.userId, {
        trustedDevice: decoded.td === true,
      });
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

sessionRouter.get(
  '/session',
  asyncHandler(async (req, res) => {
    const token = getRefreshTokenFromRequest(req);

    if (!token) {
      throw new AuthenticationError('Not authenticated');
    }

    let decoded: JWTPayload;
    try {
      decoded = verifyRefreshJwt(token);
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
