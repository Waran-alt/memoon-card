/**
 * Request Validation Middleware
 * 
 * Validates request bodies using Zod schemas
 */

import { Request, Response, NextFunction } from 'express';
import { z, ZodSchema } from 'zod';
import { ValidationError } from '../utils/errors';

/**
 * Validate request body against Zod schema
 */
export function validateRequest(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      // Parse and validate request body
      req.body = schema.parse(req.body);
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        const validationError = new ValidationError('Validation failed');
        
        res.status(validationError.statusCode).json({
          success: false,
          error: validationError.message,
          details: error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        });
        return;
      }
      
      // Unexpected error
      next(error);
    }
  };
}

/**
 * Validate request query parameters
 */
export function validateQuery(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      // Express 5 makes req.query read-only; stash parsed query separately
      (req as Request & { validatedQuery?: unknown }).validatedQuery = schema.parse(req.query);
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        const validationError = new ValidationError('Invalid query parameters');
        
        res.status(validationError.statusCode).json({
          success: false,
          error: validationError.message,
          details: error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        });
        return;
      }
      
      next(error);
    }
  };
}

/**
 * Validate request parameters
 */
export function validateParams(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      req.params = schema.parse(req.params) as any;
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        const validationError = new ValidationError('Invalid route parameters');
        
        res.status(validationError.statusCode).json({
          success: false,
          error: validationError.message,
          details: error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        });
        return;
      }
      
      next(error);
    }
  };
}
