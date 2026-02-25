/**
 * Category Validation Schemas
 */

import { z } from 'zod';

const CATEGORY_NAME_MAX = 255;

export const CreateCategorySchema = z.object({
  name: z.string().min(1, 'Name is required').max(CATEGORY_NAME_MAX).trim(),
});

export const UpdateCategorySchema = z.object({
  name: z.string().min(1, 'Name is required').max(CATEGORY_NAME_MAX).trim(),
});

export const CategoryIdParamSchema = z.object({
  id: z.string().uuid('Invalid category ID format'),
});
