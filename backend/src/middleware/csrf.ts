/**
 * CSRF Protection Middleware
 * 
 * Implements Double Submit Cookie pattern for CSRF protection
 * Since we use JWT in Authorization header (not cookies), we use a simpler approach:
 * - Require custom header (X-Requested-With) for state-changing requests
 * - Validate Origin header matches CORS configuration
 */

import { Request, Response, NextFunction } from 'express';
import { CORS_ORIGIN, CORS_ORIGINS } from '@/config/env';
import { ValidationError } from '@/utils/errors';

/**
 * Get allowed origins for CSRF validation
 */
function getAllowedOrigins(): string[] {
  if (CORS_ORIGINS) {
    return CORS_ORIGINS.split(',').map(origin => origin.trim());
  }
  return [CORS_ORIGIN];
}

/**
 * CSRF Protection Middleware
 * 
 * Validates:
 * 1. Origin header matches allowed origins
 * 2. Custom header (X-Requested-With) is present for state-changing requests
 * 
 * This works because:
 * - Browsers enforce Same-Origin Policy for custom headers
 * - Malicious sites cannot set custom headers in cross-origin requests
 */
export function csrfProtection(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Skip CSRF for safe methods (GET, HEAD, OPTIONS)
  const safeMethods = ['GET', 'HEAD', 'OPTIONS'];
  if (safeMethods.includes(req.method)) {
    return next();
  }

  const allowedOrigins = getAllowedOrigins();
  const origin = req.headers.origin;
  const referer = req.headers.referer;

  // Validate Origin header
  if (origin) {
    if (!allowedOrigins.includes(origin)) {
      res.status(403).json({
        success: false,
        error: 'CSRF validation failed: Invalid origin',
      });
      return;
    }
  } else if (referer) {
    // Fallback to Referer if Origin not present
    try {
      const refererOrigin = new URL(referer).origin;
      if (!allowedOrigins.includes(refererOrigin)) {
        res.status(403).json({
          success: false,
          error: 'CSRF validation failed: Invalid referer',
        });
        return;
      }
    } catch (error) {
      // Malformed referer URL
      res.status(403).json({
        success: false,
        error: 'CSRF validation failed: Malformed referer URL',
      });
      return;
    }
  } else {
    // Require custom header for additional protection
    // Browsers cannot set custom headers in cross-origin requests
    const customHeader = req.headers['x-requested-with'];
    
    if (!customHeader) {
      res.status(403).json({
        success: false,
        error: 'CSRF validation failed: Missing required header',
        hint: 'Include X-Requested-With header in requests',
      });
      return;
    }
  }

  next();
}

