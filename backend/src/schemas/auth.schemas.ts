/**
 * Auth Validation Schemas
 */

import { z } from 'zod';
import { VALIDATION_LIMITS } from '@/constants/validation.constants';

export const RegisterSchema = z.object({
  email: z
    .email()
    .max(VALIDATION_LIMITS.EMAIL_MAX_LENGTH, `Email must be at most ${VALIDATION_LIMITS.EMAIL_MAX_LENGTH} characters`)
    .transform((val) => val.trim().toLowerCase()),
  password: z
    .string()
    .min(VALIDATION_LIMITS.PASSWORD_MIN_LENGTH, `Password must be at least ${VALIDATION_LIMITS.PASSWORD_MIN_LENGTH} characters`)
    .max(VALIDATION_LIMITS.PASSWORD_MAX_LENGTH, `Password must be at most ${VALIDATION_LIMITS.PASSWORD_MAX_LENGTH} characters`),
  name: z
    .string()
    .max(VALIDATION_LIMITS.USER_NAME_MAX_LENGTH)
    .trim()
    .optional()
    .nullable(),
});

export const LoginSchema = z.object({
  email: z
    .email()
    .transform((val) => val.trim().toLowerCase()),
  password: z.string().min(1, 'Password is required'),
});

export const RefreshSchema = z.object({
  refreshToken: z
    .string()
    .min(1, 'Refresh token is required')
    .max(VALIDATION_LIMITS.REFRESH_TOKEN_MAX_LENGTH, 'Refresh token too long'),
});

/** Optional body for POST /refresh (token may come from cookie instead). */
export const RefreshBodySchema = z.object({
  refreshToken: z
    .string()
    .max(VALIDATION_LIMITS.REFRESH_TOKEN_MAX_LENGTH, 'Refresh token too long')
    .optional(),
});

export type RegisterInput = z.infer<typeof RegisterSchema>;
export type LoginInput = z.infer<typeof LoginSchema>;
export type RefreshInput = z.infer<typeof RefreshSchema>;
export type RefreshBodyInput = z.infer<typeof RefreshBodySchema>;
