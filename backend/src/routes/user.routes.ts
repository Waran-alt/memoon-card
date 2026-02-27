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
  updateKnowledgeEnabled,
} from '@/services/user-settings.service';
import { UpdateUserSettingsSchema } from '@/schemas/user-settings.schemas';

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
 * Update settings. Body: { session_auto_end_away_minutes?: number (1–120), knowledge_enabled?: boolean }.
 */
router.patch(
  '/settings',
  asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    const parsed = UpdateUserSettingsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid body',
        details: parsed.error.flatten(),
      });
    }
    const data = parsed.data;
    if (data.session_auto_end_away_minutes !== undefined) {
      await updateSessionAutoEndAwayMinutes(userId, data.session_auto_end_away_minutes);
    }
    if (data.knowledge_enabled !== undefined) {
      await updateKnowledgeEnabled(userId, data.knowledge_enabled);
    }
    const settings = await getStudySessionSettings(userId);
    return res.json({ success: true, data: settings });
  })
);

export default router;
