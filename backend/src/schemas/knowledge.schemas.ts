/**
 * Knowledge validation schemas
 */

import { z } from 'zod';

const KNOWLEDGE_CONTENT_MAX = 10000;

export const CreateKnowledgeSchema = z.object({
  content: z
    .string()
    .max(KNOWLEDGE_CONTENT_MAX, `Content must be at most ${KNOWLEDGE_CONTENT_MAX} characters`)
    .trim()
    .optional()
    .nullable()
    .transform((v) => v === '' ? null : v ?? null),
});

export const UpdateKnowledgeSchema = z.object({
  content: z
    .string()
    .max(KNOWLEDGE_CONTENT_MAX)
    .trim()
    .optional()
    .nullable()
    .transform((v) => v === '' ? null : v),
});

export const KnowledgeIdParamSchema = z.object({
  id: z.string().uuid('Invalid knowledge ID format'),
});
