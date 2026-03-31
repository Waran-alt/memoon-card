/**
 * Helpers for auth routes: refresh cookie, password-reset base URL, session meta.
 */

import type { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { CORS_ORIGIN, getAllowedOrigins, NODE_ENV } from '@/config/env';
import { REFRESH_COOKIE } from '@/constants/http.constants';

/** Redact local-part for logs (never log full email in production). */
export function maskEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  const [name, domain] = normalized.split('@');
  if (!name || !domain) return 'invalid-email';
  const visible = name.slice(0, 2);
  return `${visible}${'*'.repeat(Math.max(1, name.length - 2))}@${domain}`;
}

export function authMeta(req: Request, email: string): Record<string, unknown> {
  return {
    requestId: req.requestId,
    path: req.path,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('user-agent') || 'unknown',
    email: maskEmail(email),
  };
}

export function toUserResponse(user: {
  id: string;
  email: string;
  name: string | null;
  role: 'user' | 'admin' | 'dev';
}) {
  return { id: user.id, email: user.email, name: user.name, role: user.role };
}

export function getSessionMeta(req: Request): { userAgent?: string; ipAddress?: string } {
  return {
    userAgent: req.get('user-agent') || undefined,
    ipAddress: req.ip || undefined,
  };
}

export function getRefreshTokenFromRequest(req: Request): string | undefined {
  const fromCookie = req.cookies?.[REFRESH_COOKIE.NAME];
  if (typeof fromCookie === 'string' && fromCookie) return fromCookie;
  return undefined;
}

function isSecureRequest(req: Request): boolean {
  return req.secure || req.get('x-forwarded-proto') === 'https';
}

/**
 * Optional `Domain=` for Set-Cookie. Only set when the request host is clearly the public app host
 * (or localhost dev), so we never broad-scope the refresh cookie to unrelated hosts.
 */
function getCookieDomain(req: Request): string | undefined {
  const host = req.get('x-forwarded-host') || req.get('host') || '';
  const h = host.split(':')[0];
  const allowed = getAllowedOrigins();
  const originHosts = allowed.map((o) => {
    try {
      return new URL(o).hostname;
    } catch {
      return o;
    }
  });
  if (h === 'localhost' && originHosts.includes('localhost')) return 'localhost';
  // Backend container hostname (e.g. contains "backend") → host-only cookie, no Domain attribute.
  if (!h || h.includes('backend')) return undefined;
  if (!originHosts.includes(h)) return undefined;
  return h;
}

/** Align browser cookie lifetime with JWT `exp` (trusted-device refresh = longer TTL). Cap avoids absurd values. */
function refreshCookieMaxAgeMs(refreshToken: string): number {
  const decoded = jwt.decode(refreshToken) as { exp?: number } | null;
  if (decoded?.exp && typeof decoded.exp === 'number') {
    const msLeft = decoded.exp * 1000 - Date.now();
    const cap = 366 * 24 * 60 * 60 * 1000;
    return Math.min(Math.max(0, msLeft), cap);
  }
  return REFRESH_COOKIE.MAX_AGE_MS;
}

export function setRefreshCookie(req: Request, res: Response, refreshToken: string): void {
  const secure = NODE_ENV === 'production' || isSecureRequest(req);
  const domain = getCookieDomain(req);
  res.cookie(REFRESH_COOKIE.NAME, refreshToken, {
    httpOnly: true,
    secure,
    sameSite: REFRESH_COOKIE.SAME_SITE,
    maxAge: refreshCookieMaxAgeMs(refreshToken),
    path: '/',
    ...(domain && { domain }),
  });
}

export function clearRefreshCookie(req: Request, res: Response): void {
  const secure = NODE_ENV === 'production' || isSecureRequest(req);
  const domain = getCookieDomain(req);
  res.clearCookie(REFRESH_COOKIE.NAME, {
    path: '/',
    httpOnly: true,
    secure,
    sameSite: REFRESH_COOKIE.SAME_SITE,
    ...(domain && { domain }),
  });
}

/**
 * Password-reset link poisoning mitigation: only allow origins already trusted for CORS.
 * Arbitrary `resetLinkBaseUrl` from the client is ignored if not in that allowlist.
 */
export function resolvePasswordResetBaseUrl(clientSuggested: string | undefined): string {
  const fallback = CORS_ORIGIN.replace(/\/$/, '');
  const trimmed = clientSuggested?.trim();
  if (!trimmed) return fallback;
  let candidateOrigin: string;
  try {
    candidateOrigin = new URL(trimmed).origin;
  } catch {
    return fallback;
  }
  const allowedOrigins = getAllowedOrigins().map((o) => {
    try {
      return new URL(o).origin;
    } catch {
      return o.replace(/\/$/, '');
    }
  });
  if (allowedOrigins.includes(candidateOrigin)) {
    return candidateOrigin.replace(/\/$/, '');
  }
  return fallback;
}
