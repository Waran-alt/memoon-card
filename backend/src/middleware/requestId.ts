/**
 * Request ID Middleware
 * 
 * Adds unique request ID for tracing
 */

import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

/**
 * Correlates logs and client errors. Accepts inbound `X-Request-ID` if short enough (tracing from proxy); else generates UUID.
 */
export function requestIdMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const incoming = req.headers['x-request-id'];
  const incomingId = typeof incoming === 'string' ? incoming.trim() : undefined;
  const requestId = incomingId && incomingId.length <= 128 ? incomingId : uuidv4();
  req.requestId = requestId;
  res.setHeader('X-Request-ID', requestId);
  next();
}
