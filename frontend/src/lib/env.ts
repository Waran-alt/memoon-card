/**
 * Default backend URL when NEXT_PUBLIC_API_URL is unset.
 * Must match frontend/env-defaults.cjs DEFAULT_BACKEND_URL (used by next.config and server-side).
 */
export const DEFAULT_BACKEND_URL = 'http://localhost:4002';

/**
 * Client-side API base URL (browser only).
 * - Set NEXT_PUBLIC_API_URL="" when behind nginx so requests are same-origin and cookies work.
 * - Unset or set to backend URL for local dev without a proxy.
 * For server-side backend URL (e.g. getSession), use getServerBackendUrl from auth or env-defaults.
 * Values are visible in the browser bundle — no API keys here (grid 4.1).
 */
export function getClientApiBaseUrl(): string {
  const v = process.env.NEXT_PUBLIC_API_URL;
  if (v === undefined) return DEFAULT_BACKEND_URL;
  return String(v).trim();
}
