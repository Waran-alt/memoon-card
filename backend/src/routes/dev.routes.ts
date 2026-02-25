/**
 * Dev-only routes: technical APIs (feature flags, DB tools, reserved panels).
 * Protected by requireDev. Admin cannot access these.
 */

import { Router } from 'express';
import { asyncHandler } from '@/middleware/errorHandler';
import { getUserId } from '@/middleware/auth';
import { validateParams, validateQuery, validateRequest } from '@/middleware/validation';
import {
  AdminFlagKeyParamSchema,
  AdminOverridesQuerySchema,
  AdminUpdateFeatureFlagSchema,
  AdminUpsertFeatureFlagOverrideSchema,
  AdminUserIdParamSchema,
} from '@/schemas/admin.schemas';
import { AdminFeatureFlagsService } from '@/services/admin-feature-flags.service';
import { getMigrationStatus } from '@/services/dev-db.service';
import { NotFoundError } from '@/utils/errors';

const router = Router();
const adminFeatureFlagsService = new AdminFeatureFlagsService();

type RequestWithValidatedQuery = Express.Request & {
  validatedQuery?: { limit?: number };
};
type RequestWithValidatedParams = Express.Request & {
  validatedParams?: { flagKey?: string; userId?: string };
};

router.get(
  '/feature-flags',
  asyncHandler(async (_req, res) => {
    const flags = await adminFeatureFlagsService.listFlags();
    return res.json({ success: true, data: { flags } });
  })
);

router.patch(
  '/feature-flags/:flagKey',
  validateParams(AdminFlagKeyParamSchema),
  validateRequest(AdminUpdateFeatureFlagSchema),
  asyncHandler(async (req, res) => {
    const devUserId = getUserId(req);
    const params = req as RequestWithValidatedParams;
    const flagKey = params.validatedParams?.flagKey ?? req.params.flagKey;
    const row = await adminFeatureFlagsService.updateFlag(devUserId, String(flagKey), {
      enabled: req.body.enabled,
      rolloutPercentage: req.body.rolloutPercentage,
      description: req.body.description ?? null,
    });
    if (!row) throw new NotFoundError('Feature flag');
    return res.json({ success: true, data: row });
  })
);

router.get(
  '/feature-flags/:flagKey/overrides',
  validateParams(AdminFlagKeyParamSchema),
  validateQuery(AdminOverridesQuerySchema),
  asyncHandler(async (req, res) => {
    const params = req as RequestWithValidatedParams;
    const query = req as RequestWithValidatedQuery;
    const flagKey = params.validatedParams?.flagKey ?? req.params.flagKey;
    const limit = query.validatedQuery?.limit ?? 50;
    const rows = await adminFeatureFlagsService.listOverrides(String(flagKey), limit);
    return res.json({ success: true, data: { flagKey, limit, rows } });
  })
);

router.put(
  '/feature-flags/:flagKey/overrides/:userId',
  validateParams(AdminFlagKeyParamSchema.merge(AdminUserIdParamSchema)),
  validateRequest(AdminUpsertFeatureFlagOverrideSchema),
  asyncHandler(async (req, res) => {
    const devUserId = getUserId(req);
    const params = req as RequestWithValidatedParams;
    const flagKey = params.validatedParams?.flagKey ?? req.params.flagKey;
    const userId = params.validatedParams?.userId ?? req.params.userId;
    const row = await adminFeatureFlagsService.upsertOverride(devUserId, String(flagKey), String(userId), {
      enabled: req.body.enabled,
      reason: req.body.reason ?? null,
    });
    return res.json({ success: true, data: row });
  })
);

router.delete(
  '/feature-flags/:flagKey/overrides/:userId',
  validateParams(AdminFlagKeyParamSchema.merge(AdminUserIdParamSchema)),
  asyncHandler(async (req, res) => {
    const devUserId = getUserId(req);
    const params = req as RequestWithValidatedParams;
    const flagKey = params.validatedParams?.flagKey ?? req.params.flagKey;
    const userId = params.validatedParams?.userId ?? req.params.userId;
    const deleted = await adminFeatureFlagsService.deleteOverride(
      devUserId,
      String(flagKey),
      String(userId)
    );
    if (!deleted) throw new NotFoundError('Feature flag override');
    return res.status(204).send();
  })
);

// --- Database (migration status only; run migrations via CLI) ---

router.get(
  '/db/status',
  asyncHandler(async (_req, res) => {
    const result = await getMigrationStatus();
    return res.json({ success: true, data: result });
  })
);

export default router;
