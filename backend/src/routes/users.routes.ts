/**
 * User-scoped routes (e.g. /api/users/me/...)
 */

import { Router } from 'express';
import { getUserId } from '@/middleware/auth';
import { asyncHandler } from '@/middleware/errorHandler';
import { validateParams, validateRequest } from '@/middleware/validation';
import { CreateCategorySchema, UpdateCategorySchema, CategoryIdParamSchema } from '@/schemas/category.schemas';
import { CategoryService } from '@/services/category.service';
import { NotFoundError } from '@/utils/errors';

const router = Router();
const categoryService = new CategoryService();

/**
 * GET /api/users/me/categories
 * List categories for the current user (optional card_count via query)
 */
router.get('/me/categories', asyncHandler(async (req, res) => {
  const userId = getUserId(req);
  const withCardCount = (req.query?.cardCount as string) === 'true' || (req.query?.cardCount as string) === '1';
  const list = await categoryService.listByUserId(userId, withCardCount);
  return res.json({ success: true, data: list });
}));

/**
 * POST /api/users/me/categories
 * Create a category
 */
router.post('/me/categories', validateRequest(CreateCategorySchema), asyncHandler(async (req, res) => {
  const userId = getUserId(req);
  const category = await categoryService.create(userId, req.body.name);
  return res.status(201).json({ success: true, data: category });
}));

/**
 * PATCH /api/users/me/categories/:id
 * Update a category
 */
router.patch('/me/categories/:id', validateParams(CategoryIdParamSchema), validateRequest(UpdateCategorySchema), asyncHandler(async (req, res) => {
  const userId = getUserId(req);
  const categoryId = String(req.params.id);
  const category = await categoryService.update(categoryId, userId, req.body.name);
  if (!category) throw new NotFoundError('Category');
  return res.json({ success: true, data: category });
}));

/**
 * DELETE /api/users/me/categories/:id
 * Delete a category (and remove from all card_categories)
 */
router.delete('/me/categories/:id', validateParams(CategoryIdParamSchema), asyncHandler(async (req, res) => {
  const userId = getUserId(req);
  const categoryId = String(req.params.id);
  const deleted = await categoryService.delete(categoryId, userId);
  if (!deleted) throw new NotFoundError('Category');
  return res.json({ success: true, message: 'Category deleted' });
}));

export default router;
