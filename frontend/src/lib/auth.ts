/**
 * Server-only session check: forwards browser Cookie to GET /api/auth/session (httpOnly refresh).
 * Backend base URL must match next.config / Docker (BACKEND_URL, NEXT_PUBLIC_API_URL, env-defaults.cjs).
 */
import type { AuthUser } from '@/types';
import { DEFAULT_BACKEND_URL } from '@/lib/env';

/**
 * Server-side only. Backend URL for server-to-backend calls (e.g. getSession).
 * Logic MUST MATCH frontend/env-defaults.cjs getServerBackendUrl (used by next.config rewrites).
 * For client-side API base URL use getClientApiBaseUrl from @/lib/env.
 */
function getServerBackendUrl(): string {
  const backend = process.env.BACKEND_URL;
  if (backend && String(backend).trim()) return String(backend).trim();

  const v = process.env.NEXT_PUBLIC_API_URL;
  if (v !== undefined && v !== '') {
    const trimmed = String(v).trim();
    if (trimmed) return trimmed;
  }

  return DEFAULT_BACKEND_URL;
}

export type SessionResult = { user: AuthUser } | null;

export async function getSession(
  cookieStore: { getAll: () => Array<{ name: string; value: string }> }
): Promise<SessionResult> {
  // Server Components: forward browser cookies so backend can validate refresh_token httpOnly cookie.
  const url = `${getServerBackendUrl()}/api/auth/session`;
  const cookieHeader = cookieStore
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join('; ');
  try {
    const res = await fetch(url, {
      headers: cookieHeader ? { Cookie: cookieHeader } : {},
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.success || !data?.data?.user) return null;
    return { user: data.data.user };
  } catch (err) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[getSession] fetch failed:', (err as Error).message, '(url:', url, ')');
    }
    return null;
  }
}
