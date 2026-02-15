/**
 * Augment Express Request with app-specific fields.
 * Uses global namespace to match express-serve-static-core's declaration merging.
 */
declare global {
  namespace Express {
    interface Request {
      userId?: string;
      requestId?: string;
      validatedQuery?: unknown;
    }
  }
}

export {};
