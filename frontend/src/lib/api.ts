/**
 * Browser client for backend `/api/*`.
 * - `X-Requested-With` on mutating methods: required by backend CSRF middleware for browser requests.
 * - `withCredentials`: sends httpOnly refresh cookie when API is same-origin or CORS allows credentials.
 * - 401: one retry after in-memory refresh (see `refreshPromise` dedupe).
 */
import axios, { type InternalAxiosRequestConfig } from 'axios';
import { getClientApiBaseUrl } from '@/lib/env';
import { useAuthStore } from '@/store/auth.store';

export { getClientApiBaseUrl };

const API_URL = getClientApiBaseUrl();
const X_REQUESTED_WITH = 'XMLHttpRequest';

interface RetryableConfig extends InternalAxiosRequestConfig {
  _retry?: boolean;
}

const apiClient = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
});

apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = useAuthStore.getState().accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  const method = config.method?.toUpperCase();
  if (method && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    config.headers['X-Requested-With'] = X_REQUESTED_WITH;
  }
  // So backend can set refresh cookie for this host when behind Next.js rewrite (same-origin).
  if (typeof window !== 'undefined') {
    config.headers['X-Forwarded-Host'] = window.location.host;
  }
  return config;
});

let refreshPromise: Promise<string | null> | null = null;

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const config = error.config as RetryableConfig | undefined;
    if (!config || error.response?.status !== 401 || config._retry) {
      return Promise.reject(error);
    }
    if (!refreshPromise) {
      refreshPromise = useAuthStore
        .getState()
        .refreshAccess()
        .finally(() => {
          refreshPromise = null;
        });
    }
    const token = await refreshPromise;
    if (!token) return Promise.reject(error);
    config._retry = true;
    config.headers.Authorization = `Bearer ${token}`;
    return apiClient(config);
  }
);

/** True if the error is from an aborted/cancelled request (e.g. AbortController). */
export function isRequestCancelled(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { name?: string; code?: string };
  return e.name === 'CanceledError' || e.name === 'AbortError' || e.code === 'ERR_CANCELED';
}

/** Extract error message from axios error or return fallback. */
export function getApiErrorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'response' in err) {
    const data = (err as { response?: { data?: { error?: string; message?: string } } }).response
      ?.data;
    if (typeof data?.error === 'string') return data.error;
    if (typeof data?.message === 'string') return data.message;
  }
  return fallback;
}

export default apiClient;
