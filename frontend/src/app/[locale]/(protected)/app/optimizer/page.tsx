'use client';

import { useState } from 'react';
import { useLocale } from 'i18n';
import apiClient, { getApiErrorMessage } from '@/lib/api';
import { useTranslation } from '@/hooks/useTranslation';
import { useApiGet } from '@/hooks/useApiGet';

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

interface ShortTermOptimizationStatus {
  shortTermOptimizerAvailable: boolean;
  canOptimize: boolean;
  learningReviewCount: number;
  minRequired: number;
  status: OptimizationStatusState;
  newLearningReviewsSinceLast: number;
  daysSinceLast: number;
  minRequiredFirst: number;
  minRequiredSubsequent: number;
  minDaysSinceLast: number;
  lastOptimizedAt: string | null;
}

export default function OptimizerPage() {
  const { locale } = useLocale();
  const { t: tc } = useTranslation('common', locale);
  const { t: ta } = useTranslation('app', locale);
  const { data: status, loading: statusLoading, error: statusError, refetch: refetchStatus } = useApiGet<OptimizationStatus>(
    '/api/optimization/status',
    { errorFallback: tc('invalidResponse') }
  );
  const { data: shortTermStatus, loading: shortTermLoading, error: shortTermError, refetch: refetchShortTerm } = useApiGet<ShortTermOptimizationStatus>(
    '/api/optimization/short-term/status',
    { errorFallback: tc('invalidResponse') }
  );
  const [running, setRunning] = useState(false);
  const [runMessage, setRunMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [shortTermRunning, setShortTermRunning] = useState(false);
  const [shortTermMessage, setShortTermMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

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

  function handleRunShortTerm() {
    if (!shortTermStatus?.canOptimize || shortTermRunning) return;
    setShortTermRunning(true);
    setShortTermMessage(null);
    apiClient
      .post<{ success: boolean; data?: { message?: string }; error?: string }>('/api/optimization/short-term/optimize', {})
      .then((res) => {
        if (res.data?.success) {
          setShortTermMessage({ type: 'success', text: ta('shortTermOptimizerSuccess') });
          refetchShortTerm();
        } else {
          setShortTermMessage({ type: 'error', text: res.data?.error || ta('shortTermOptimizerError') });
        }
      })
      .catch((err) => {
        const msg =
          err?.response?.data?.error ||
          (err?.response?.data?.minRequired != null && err?.response?.data?.learningReviewCount != null
            ? ta('shortTermNotEnoughReviews', {
                vars: {
                  min: String(err.response.data.minRequired),
                  count: String(err.response.data.learningReviewCount ?? err.response.data.reviewCount ?? 0),
                },
              })
            : getApiErrorMessage(err, ta('shortTermOptimizerError')));
        setShortTermMessage({ type: 'error', text: msg });
      })
      .finally(() => setShortTermRunning(false));
  }

  if (statusLoading) {
    return (
      <p className="text-sm text-[var(--mc-text-secondary)]">
        {tc('loading')}
      </p>
    );
  }

  if (statusError || !status) {
    return (
      <p className="text-sm text-[var(--mc-accent-danger)]" role="alert">
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
      ? 'bg-[var(--mc-accent-warning)]/15 text-[var(--mc-accent-warning)]'
      : status.status === 'OPTIMIZED'
        ? 'bg-[var(--mc-accent-success)]/15 text-[var(--mc-accent-success)]'
        : 'bg-[var(--mc-bg-card-back)] text-[var(--mc-text-primary)]';

  return (
    <div className="mc-study-page mx-auto max-w-2xl space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-[var(--mc-text-primary)]">
          {ta('optimizerStatus')}
        </h2>
        <p className="mt-1 text-sm text-[var(--mc-text-secondary)]">
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
                status.optimizerAvailable ? 'bg-[var(--mc-accent-success)]' : 'bg-[var(--mc-accent-warning)]'
              }`}
              aria-hidden
            />
            {status.optimizerAvailable
              ? ta('optimizerAvailable')
              : ta('optimizerNotAvailable')}
            {status.optimizerMethod && (
              <span className="text-[var(--mc-text-secondary)]">
                ({status.optimizerMethod})
              </span>
            )}
          </li>
          {!status.optimizerAvailable && status.installationHint && (
            <li className="ml-4 text-[var(--mc-text-secondary)]">
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
              <span className="text-[var(--mc-text-secondary)]">
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
              ? 'text-sm text-[var(--mc-accent-success)]'
              : 'text-sm text-[var(--mc-accent-danger)]'
          }
        >
          {runMessage.text}
        </p>
      )}

      <button
        type="button"
        onClick={handleRun}
        disabled={!status.canOptimize || running}
        className="rounded-lg bg-[var(--mc-accent-success)] px-4 pt-1.5 pb-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {running ? ta('runningOptimizer') : ta('runOptimizer')}
      </button>

      {/* Short-term (learning) optimizer — learning params are not user-editable */}
      <div className="border-t border-[var(--mc-border-subtle)] pt-6 mt-6">
        <h2 className="text-lg font-semibold text-[var(--mc-text-primary)]">
          {ta('shortTermOptimizerTitle')}
        </h2>
        <p className="mt-1 text-sm text-[var(--mc-text-secondary)]">
          {ta('shortTermOptimizerIntro')}
        </p>
        {shortTermLoading || shortTermError || !shortTermStatus ? (
          <p className="mt-3 text-sm text-[var(--mc-text-secondary)]">
            {shortTermLoading ? tc('loading') : shortTermError || tc('invalidResponse')}
          </p>
        ) : (
          <>
            <div className="mc-study-surface rounded-lg border p-4 shadow-sm mt-3">
              <div className="mb-3">
                <span
                  className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    shortTermStatus.status === 'NOT_READY'
                      ? 'bg-[var(--mc-accent-warning)]/15 text-[var(--mc-accent-warning)]'
                      : shortTermStatus.status === 'OPTIMIZED'
                        ? 'bg-[var(--mc-accent-success)]/15 text-[var(--mc-accent-success)]'
                        : 'bg-[var(--mc-bg-card-back)] text-[var(--mc-text-primary)]'
                  }`}
                >
                  {shortTermStatus.status === 'NOT_READY'
                    ? ta('optimizerStatusNotReady')
                    : shortTermStatus.status === 'OPTIMIZED'
                      ? ta('optimizerStatusOptimized')
                      : ta('optimizerStatusReadyToUpgrade')}
                </span>
              </div>
              <ul className="space-y-2 text-sm">
                <li>
                  {ta('shortTermLearningReviewsCount', { vars: { count: shortTermStatus.learningReviewCount } })}
                  {shortTermStatus.status === 'NOT_READY' && (
                    <> · {ta('shortTermOptimizerFirstRunHint', { vars: { min: shortTermStatus.minRequiredFirst } })}</>
                  )}
                  {shortTermStatus.status === 'OPTIMIZED' && (
                    <> · {ta('shortTermOptimizerSubsequentHint', { vars: { min: shortTermStatus.minRequiredSubsequent, days: shortTermStatus.minDaysSinceLast } })}</>
                  )}
                  {shortTermStatus.status === 'READY_TO_UPGRADE' && !shortTermStatus.lastOptimizedAt && (
                    <> · {ta('shortTermOptimizerFirstRunHint', { vars: { min: shortTermStatus.minRequiredFirst } })}</>
                  )}
                  {shortTermStatus.status === 'READY_TO_UPGRADE' && shortTermStatus.lastOptimizedAt && (
                    <> · {ta('shortTermOptimizerSubsequentHint', { vars: { min: shortTermStatus.minRequiredSubsequent, days: shortTermStatus.minDaysSinceLast } })}</>
                  )}
                </li>
                <li>
                  {shortTermStatus.lastOptimizedAt
                    ? ta('lastOptimizedAt', {
                        vars: {
                          date: new Date(shortTermStatus.lastOptimizedAt).toLocaleDateString(locale, {
                            dateStyle: 'medium',
                            timeStyle: 'short',
                          }),
                        },
                      })
                    : ta('neverOptimized')}
                  {shortTermStatus.newLearningReviewsSinceLast > 0 && (
                    <span className="text-[var(--mc-text-secondary)]">
                      {' '}
                      ({ta('shortTermLearningReviewsCount', { vars: { count: shortTermStatus.newLearningReviewsSinceLast } })} {ta('since')})
                    </span>
                  )}
                </li>
              </ul>
            </div>
            {shortTermMessage && (
              <p
                role="alert"
                className={
                  shortTermMessage.type === 'success'
                    ? 'text-sm text-[var(--mc-accent-success)] mt-3'
                    : 'text-sm text-[var(--mc-accent-danger)] mt-3'
                }
              >
                {shortTermMessage.text}
              </p>
            )}
            <button
              type="button"
              onClick={handleRunShortTerm}
              disabled={!shortTermStatus.canOptimize || shortTermRunning}
              className="rounded-lg bg-[var(--mc-accent-primary)] px-4 pt-1.5 pb-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50 mt-3"
            >
              {shortTermRunning ? ta('runningOptimizer') : ta('runShortTermOptimizer')}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
