/**
 * Type declarations for Express Request extensions
 * Used in tests to ensure type safety
 */

import 'express';

declare global {
  namespace Express {
    interface Request {
      userId?: string;
      requestId?: string;
    }
  }
}
