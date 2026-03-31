/**
 * POST /logout: revoke refresh session if cookie valid, clear httpOnly cookie (grid 1.3).
 */
import { Router } from 'express';
import type { Request } from 'express';
import { asyncHandler } from '@/middleware/errorHandler';
import { refreshTokenService } from '@/services/refresh-token.service';
import { clearRefreshCookie, getRefreshTokenFromRequest } from '@/routes/auth-route.helpers';
import { verifyRefreshJwt } from './jwtRefreshVerify';

export const logoutRouter = Router();

logoutRouter.post(
  '/logout',
  asyncHandler(async (_req: Request, res) => {
    const token = getRefreshTokenFromRequest(_req);
    if (token) {
      try {
        const decoded = verifyRefreshJwt(token);
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
