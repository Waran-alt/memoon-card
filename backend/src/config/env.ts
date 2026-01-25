/**
 * Environment Configuration Validation
 * 
 * Validates and provides type-safe access to environment variables
 */

import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

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
  RATE_LIMIT_MAX: z.string().regex(/^\d+$/).transform(Number).default(() => 100),
  
  // Request limits
  MAX_REQUEST_SIZE: z.string().default('10mb'),
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
  MAX_REQUEST_SIZE,
} = config;
