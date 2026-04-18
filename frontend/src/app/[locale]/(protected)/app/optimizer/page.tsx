'use client';

import { useState } from 'react';
import { useLocale } from 'i18n';
import apiClient, { getApiErrorMessage } from '@/lib/api';
import { useTranslation } from '@/hooks/useTranslation';
import { useApiGet } from '@/hooks/useApiGet';
import { Button } from '@/components/ui/Button';

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
  const { data: status, loading: statusLoading, error: statusError, refetch: refetchStatus } = useApiGet<OptimizationStatus>(
    '/api/optimization/status',
    { errorFallback: tc('invalidResponse') }
  );
  const [running, setRunning] = useState(false);
  const [runMessage, setRunMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  function handleRun() {
    if (!status?.canOptimize || running) return;
    setRunning(true);
    setRunMessage(null);
    apiClient
      .post<{ success: boolean; data?: { message?: string }; error?: string }>('/api/optimization/optimize', {})
      .then((res) => {
        if (res.data?.success) {
          setRunMessage({ type: 'success', text: ta('optimizerSuccess') });
          refetchStatus();
        } else {
          setRunMessage({ type: 'error', text: res.data?.error || ta('optimizerError') });
        }
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
      <p className="text-sm text-(--mc-text-secondary)">
        {tc('loading')}
      </p>
    );
  }

  if (statusError || !status) {
    return (
      <p className="text-sm text-(--mc-accent-danger)" role="alert">
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
      ? 'bg-(--mc-accent-warning)/15 text-(--mc-accent-warning'
      : status.status === 'OPTIMIZED'
        ? 'bg-(--mc-accent-success)/15 text-(--mc-accent-success)'
        : 'bg-(--mc-bg-card-back) text-(--mc-text-primary)';

  return (
    <div className="mc-study-page mx-auto max-w-2xl space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-(--mc-text-primary)">
          {ta('optimizerStatus')}
        </h2>
        <p className="mt-1 text-sm text-(--mc-text-secondary)">
          {ta('optimizerIntro')}
        </p>
      </div>

      <div className="mc-study-surface rounded-lg border p-4 shadow-sm">
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
                status.optimizerAvailable ? 'bg-(--mc-accent-success)' : 'bg-(--mc-accent-warning)'
              }`}
              aria-hidden
            />
            {status.optimizerAvailable
              ? ta('optimizerAvailable')
              : ta('optimizerNotAvailable')}
            {status.optimizerMethod && (
              <span className="text-(--mc-text-secondary)">
                ({status.optimizerMethod})
              </span>
            )}
          </li>
          {!status.optimizerAvailable && status.installationHint && (
            <li className="ml-4 text-(--mc-text-secondary)">
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
              <span className="text-(--mc-text-secondary)">
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
              ? 'text-sm text-(--mc-accent-success)'
              : 'text-sm text-(--mc-accent-danger)'
          }
        >
          {runMessage.text}
        </p>
      )}

      <Button type="button" onClick={handleRun} disabled={!status.canOptimize || running}>
        {running ? ta('runningOptimizer') : ta('runOptimizer')}
      </Button>
    </div>
  );
}
