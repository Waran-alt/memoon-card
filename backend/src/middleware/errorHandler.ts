/**
 * Error Handling Middleware
 * 
 * Centralized error handling with proper error messages
 */

import { Request, Response, NextFunction } from 'express';
import { AppError } from '@/utils/errors';
import { NODE_ENV } from '@/config/env';
import { logger, serializeError } from '@/utils/logger';

/** Paths where 401 is expected when unauthenticated; log briefly instead of full error. */
const EXPECTED_401_PATHS = ['/api/auth/session'];

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): Response {
  const isExpected401 =
    err instanceof AppError &&
    (err as AppError).statusCode === 401 &&
    EXPECTED_401_PATHS.includes(req.path);

  if (isExpected401) {
    logger.info('Expected unauthorized session check', {
      method: req.method,
      path: req.path,
      requestId: req.requestId,
    });
  } else {
    logger.error('Unhandled request error', {
      error: serializeError(err),
      path: req.path,
      method: req.method,
      userId: req.userId,
      requestId: req.requestId,
    });
  }

  // Handle known AppError instances
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
  
  // Handle unexpected errors
  const isDevelopment = NODE_ENV === 'development';
  
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
