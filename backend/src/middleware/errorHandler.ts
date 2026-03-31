/**
 * Last Express middleware: JSON error responses. AppError.message is meant for the client — never embed secrets.
 * Production: generic 500 body; stack/path only in development (grid 2.10).
 * AuthenticationError (401): logged at info — operational unauthenticated traffic, not logged as errors (grid 8.1).
 */

import { Request, Response, NextFunction } from 'express';
import { AppError, AuthenticationError } from '@/utils/errors';
import { NODE_ENV } from '@/config/env';
import { logger, serializeError } from '@/utils/logger';

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): Response {
  // 401 from auth middleware / getUserId is operational — avoid ERROR noise in logs and tests (grid 8.1).
  if (err instanceof AuthenticationError) {
    const base = { method: req.method, path: req.path, requestId: req.requestId };
    if (req.path === '/api/auth/session') {
      logger.info('Expected unauthorized session check', base);
    } else {
      logger.info('Unauthenticated API request', { ...base, reason: err.message });
    }
  } else {
    logger.error('Unhandled request error', {
      error: serializeError(err),
      path: req.path,
      method: req.method,
      userId: req.userId,
      requestId: req.requestId,
    });
  }

  // Responses include requestId for log correlation (opaque per request).
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      error: err.message,
      requestId: req.requestId,
      ...(NODE_ENV === 'development' && {
        stack: err.stack,
        path: req.path,
      }),
    });
  }

  // Handle errors with statusCode (e.g. from other modules in tests)
  const code = (err as { statusCode?: number }).statusCode;
  if (typeof code === 'number' && code >= 400 && code < 600) {
    return res.status(code).json({
      success: false,
      error: err.message,
      requestId: req.requestId,
      ...(NODE_ENV === 'development' && { stack: err.stack, path: req.path }),
    });
  }
  
  const isDevelopment = NODE_ENV === 'development';
  // Generic message in prod: avoid leaking implementation details or paths.
  return res.status(500).json({
    success: false,
    error: isDevelopment ? err.message : 'An internal error occurred',
    requestId: req.requestId,
    ...(isDevelopment && {
      stack: err.stack,
      path: req.path,
    }),
  });
}

/**
 * Async error wrapper
 * Catches async errors and passes them to error handler
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
