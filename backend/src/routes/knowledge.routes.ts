/**
 * Knowledge routes: CRUD for user-scoped knowledge (soft-delete only).
 * Mount at /api/knowledge with authMiddleware.
 */

import { Router } from 'express';
import { getUserId } from '@/middleware/auth';
import { asyncHandler } from '@/middleware/errorHandler';
import { validateRequest, validateParams } from '@/middleware/validation';
import { KnowledgeService } from '@/services/knowledge.service';
import {
  CreateKnowledgeSchema,
  UpdateKnowledgeSchema,
  KnowledgeIdParamSchema,
} from '@/schemas/knowledge.schemas';
import { NotFoundError } from '@/utils/errors';

const router = Router();
const knowledgeService = new KnowledgeService();

/** POST /api/knowledge — create knowledge. Body: { content?: string } */
router.post(
  '/',
  validateRequest(CreateKnowledgeSchema),
  asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    const content = (req.body as { content?: string | null }).content ?? null;
    const knowledge = await knowledgeService.create(userId, content);
    return res.status(201).json({ success: true, data: knowledge });
  })
);

/** GET /api/knowledge — list current user's knowledge (excludes soft-deleted) */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    const list = await knowledgeService.listByUserId(userId);
    return res.json({ success: true, data: list });
  })
);

/** GET /api/knowledge/:id — get one knowledge (own, not soft-deleted) */
router.get(
  '/:id',
  validateParams(KnowledgeIdParamSchema),
  asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    const id = String(req.params.id);
    const knowledge = await knowledgeService.getById(id, userId);
    if (!knowledge) throw new NotFoundError('Knowledge');
    return res.json({ success: true, data: knowledge });
  })
);

/** PATCH /api/knowledge/:id — update content only */
router.patch(
  '/:id',
  validateParams(KnowledgeIdParamSchema),
  validateRequest(UpdateKnowledgeSchema),
  asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    const id = String(req.params.id);
    const content = (req.body as { content?: string | null }).content;
    const knowledge = await knowledgeService.update(id, userId, content);
    if (!knowledge) throw new NotFoundError('Knowledge');
    return res.json({ success: true, data: knowledge });
  })
);

/** DELETE /api/knowledge/:id — soft-delete only */
router.delete(
  '/:id',
  validateParams(KnowledgeIdParamSchema),
  asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    const id = String(req.params.id);
    const knowledge = await knowledgeService.softDelete(id, userId);
    if (!knowledge) throw new NotFoundError('Knowledge');
    return res.json({ success: true, data: knowledge });
  })
);

export default router;
