/**
 * Admin-only routes: user management (block users, assign roles).
 * Mounted behind authMiddleware + requireAdmin in index.ts (dev role is not admin).
 * Technical APIs and feature flags: /api/dev (requireDev).
 */

import { Router } from 'express';
import { asyncHandler } from '@/middleware/errorHandler';

const router = Router();

/**
 * List users (placeholder). Implement when user management is needed.
 */
router.get(
  '/users',
  asyncHandler(async (_req, res) => {
    return res.json({
      success: true,
      data: { users: [], message: 'User management API: list, block, assign role — coming soon.' },
    });
  })
);

export default router;
