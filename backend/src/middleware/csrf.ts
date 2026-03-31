/**
 * CSRF for mutating `/api/*` (mounted after `/api/auth` in index.ts so login/refresh stay exempt).
 * Allowed Origin or Referer origin, else require X-Requested-With (not sent on cross-site XHR by default).
 * Origins from getAllowedOrigins() — keep in sync with CORS (grid 2.2 / 2.3).
 */

import { Request, Response, NextFunction } from 'express';
import { getAllowedOrigins } from '@/config/env';

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
    } catch {
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

