'use client';

import { useState, useEffect } from 'react';
import { useLocale } from 'i18n';
import apiClient, { getApiErrorMessage } from '@/lib/api';
import { useTranslation } from '@/hooks/useTranslation';

type OptimizationStatusState = 'NOT_READY' | 'OPTIMIZED' | 'READY_TO_UPGRADE';

interface OptimizationStatus {
  optimizerAvailable: boolean;
  optimizerMethod?: string;
  canOptimize: boolean;
  reviewCount: number;
  minRequired: number;
  status: OptimizationStatusState;
  newReviewsSinceLast: number;
  daysSinceLast: number;
  minRequiredFirst: number;
  minRequiredSubsequent: number;
  minDaysSinceLast: number;
  lastOptimizedAt: string | null;
  reviewCountSinceOptimization: number;
  installationHint?: string;
}

export default function OptimizerPage() {
  const { locale } = useLocale();
  const { t: tc } = useTranslation('common', locale);
  const { t: ta } = useTranslation('app', locale);
  const [status, setStatus] = useState<OptimizationStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [statusError, setStatusError] = useState('');
  const [running, setRunning] = useState(false);
  const [runMessage, setRunMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiClient
      .get<{ success: boolean; data: OptimizationStatus }>('/api/optimization/status')
      .then((res) => {
        if (res.data?.success && res.data.data && !cancelled) {
          setStatus(res.data.data);
        }
      })
      .catch(() => {
        if (!cancelled) setStatusError(tc('invalidResponse'));
      })
      .finally(() => {
        if (!cancelled) setStatusLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [locale, tc]);

  function handleRun() {
    if (!status?.canOptimize || running) return;
    setRunning(true);
    setRunMessage(null);
    apiClient
      .post<{ success: boolean; data?: { message?: string }; error?: string }>('/api/optimization/optimize', {})
      .then((res) => {
        if (res.data?.success) {
          setRunMessage({ type: 'success', text: ta('optimizerSuccess') });
          return apiClient.get<{ success: boolean; data: OptimizationStatus }>('/api/optimization/status');
        }
        setRunMessage({ type: 'error', text: res.data?.error || ta('optimizerError') });
      })
      .then((res) => {
        if (res?.data?.success && res.data.data) setStatus(res.data.data);
      })
      .catch((err) => {
        const msg =
          err?.response?.data?.error ||
          (err?.response?.data?.minRequired != null && err?.response?.data?.reviewCount != null
            ? ta('notEnoughReviews', {
                vars: {
                  min: String(err.response.data.minRequired),
                  count: String(err.response.data.reviewCount),
                },
              })
            : getApiErrorMessage(err, ta('optimizerError')));
        setRunMessage({ type: 'error', text: msg });
      })
      .finally(() => setRunning(false));
  }

  if (statusLoading) {
    return (
      <p className="text-sm text-neutral-500 dark:text-neutral-400">
        {tc('loading')}
      </p>
    );
  }

  if (statusError || !status) {
    return (
      <p className="text-sm text-red-600 dark:text-red-400" role="alert">
        {statusError || tc('invalidResponse')}
      </p>
    );
  }

  const lastRunFormatted =
    status.lastOptimizedAt &&
    new Date(status.lastOptimizedAt).toLocaleDateString(locale, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });

  const statusLabel =
    status.status === 'NOT_READY'
      ? ta('optimizerStatusNotReady')
      : status.status === 'OPTIMIZED'
        ? ta('optimizerStatusOptimized')
        : ta('optimizerStatusReadyToUpgrade');

  const statusColor =
    status.status === 'NOT_READY'
      ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200'
      : status.status === 'OPTIMIZED'
        ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200'
        : 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200';

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
          {ta('optimizerStatus')}
        </h2>
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
          {ta('optimizerIntro')}
        </p>
      </div>

      <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-700 dark:bg-neutral-800/50">
        <div className="mb-3">
          <span
            className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColor}`}
          >
            {statusLabel}
          </span>
        </div>
        <ul className="space-y-2 text-sm">
          <li className="flex items-center gap-2">
            <span
              className={`inline-block h-2 w-2 rounded-full ${
                status.optimizerAvailable ? 'bg-green-500' : 'bg-amber-500'
              }`}
              aria-hidden
            />
            {status.optimizerAvailable
              ? ta('optimizerAvailable')
              : ta('optimizerNotAvailable')}
            {status.optimizerMethod && (
              <span className="text-neutral-500 dark:text-neutral-400">
                ({status.optimizerMethod})
              </span>
            )}
          </li>
          {!status.optimizerAvailable && status.installationHint && (
            <li className="ml-4 text-neutral-600 dark:text-neutral-400">
              {ta('optimizerInstallHint')}
            </li>
          )}
          <li>
            {ta('reviewsCount', { vars: { count: status.reviewCount } })}
            {status.status === 'NOT_READY' && (
              <> · {ta('optimizerFirstRunHint', { vars: { min: status.minRequiredFirst } })}</>
            )}
            {status.status === 'OPTIMIZED' && (
              <> · {ta('optimizerSubsequentHint', { vars: { min: status.minRequiredSubsequent, days: status.minDaysSinceLast } })}</>
            )}
            {status.status === 'READY_TO_UPGRADE' && !status.lastOptimizedAt && (
              <> · {ta('optimizerFirstRunHint', { vars: { min: status.minRequiredFirst } })}</>
            )}
            {status.status === 'READY_TO_UPGRADE' && status.lastOptimizedAt && (
              <> · {ta('optimizerSubsequentHint', { vars: { min: status.minRequiredSubsequent, days: status.minDaysSinceLast } })}</>
            )}
          </li>
          <li>
            {lastRunFormatted
              ? ta('lastOptimizedAt', { vars: { date: lastRunFormatted } })
              : ta('neverOptimized')}
            {status.reviewCountSinceOptimization > 0 && (
              <span className="text-neutral-500 dark:text-neutral-400">
                {' '}
                ({ta('reviewsCount', { vars: { count: status.reviewCountSinceOptimization } })} {ta('since')})
              </span>
            )}
          </li>
        </ul>
      </div>

      {runMessage && (
        <p
          role="alert"
          className={
            runMessage.type === 'success'
              ? 'text-sm text-green-700 dark:text-green-400'
              : 'text-sm text-red-600 dark:text-red-400'
          }
        >
          {runMessage.text}
        </p>
      )}

      <button
        type="button"
        onClick={handleRun}
        disabled={!status.canOptimize || running}
        className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200"
      >
        {running ? ta('runningOptimizer') : ta('runOptimizer')}
      </button>
    </div>
  );
}
