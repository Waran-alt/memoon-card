/**
 * Environment Configuration Validation
 *
 * Loads env in order: root .env (shared) then backend/.env (backend-specific).
 * No forced overrides are used so container/runtime env stays highest priority.
 *
 * Precedence (highest -> lowest):
 * 1) Runtime env (e.g. docker compose `environment`, CI env, shell exports)
 * 2) backend/.env
 * 3) root .env
 */

import path from 'path';
import { z } from 'zod';
import dotenv from 'dotenv';

const backendRoot = path.resolve(__dirname, '..', '..');
const repoRoot =
  backendRoot.endsWith(`${path.sep}dist`) || backendRoot.endsWith('/dist')
    ? path.resolve(backendRoot, '..', '..')
    : path.resolve(backendRoot, '..');
dotenv.config({ path: path.join(repoRoot, '.env') });
dotenv.config({ path: path.join(backendRoot, '.env') });

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().regex(/^\d+$/).transform(Number).default(() => 4002),
  
  // Database
  POSTGRES_HOST: z.string().min(1),
  POSTGRES_PORT: z.string().regex(/^\d+$/).transform(Number).default(() => 5432),
  POSTGRES_DB: z.string().min(1),
  POSTGRES_USER: z.string().min(1),
  POSTGRES_PASSWORD: z.string().min(1),
  
  // JWT - Access Token (short-lived for API requests)
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'), // Recommended: 15m-1h
  // JWT - Refresh Token (long-lived for token renewal)
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'), // Recommended: 7d-30d
  
  // CORS
  CORS_ORIGIN: z.string().url().or(z.string().regex(/^http:\/\/localhost:\d+$/)).default('http://localhost:3002'),
  CORS_ORIGINS: z.string().optional(), // Comma-separated list
  
  // Security
  RATE_LIMIT_WINDOW_MS: z.string().regex(/^\d+$/).transform(Number).default(() => 900000), // 15 minutes
  RATE_LIMIT_MAX: z.string().regex(/^\d+$/).transform(Number).default(() => 300), // ~20/min; study sessions can be 50–150 requests (theorised, must be tested)
  /** Auth (login/register/refresh) rate limit – optional; defaults in http.constants.AUTH_RATE_LIMIT */
  AUTH_RATE_LIMIT_WINDOW_MS: z.string().regex(/^\d+$/).transform(Number).optional(),
  AUTH_RATE_LIMIT_MAX: z.string().regex(/^\d+$/).transform(Number).optional(),

  // Request limits
  MAX_REQUEST_SIZE: z.string().default('10mb'),

  // FSRS metrics aggregation job (Phase 1 observability)
  FSRS_METRICS_JOB_ENABLED: z.enum(['true', 'false']).optional(),
  FSRS_METRICS_JOB_INTERVAL_MINUTES: z.string().regex(/^\d+$/).transform(Number).optional(),
  FSRS_METRICS_JOB_BACKFILL_DAYS: z.string().regex(/^\d+$/).transform(Number).optional(),

  // Adaptive target retention (Phase 3)
  ADAPTIVE_RETENTION_ENABLED: z.enum(['true', 'false']).optional(),
  ADAPTIVE_RETENTION_MIN: z.string().regex(/^\d*\.?\d+$/).transform(Number).optional(),
  ADAPTIVE_RETENTION_MAX: z.string().regex(/^\d*\.?\d+$/).transform(Number).optional(),
  ADAPTIVE_RETENTION_DEFAULT: z.string().regex(/^\d*\.?\d+$/).transform(Number).optional(),
  ADAPTIVE_RETENTION_STEP: z.string().regex(/^\d*\.?\d+$/).transform(Number).optional(),

  // Adaptive policy telemetry tagging
  ADAPTIVE_POLICY_VERSION: z.string().min(1).max(64).optional(),

  // Dev user (auto-created/updated on startup when all three are set)
  DEV_EMAIL: z.string().optional().transform((s) => (s && s.trim()) || undefined),
  DEV_PASSWORD: z.string().optional().transform((s) => (s && s.trim()) || undefined),
  DEV_USERNAME: z.string().optional().transform((s) => (s && s.trim()) || undefined),
});

type Env = z.infer<typeof EnvSchema>;

let env: Env;

export function validateEnv(): Env {
  try {
    env = EnvSchema.parse(process.env);
    return env;
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('❌ Invalid environment configuration:');
      error.issues.forEach((issue) => {
        const path = issue.path.join('.');
        console.error(`  - ${path}: ${issue.message}`);
      });
      console.error('\nPlease check your .env file and ensure all required variables are set.');
      process.exit(1);
    }
    throw error;
  }
}

// Validate on import
export const config = validateEnv();

// Export individual config values
export const {
  NODE_ENV,
  PORT,
  POSTGRES_HOST,
  POSTGRES_PORT,
  POSTGRES_DB,
  POSTGRES_USER,
  POSTGRES_PASSWORD,
  JWT_SECRET,
  JWT_ACCESS_EXPIRES_IN,
  JWT_REFRESH_EXPIRES_IN,
  CORS_ORIGIN,
  CORS_ORIGINS,
  RATE_LIMIT_WINDOW_MS,
  RATE_LIMIT_MAX,
  AUTH_RATE_LIMIT_WINDOW_MS,
  AUTH_RATE_LIMIT_MAX,
  MAX_REQUEST_SIZE,
  FSRS_METRICS_JOB_ENABLED,
  FSRS_METRICS_JOB_INTERVAL_MINUTES,
  FSRS_METRICS_JOB_BACKFILL_DAYS,
  ADAPTIVE_RETENTION_ENABLED,
  ADAPTIVE_RETENTION_MIN,
  ADAPTIVE_RETENTION_MAX,
  ADAPTIVE_RETENTION_DEFAULT,
  ADAPTIVE_RETENTION_STEP,
  ADAPTIVE_POLICY_VERSION,
  DEV_EMAIL,
  DEV_PASSWORD,
  DEV_USERNAME,
} = config;

/** CORS allowed origins (from CORS_ORIGINS or [CORS_ORIGIN]). */
export function getAllowedOrigins(): string[] {
  if (config.CORS_ORIGINS) {
    return config.CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean);
  }
  return [config.CORS_ORIGIN];
}
