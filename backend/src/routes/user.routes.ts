/**
 * User routes: settings (study session auto-end after away, etc.).
 * Requires auth (Bearer). Mount at /api/user with authMiddleware.
 */

import { Router } from 'express';
import { getUserId } from '@/middleware/auth';
import { asyncHandler } from '@/middleware/errorHandler';
import {
  getStudySessionSettings,
  updateSessionAutoEndAwayMinutes,
} from '@/services/user-settings.service';
import { UpdateSessionAutoEndAwaySchema } from '@/schemas/user-settings.schemas';

const router = Router();

/**
 * GET /api/user/settings
 * Returns study/session settings (e.g. session_auto_end_away_minutes).
 */
router.get(
  '/settings',
  asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    const settings = await getStudySessionSettings(userId);
    return res.json({ success: true, data: settings });
  })
);

/**
 * PATCH /api/user/settings
 * Update study/session settings. Body: { session_auto_end_away_minutes: number } (1–120).
 */
router.patch(
  '/settings',
  asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    const parsed = UpdateSessionAutoEndAwaySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid body',
        details: parsed.error.flatten(),
      });
    }
    const settings = await updateSessionAutoEndAwayMinutes(
      userId,
      parsed.data.session_auto_end_away_minutes
    );
    return res.json({ success: true, data: settings });
  })
);

export default router;
