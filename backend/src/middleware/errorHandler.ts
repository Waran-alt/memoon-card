/**
 * Error Handling Middleware
 * 
 * Centralized error handling with proper error messages
 */

import { Request, Response, NextFunction } from 'express';
import { AppError } from '@/utils/errors';
import { NODE_ENV } from '@/config/env';

/**
 * Global error handler middleware
 */
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): Response {
  // Log error
  console.error('Error:', {
    message: err.message,
    stack: NODE_ENV === 'development' ? err.stack : undefined,
    path: req.path,
    method: req.method,
    userId: req.userId,
    requestId: req.requestId,
  });
  
  // Handle known AppError instances
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      error: err.message,
      ...(NODE_ENV === 'development' && {
        stack: err.stack,
        path: req.path,
      }),
    });
  }
  
  // Handle unexpected errors
  const isDevelopment = NODE_ENV === 'development';
  
  return res.status(500).json({
    success: false,
    error: isDevelopment ? err.message : 'An internal error occurred',
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
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
