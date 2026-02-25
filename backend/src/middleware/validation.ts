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
        const isProduction = process.env.NODE_ENV === 'production';
        res.status(validationError.statusCode).json({
          success: false,
          error: validationError.message,
          ...(isProduction ? {} : { details: error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })) }),
        });
        return;
      }

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
      (req as Request & { validatedQuery?: unknown }).validatedQuery = schema.parse(req.query);
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        const validationError = new ValidationError('Invalid query parameters');
        const isProduction = process.env.NODE_ENV === 'production';
        res.status(validationError.statusCode).json({
          success: false,
          error: validationError.message,
          ...(isProduction ? {} : { details: error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })) }),
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
      req.params = schema.parse(req.params) as Record<string, string>;
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        const validationError = new ValidationError('Invalid route parameters');
        const isProduction = process.env.NODE_ENV === 'production';
        res.status(validationError.statusCode).json({
          success: false,
          error: validationError.message,
          ...(isProduction ? {} : { details: error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })) }),
        });
        return;
      }

      next(error);
    }
  };
}
