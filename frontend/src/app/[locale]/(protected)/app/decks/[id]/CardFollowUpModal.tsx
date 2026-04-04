'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Card } from '@/types';
import type { TranslationFunction } from '@/hooks/useTranslation';
import { formatCardDateOrTime, formatReviewLogGapMs, previewCardRecto } from './deckDetailHelpers';
import {
  getCardFollowUpEstimationKind,
  getNextReviewCalendarTone,
  calendarDaysFromTodayToNextReview,
  getLastReviewCalendarTone,
  calendarDaysSinceLastReview,
} from './cardFollowUpCopy';
import { CardReviewHistoryChart, type CardReviewLogPoint } from './CardReviewHistoryChart';
import { IconArrowsPointingIn, IconArrowsPointingOut, IconXMark } from './DeckUiIcons';

export type CardFollowUpModalProps = {
  card: Card;
  reviewLogs: CardReviewLogPoint[];
  loading: boolean;
  error: string;
  locale: string;
  ta: TranslationFunction;
  tc: TranslationFunction;
  panelRef: React.RefObject<HTMLDivElement | null>;
  onClose: () => void;
  onEditCard: () => void;
  onTreatAsNew: () => void;
  treatAsNewDisabled: boolean;
  actionLoading: boolean;
};

export function CardFollowUpModal({
  card,
  reviewLogs,
  loading,
  error,
  locale,
  ta,
  tc,
  panelRef,
  onClose,
  onEditCard,
  onTreatAsNew,
  treatAsNewDisabled,
  actionLoading,
}: CardFollowUpModalProps) {
  const [nowMs] = useState(() => Date.now());
  const [modalExpanded, setModalExpanded] = useState(false);
  const rectoPreview = useMemo(() => previewCardRecto(card.recto ?? '', 96), [card.recto]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const ratingLabel = useCallback(
    (rating: number) => {
      switch (rating) {
        case 1:
          return ta('again');
        case 2:
          return ta('hard');
        case 3:
          return ta('good');
        case 4:
          return ta('easy');
        default:
          return String(rating);
      }
    },
    [ta]
  );

  const chartLabels = useMemo(
    () => ({
      chartTitle: ta('cardFollowUpChartTitle'),
      axisStability: ta('cardFollowUpAxisStability'),
      axisDifficulty: ta('cardFollowUpAxisDifficulty'),
      axisRetrievability: ta('cardFollowUpAxisRetrievabilityShort'),
      axisReviewOrder: ta('cardFollowUpAxisReviewOrder'),
      axisTimeCaption: ta('cardFollowUpAxisTimeCaption'),
      chartXAxisSwitchToTime: ta('cardFollowUpChartXAxisSwitchToTime'),
      chartXAxisSwitchToIndex: ta('cardFollowUpChartXAxisSwitchToIndex'),
      srCaption: ta('cardFollowUpChartSrCaption'),
    }),
    [ta]
  );

  const formatLogGap = useCallback(
    (deltaMs: number | null) => {
      if (deltaMs == null) return ta('cardFollowUpReviewLogFirst');
      return ta('cardFollowUpReviewLogSincePrevious', {
        vars: { gap: formatReviewLogGapMs(deltaMs, locale) },
      });
    },
    [locale, ta]
  );

  const nextReviewPrimary = formatCardDateOrTime(card.next_review, locale, nowMs);
  const nextTone = getNextReviewCalendarTone(card.next_review, nowMs);
  const nextContextLine = (() => {
    if (nextTone === 'past') {
      return ta('cardFollowUpNextContextPast', { vars: { date: nextReviewPrimary } });
    }
    if (nextTone === 'today') return ta('cardFollowUpNextContextToday');
    if (nextTone === 'tomorrow') return ta('cardFollowUpNextContextTomorrow');
    const n = calendarDaysFromTodayToNextReview(card.next_review, nowMs);
    return ta('cardFollowUpNextContextInDays', { vars: { count: n } });
  })();

  const lastReviewBlock =
    card.last_review != null ? (
      <>
        <dt className="text-(--mc-text-secondary)">{ta('cardFollowUpLastReviewLabel')}</dt>
        <dd className="text-(--mc-text-primary)">{formatCardDateOrTime(card.last_review, locale, nowMs)}</dd>
        <dt className="sr-only">{ta('cardFollowUpLastReviewContextSr')}</dt>
        <dd className="col-span-2 text-xs text-(--mc-text-secondary)">
          {(() => {
            const tone = getLastReviewCalendarTone(card.last_review, nowMs);
            if (tone === 'today') return ta('cardFollowUpLastContextToday');
            if (tone === 'yesterday') return ta('cardFollowUpLastContextYesterday');
            const d = calendarDaysSinceLastReview(card.last_review, nowMs);
            return ta('cardFollowUpLastContextDaysAgo', { vars: { count: d } });
          })()}
        </dd>
      </>
    ) : null;

  const estimationPhraseKey = (() => {
    const kind = getCardFollowUpEstimationKind(card, nowMs);
    if (kind === 'high') return 'cardFollowUpEstimationHigh';
    if (kind === 'medium') return 'cardFollowUpEstimationMedium';
    if (kind === 'low') return 'cardFollowUpEstimationLow';
    return 'cardFollowUpEstimationUnknown';
  })();

  const isNewCard = !card.last_review;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-(--mc-overlay) p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="card-details-title"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        className={
          modalExpanded
            ? 'flex h-[min(calc(100dvh-2rem),calc(100vh-2rem))] w-full max-w-[min(calc(100vw-2rem),96rem)] flex-col rounded-xl border border-(--mc-border-subtle) bg-(--mc-bg-surface) shadow-xl'
            : 'flex max-h-[90vh] w-full max-w-xl flex-col rounded-xl border border-(--mc-border-subtle) bg-(--mc-bg-surface) shadow-xl'
        }
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-(--mc-border-subtle) px-4 py-3">
          <div className="min-w-0">
            <h3 id="card-details-title" className="text-lg font-semibold text-(--mc-text-primary)">
              {ta('cardDetailsTitle')}
            </h3>
            <p className="mt-0.5 truncate text-sm text-(--mc-text-secondary)" title={rectoPreview}>
              {rectoPreview}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => setModalExpanded((v) => !v)}
              className="rounded p-1 text-(--mc-text-secondary) hover:bg-(--mc-bg-card-back) hover:text-(--mc-text-primary)"
              aria-pressed={modalExpanded}
              title={modalExpanded ? ta('cardFollowUpModalCollapse') : ta('cardFollowUpModalExpand')}
              aria-label={modalExpanded ? ta('cardFollowUpModalCollapse') : ta('cardFollowUpModalExpand')}
            >
              {modalExpanded ? (
                <IconArrowsPointingIn className="h-5 w-5" />
              ) : (
                <IconArrowsPointingOut className="h-5 w-5" />
              )}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 rounded p-1 text-(--mc-text-secondary) hover:bg-(--mc-bg-card-back) hover:text-(--mc-text-primary)"
              aria-label={tc('close')}
            >
              <IconXMark className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          {loading ? (
            <p className="text-sm text-(--mc-text-secondary)">{ta('cardFollowUpLoadingSingle')}</p>
          ) : error ? (
            <p className="text-sm text-(--mc-accent-danger)" role="alert" aria-live="polite">
              {error}
            </p>
          ) : isNewCard ? (
            <section className="rounded-lg border border-(--mc-border-subtle) bg-(--mc-bg-page) p-3">
              <p className="text-sm text-(--mc-text-primary)">{ta('cardFollowUpNewCardBody')}</p>
            </section>
          ) : (
            <>
              <section className="rounded-lg border border-(--mc-border-subtle) bg-(--mc-bg-page) p-3">
                <h4 className="mb-2 text-sm font-medium text-(--mc-text-primary)">
                  {ta('cardFollowUpScheduleHeading')}
                </h4>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                  <dt className="text-(--mc-text-secondary)">{ta('cardFollowUpNextReviewLabel')}</dt>
                  <dd className="text-(--mc-text-primary)">{nextReviewPrimary}</dd>
                  <dt className="sr-only">{ta('cardFollowUpNextContextSr')}</dt>
                  <dd className="col-span-2 text-xs text-(--mc-text-secondary)">{nextContextLine}</dd>
                  {lastReviewBlock}
                </dl>
              </section>

              <section className="rounded-lg border border-(--mc-border-subtle) bg-(--mc-bg-page) p-3">
                <h4 className="mb-2 text-sm font-medium text-(--mc-text-primary)">
                  {ta('cardFollowUpEstimationHeading')}
                </h4>
                <p className="text-sm text-(--mc-text-secondary)">{ta(estimationPhraseKey)}</p>
              </section>

              {reviewLogs.length > 0 && (
                <CardReviewHistoryChart
                  logs={reviewLogs}
                  locale={locale}
                  labels={chartLabels}
                  ratingLabel={ratingLabel}
                  formatLogGap={formatLogGap}
                />
              )}
            </>
          )}
        </div>

        {!loading && !error && (
          <div className="flex shrink-0 flex-wrap gap-2 border-t border-(--mc-border-subtle) px-4 py-3">
            <button
              type="button"
              onClick={onEditCard}
              className="rounded-lg border border-(--mc-accent-primary) bg-(--mc-accent-primary) px-3 pt-1 pb-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
            >
              {ta('cardFollowUpEditCard')}
            </button>
            <button
              type="button"
              onClick={onTreatAsNew}
              disabled={treatAsNewDisabled || actionLoading}
              title={treatAsNewDisabled ? ta('cardStatusNew') : undefined}
              className="rounded-lg border border-(--mc-border-subtle) px-3 pt-1 pb-1.5 text-sm font-medium text-(--mc-text-secondary) transition-colors hover:bg-(--mc-bg-card-back) hover:text-(--mc-text-primary) disabled:cursor-not-allowed disabled:opacity-50"
            >
              {ta('treatAsNew')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
