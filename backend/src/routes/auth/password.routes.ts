/**
 * POST /forgot-password (rate limits) and POST /reset-password. Same JSON on forgot to prevent enumeration (grid 1.5).
 */
import { Router } from 'express';
import { userService } from '@/services/user.service';
import { asyncHandler } from '@/middleware/errorHandler';
import { validateRequest } from '@/middleware/validation';
import { ForgotPasswordSchema, ResetPasswordSchema } from '@/schemas/auth.schemas';
import { AppError } from '@/utils/errors';
import { passwordResetService } from '@/services/password-reset.service';
import { resolvePasswordResetBaseUrl } from '@/routes/auth-route.helpers';
import {
  forgotPasswordEmailLimiter,
  forgotPasswordIpLimiter,
  resetPasswordLimiter,
} from './authLimiters';

export const passwordRouter = Router();

passwordRouter.post(
  '/forgot-password',
  forgotPasswordEmailLimiter,
  forgotPasswordIpLimiter,
  validateRequest(ForgotPasswordSchema),
  asyncHandler(async (req, res) => {
    const { email, resetLinkBaseUrl } = req.body as { email: string; resetLinkBaseUrl?: string };
    const user = await userService.getUserByEmail(email);
    if (user) {
      const { token } = await passwordResetService.createToken(user.id);
      const baseUrl = resolvePasswordResetBaseUrl(resetLinkBaseUrl);
      const resetLink = `${baseUrl}/reset-password?token=${encodeURIComponent(token)}`;
      passwordResetService.sendResetEmail(user.email, resetLink);
    }
    // Same payload whether or not the user exists — do not branch on existence (enumeration).
    return res.json({
      success: true,
      message: 'If an account exists for this email, you will receive a password reset link.',
    });
  })
);

passwordRouter.post(
  '/reset-password',
  resetPasswordLimiter,
  validateRequest(ResetPasswordSchema),
  asyncHandler(async (req, res) => {
    const { token, newPassword } = req.body;
    const userId = await passwordResetService.getUserIdForToken(token);
    if (!userId) {
      throw new AppError(400, 'Invalid or expired reset link. Please request a new one.');
    }
    await userService.updatePassword(userId, newPassword);
    await passwordResetService.consumeToken(token);
    return res.json({
      success: true,
      message: 'Password has been reset. You can sign in with your new password.',
    });
  })
);
