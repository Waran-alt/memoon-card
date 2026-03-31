/**
 * User routes: settings (study preferences, knowledge, etc.).
 * Identity is always `getUserId(req)` from the JWT; the body must not name another user (admin overrides use admin routes).
 */

import { Router } from 'express';
import { getUserId } from '@/middleware/auth';
import { asyncHandler } from '@/middleware/errorHandler';
import {
  getStudySessionSettings,
  updateKnowledgeEnabled,
} from '@/services/user-settings.service';
import { UpdateUserSettingsSchema } from '@/schemas/user-settings.schemas';

const router = Router();

router.get(
  '/settings',
  asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    const settings = await getStudySessionSettings(userId);
    return res.json({ success: true, data: settings });
  })
);

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
    if (data.knowledge_enabled !== undefined) {
      await updateKnowledgeEnabled(userId, data.knowledge_enabled);
    }
    const settings = await getStudySessionSettings(userId);
    return res.json({ success: true, data: settings });
  })
);

export default router;
