'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import apiClient, { getApiErrorMessage, isRequestCancelled } from '@/lib/api';
import { useEscapeToClose } from '@/hooks/useEscapeToClose';
import { useModalFocusTrap } from '@/hooks/useModalFocusTrap';
import { DailyReviewCountBarChart, type DailyReviewCountRow } from '@/components/DailyReviewCountBarChart';
import type { TranslationOptions } from '@/hooks/useTranslation';
import { ModalCloseButton } from './ModalCloseButton';
import type { CardReviewLogPoint } from './CardReviewHistoryChart';
import { DeckMultiCardOverlayChart } from './DeckMultiCardOverlayChart';
import { CARD_REVIEW_LOGS_FETCH_LIMIT, DECK_STATS_PER_CARD_CHART_MAX_CARDS } from './cardStatsConstants';

export type DeckStudyStatsSnapshot = {
  dueCount: number;
  newCount: number;
  flaggedCount: number;
  criticalCount: number;
  highRiskCount: number;
};

type DeckStatsApi = {
  totalCards: number;
  dueCards: number;
  newCards: number;
  reviewedToday: number;
};

type TFn = (key: string, options?: TranslationOptions) => string;

type Props = {
  open: boolean;
  onClose: () => void;
  deckId: string;
  deckTitle: string;
  locale: string;
  cardsTotal: number;
  cardsLoading: boolean;
  studyStats: DeckStudyStatsSnapshot | null;
  ta: TFn;
  tc: TFn;
};

function StatRow({ label, value, labelTitle }: { label: string; value: string; labelTitle?: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-(--mc-border-subtle) py-2 last:border-b-0">
      <dt className="text-sm text-(--mc-text-secondary)" title={labelTitle}>
        {label}
      </dt>
      <dd className="text-sm font-medium tabular-nums text-(--mc-text-primary)">{value}</dd>
    </div>
  );
}

type ApiReviewLog = {
  id: string;
  rating: number;
  review_time: number;
  review_date: string;
  scheduled_days: number;
  elapsed_days: number;
  stability_before: number | null;
  difficulty_before: number | null;
  retrievability_before: number | null;
  stability_after: number | null;
  difficulty_after: number | null;
};

function toLogPoint(row: ApiReviewLog): CardReviewLogPoint {
  const rd = row.review_date;
  const review_date = typeof rd === 'string' ? rd.split('T')[0] ?? rd : new Date(rd).toISOString().slice(0, 10);
  return {
    id: row.id,
    rating: row.rating,
    review_time: row.review_time,
    review_date,
    scheduled_days: row.scheduled_days,
    elapsed_days: row.elapsed_days,
    stability_before: row.stability_before,
    difficulty_before: row.difficulty_before,
    retrievability_before: row.retrievability_before,
    stability_after: row.stability_after,
    difficulty_after: row.difficulty_after,
  };
}

export function DeckStatsModal({
  open,
  onClose,
  deckId,
  deckTitle,
  locale,
  cardsTotal,
  cardsLoading,
  studyStats,
  ta,
  tc,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  useModalFocusTrap(open, panelRef);
  useEscapeToClose(open, onClose);

  const [deckStats, setDeckStats] = useState<DeckStatsApi | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState('');
  const [mergedDayRows, setMergedDayRows] = useState<DailyReviewCountRow[] | null>(null);
  const [mergedChartLoading, setMergedChartLoading] = useState(false);
  const [mergedChartError, setMergedChartError] = useState('');

  const [perCardCharts, setPerCardCharts] = useState<
    | null
    | {
        limitPerCard: number;
        maxCards: number;
        cards: Array<{ cardId: string; recto: string | null; logs: CardReviewLogPoint[] }>;
      }
  >(null);
  const [perCardLoading, setPerCardLoading] = useState(false);
  const [perCardError, setPerCardError] = useState('');

  const overlayChartLabels = useMemo(
    () => ({
      chartTitle: ta('deckStatsOverlayChartTitle'),
      axisStability: ta('cardFollowUpAxisStability'),
      axisDifficulty: ta('cardFollowUpAxisDifficulty'),
      axisTimeCaption: ta('cardFollowUpAxisTimeCaption'),
      metricStability: ta('deckStatsOverlayMetricStability'),
      metricDifficulty: ta('deckStatsOverlayMetricDifficulty'),
      hoverHint: ta('deckStatsOverlayChartHint'),
      emptyMetric: ta('deckStatsOverlayChartEmptyMetric'),
      ratingMarkersSolid: ta('deckStatsOverlayRatingMarkersSolid'),
      ratingMarkersFaded: ta('deckStatsOverlayRatingMarkersFaded'),
      ratingMarkersHidden: ta('deckStatsOverlayRatingMarkersHidden'),
      ratingMarkersModeGroup: ta('deckStatsOverlayRatingMarkersModeGroup'),
      stabilityLongTermGoalCaption: ta('chartStabilityLongTermGoalCaption'),
    }),
    [ta]
  );

  const overlayRatingLabel = useCallback(
    (r: number) => {
      switch (r) {
        case 1:
          return ta('again');
        case 2:
          return ta('hard');
        case 3:
          return ta('good');
        case 4:
          return ta('easy');
        default:
          return String(r);
      }
    },
    [ta]
  );

  useEffect(() => {
    if (!open || !deckId) return;
    setDeckStats(null);
    setStatsError('');
    setMergedDayRows(null);
    setMergedChartError('');
    setPerCardCharts(null);
    setPerCardError('');
    setStatsLoading(true);
    const ac = new AbortController();
    apiClient
      .get<{ success: boolean; data?: DeckStatsApi }>(`/api/decks/${deckId}/stats`, { signal: ac.signal })
      .then((res) => {
        if (res.data?.success && res.data.data) setDeckStats(res.data.data);
      })
      .catch((err) => {
        if (!isRequestCancelled(err)) setStatsError(getApiErrorMessage(err, ta('deckStatsLoadError')));
      })
      .finally(() => setStatsLoading(false));
    return () => ac.abort();
  }, [open, deckId, ta]);

  useEffect(() => {
    if (!open || !deckId) return;
    setMergedDayRows(null);
    setMergedChartError('');
    setMergedChartLoading(true);
    const ac = new AbortController();
    apiClient
      .get<{ success: boolean; data?: { days: number; byDay: Array<{ day: string; count: number }> } }>(
        `/api/decks/${deckId}/review-day-counts?days=90`,
        { signal: ac.signal }
      )
      .then((res) => {
        const payload = res.data?.success ? res.data.data : undefined;
        if (payload?.byDay) {
          setMergedDayRows(
            payload.byDay.map((d) => ({ metricDate: d.day, reviewCount: d.count }))
          );
        } else {
          setMergedDayRows([]);
        }
      })
      .catch((err) => {
        if (!isRequestCancelled(err)) setMergedChartError(getApiErrorMessage(err, ta('deckStatsLoadError')));
      })
      .finally(() => setMergedChartLoading(false));
    return () => ac.abort();
  }, [open, deckId, ta]);

  useEffect(() => {
    if (!open || !deckId) return;
    setPerCardCharts(null);
    setPerCardError('');
    setPerCardLoading(true);
    const ac = new AbortController();
    const q = new URLSearchParams({
      limitPerCard: String(CARD_REVIEW_LOGS_FETCH_LIMIT),
      maxCards: String(DECK_STATS_PER_CARD_CHART_MAX_CARDS),
    });
    apiClient
      .get<{
        success: boolean;
        data?: {
          limitPerCard: number;
          maxCards: number;
          cards: Array<{ cardId: string; recto: string | null; logs: ApiReviewLog[] }>;
        };
      }>(`/api/decks/${deckId}/review-logs-by-card?${q}`, { signal: ac.signal })
      .then((res) => {
        const payload = res.data?.success ? res.data.data : undefined;
        if (payload?.cards) {
          setPerCardCharts({
            limitPerCard: payload.limitPerCard,
            maxCards: payload.maxCards,
            cards: payload.cards.map((c) => ({
              cardId: c.cardId,
              recto: c.recto,
              logs: c.logs.map(toLogPoint),
            })),
          });
        } else {
          setPerCardCharts({ limitPerCard: CARD_REVIEW_LOGS_FETCH_LIMIT, maxCards: DECK_STATS_PER_CARD_CHART_MAX_CARDS, cards: [] });
        }
      })
      .catch((err) => {
        if (!isRequestCancelled(err)) setPerCardError(getApiErrorMessage(err, ta('deckStatsLoadError')));
      })
      .finally(() => setPerCardLoading(false));
    return () => ac.abort();
  }, [open, deckId, ta]);

  if (!open) return null;

  const totalDisplay =
    deckStats != null
      ? String(deckStats.totalCards)
      : cardsLoading
        ? tc('loading')
        : String(cardsTotal);

  const reviewedDisplay =
    statsLoading && deckStats == null ? tc('loading') : deckStats != null ? String(deckStats.reviewedToday) : '—';

  return (
    <div
      data-testid="deck-stats-modal-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center bg-(--mc-overlay) p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="deck-stats-modal-title"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        className="flex max-h-[min(90dvh,calc(100vh-2rem))] w-full max-w-4xl flex-col rounded-xl border border-(--mc-border-subtle) bg-(--mc-bg-surface) shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-(--mc-border-subtle) px-4 pt-4 pb-3">
          <div className="min-w-0 flex-1">
            <h2 id="deck-stats-modal-title" className="text-lg font-semibold text-(--mc-text-primary)">
              {ta('deckStatsModalTitle')}
            </h2>
            <p className="mt-0.5 truncate text-sm text-(--mc-text-secondary)" title={deckTitle}>
              {deckTitle}
            </p>
          </div>
          <ModalCloseButton onClick={onClose} ariaLabel={tc('close')} />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {statsError ? (
            <p className="text-sm text-(--mc-accent-danger)" role="alert">
              {statsError}
            </p>
          ) : null}

          <h3 className="text-xs font-medium uppercase tracking-wide text-(--mc-text-muted)">{ta('deckStatsSectionOverview')}</h3>
          <dl className="mt-1">
            <StatRow label={ta('deckStatsLabelTotalCards')} value={totalDisplay} />
            <StatRow label={ta('deckStatsLabelReviewedToday')} value={reviewedDisplay} />
          </dl>

          <h3 className="mt-4 text-xs font-medium uppercase tracking-wide text-(--mc-text-muted)">
            {ta('deckStatsSectionStudy')}
          </h3>
          <dl className="mt-1">
            {studyStats == null ? (
              <p className="py-2 text-sm text-(--mc-text-muted)">{tc('loading')}</p>
            ) : (
              <>
                <StatRow label={ta('deckStatsLabelDue')} value={String(studyStats.dueCount)} />
                <StatRow label={ta('deckStatsLabelNew')} value={String(studyStats.newCount)} />
                {studyStats.criticalCount > 0 ? (
                  <StatRow label={ta('deckStatsLabelCritical')} value={String(studyStats.criticalCount)} />
                ) : null}
                {studyStats.highRiskCount > 0 && studyStats.highRiskCount !== studyStats.criticalCount ? (
                  <StatRow
                    label={ta('deckStatsLabelOverdue')}
                    value={String(studyStats.highRiskCount)}
                    labelTitle={ta('deckStudyOverdueTooltip')}
                  />
                ) : null}
                {studyStats.flaggedCount > 0 ? (
                  <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-(--mc-border-subtle) py-2 last:border-b-0">
                    <dt className="text-sm text-(--mc-text-secondary)">{ta('deckStatsLabelFlagged')}</dt>
                    <dd className="text-sm font-medium text-(--mc-text-primary)">
                      <span className="tabular-nums">{String(studyStats.flaggedCount)}</span>
                      {' · '}
                      <Link
                        href={`/${locale}/app/flagged-cards${deckId ? `?deckId=${encodeURIComponent(deckId)}` : ''}`}
                        className="font-medium text-(--mc-accent-primary) underline hover:no-underline"
                        onClick={onClose}
                      >
                        {ta('deckStudyManageFlagged')}
                      </Link>
                    </dd>
                  </div>
                ) : null}
              </>
            )}
          </dl>

          {mergedChartError ? (
            <p className="mt-4 text-sm text-(--mc-accent-danger)" role="alert">
              {mergedChartError}
            </p>
          ) : mergedChartLoading ? (
            <p className="mt-4 text-sm text-(--mc-text-muted)">{tc('loading')}</p>
          ) : mergedDayRows && mergedDayRows.length > 0 ? (
            <DailyReviewCountBarChart
              bordered={false}
              rows={mergedDayRows}
              locale={locale}
              windowDays={90}
              title={ta('deckStatsMergedChartTitle')}
              footnote={ta('deckStatsMergedChartFootnote', { vars: { count: '90' } })}
              legendLess={ta('reviewCalendarLess')}
              legendMore={ta('reviewCalendarMore')}
            />
          ) : null}

          <h3 className="mt-6 text-xs font-medium uppercase tracking-wide text-(--mc-text-muted)">
            {ta('deckStatsPerCardChartsTitle')}
          </h3>
          {perCardError ? (
            <p className="mt-2 text-sm text-(--mc-accent-danger)" role="alert">
              {perCardError}
            </p>
          ) : perCardLoading ? (
            <p className="mt-2 text-sm text-(--mc-text-muted)">{tc('loading')}</p>
          ) : perCardCharts && perCardCharts.cards.length > 0 ? (
            <div className="mt-2 space-y-3">
              <DeckMultiCardOverlayChart
                cards={perCardCharts.cards}
                locale={locale}
                labels={overlayChartLabels}
                ratingLabel={overlayRatingLabel}
              />
              <p className="text-xs text-(--mc-text-secondary)">
                {ta('deckStatsPerCardChartsFootnote', {
                  vars: {
                    maxCards: String(perCardCharts.maxCards),
                    limitPerCard: String(perCardCharts.limitPerCard),
                  },
                })}
              </p>
            </div>
          ) : perCardCharts && perCardCharts.cards.length === 0 ? (
            <p className="mt-2 text-sm text-(--mc-text-muted)">{ta('deckStatsPerCardChartsEmpty')}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
