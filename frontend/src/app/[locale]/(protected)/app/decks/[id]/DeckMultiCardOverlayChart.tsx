'use client';

import * as d3 from 'd3';
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { eventTimeToMs, formatEventTime, previewCardRecto } from './deckDetailHelpers';
import {
  RATING_AGAIN_CROSS_ARM,
  RATING_AGAIN_CROSS_ARM_INNER,
  RATING_MARKER_FADE_OPACITY,
  RATING_MARKER_R_INNER,
  RATING_MARKER_R_LAST,
  STABILITY_LONG_TERM_GOAL_DAYS,
  ratingFillCss,
  type CardReviewLogPoint,
  type RatingMarkerMode,
} from './CardReviewHistoryChart';
import { chartToolbarSelectClassName } from '@/components/ui/chartToolbarSelect';

const M = { top: 14, right: 36, bottom: 54, left: 46 };

/** Outer radius of the help icon in chart space (matches Lucide circle r=10 scaled). */
const HELP_ICON_R = 9;

/**
 * Lucide `CircleQuestionMark` (a.k.a. circle-help) vector, viewBox 0 0 24 24.
 * Source: lucide-react `circle-question-mark` (ISC). Strokes use `currentColor`.
 */
function appendLucideCircleQuestionHelp(
  parent: d3.Selection<SVGGElement, unknown, null, undefined>,
  strokeCss: string
) {
  const k = HELP_ICON_R / 12;
  const inner = parent
    .append('g')
    .attr('transform', `scale(${k}) translate(-12,-12)`)
    .style('color', strokeCss);
  inner
    .append('circle')
    .attr('cx', 12)
    .attr('cy', 12)
    .attr('r', 10)
    .attr('fill', 'color-mix(in oklab, var(--mc-bg-surface) 88%, transparent)')
    .attr('stroke', 'currentColor')
    .attr('stroke-width', 2)
    .attr('stroke-linecap', 'round')
    .attr('stroke-linejoin', 'round');
  inner
    .append('path')
    .attr('d', 'M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3')
    .attr('fill', 'none')
    .attr('stroke', 'currentColor')
    .attr('stroke-width', 2)
    .attr('stroke-linecap', 'round')
    .attr('stroke-linejoin', 'round');
  inner
    .append('path')
    .attr('d', 'M12 17h.01')
    .attr('fill', 'none')
    .attr('stroke', 'currentColor')
    .attr('stroke-width', 2)
    .attr('stroke-linecap', 'round')
    .attr('stroke-linejoin', 'round');
}

type EndCapRow = {
  y: number;
  strokeColor: string;
  tooltip: string;
};

/** Avoid overlapping end-cap help icons (SVG y grows downward). */
function packEndLabels(items: EndCapRow[], lineH: number, minGap = HELP_ICON_R * 2 + 4): EndCapRow[] {
  const sorted = [...items].sort((a, b) => a.y - b.y);
  let prevY = -Infinity;
  const out: EndCapRow[] = [];
  for (const it of sorted) {
    let yPos = it.y;
    if (prevY !== -Infinity && yPos - prevY < minGap) {
      yPos = prevY + minGap;
    }
    yPos = Math.min(Math.max(yPos, 9), lineH - 5);
    out.push({ ...it, y: yPos });
    prevY = yPos;
  }
  return out;
}
const CHART_MIN_WIDTH = 320;
const CHART_HEIGHT = 300;
const R_BAND = 36;
/** Same as single-card chart: min horizontal gap between reviews in index (even-spacing) mode. */
const MIN_LOG_GAP_PX = 35;

/** Cap per-card polylines/markers when scope is “capped” (deck stats use the same subset). */
const MAX_OVERLAY_VISIBLE_CARDS = 100;

type Metric = 'stability' | 'difficulty';

/** What to draw: every card, deck aggregates only, or both. */
export type OverlayDisplayMode = 'all' | 'cardsOnly' | 'deckOnly';

/** Whether per-card series (and matching deck stats) use every card with data or the first N. */
export type OverlayCardScope = 'all' | 'capped100';

/** Local midnight (ms) for the calendar day containing `ms`. */
function startOfLocalDayMs(ms: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** End of that local calendar day (inclusive upper bound for “through this day”). */
function endOfLocalDayMsFromDayStart(dayStartMs: number): number {
  const d = new Date(dayStartMs);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999).getTime();
}

function lastMetricYAtOrBefore(
  pts: Array<{ tMs: number; y: number }>,
  cutoffMs: number
): number | null {
  if (pts.length === 0 || pts[0]!.tMs > cutoffMs) return null;
  let lo = 0;
  let hi = pts.length - 1;
  let ans = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (pts[mid]!.tMs <= cutoffMs) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return pts[ans]!.y;
}

export type DeckMultiCardOverlayChartLabels = {
  chartTitle: string;
  axisStability: string;
  axisDifficulty: string;
  axisTimeCaption: string;
  /** X-axis caption in even-spacing (review index) mode. */
  axisReviewOrder: string;
  chartXAxisSwitchToTime: string;
  chartXAxisSwitchToIndex: string;
  chartXAxisModeGroup: string;
  metricStability: string;
  metricDifficulty: string;
  /** Accessible name for the metric `<select>`. */
  metricGroup: string;
  hoverHint: string;
  emptyMetric: string;
  ratingMarkersSolid: string;
  ratingMarkersFaded: string;
  ratingMarkersHidden: string;
  ratingMarkersModeGroup: string;
  /** On-chart label for the S≥15d long-term zone (stability metric only). */
  stabilityLongTermGoalCaption: string;
  /** Accessible name (SVG title) for deck mean-by-day curve. */
  aggregateMeanCaption: string;
  /** Accessible name (SVG title) for deck median-by-day curve. */
  aggregateMedianCaption: string;
  /** Short label at plot right for mean (with numeric value). */
  lineEndMeanCaption: string;
  /** Short label at plot right for median (with numeric value). */
  lineEndMedianCaption: string;
  /** Tooltip for the ≥15d LTM reference (stability only). */
  lineTooltipLtm: string;
  /** Tooltip for the deck mean curve. */
  lineTooltipMean: string;
  /** Tooltip for the deck median curve. */
  lineTooltipMedian: string;
  /** Shared aria-label prefix for ? help icons (screen readers). */
  helpIconAria: string;
  /** Segmented control: show card lines + deck summary. */
  displayModeAll: string;
  /** Per-card series only (no deck mean/median curves). */
  displayModeCardsOnly: string;
  /** Deck mean/median (+ LTM when stability); no per-card lines. */
  displayModeDeckOnly: string;
  /** Accessible name for the display mode `<select>`. */
  displayModeGroup: string;
  /** `<option>`: include every card with data for this metric. */
  cardScopeAll: string;
  /** `<option>`: cap at 100 card series (same order as full list). */
  cardScopeCap: string;
  /** Accessible name for the card scope `<select>`. */
  cardScopeGroup: string;
  /** Stability Y-axis: linear scale (default). */
  stabilityYScaleLinear: string;
  /** Stability Y-axis: logarithmic scale (spreads low values when a few cards have very high S). */
  stabilityYScaleLog: string;
  /** Accessible name for stability Y-scale `<select>`. */
  stabilityYScaleGroup: string;
};

type CardSeries = {
  cardId: string;
  recto: string | null;
  color: string;
  points: Array<{ tMs: number; y: number; log: CardReviewLogPoint }>;
};

type Props = {
  cards: Array<{ cardId: string; recto: string | null; logs: CardReviewLogPoint[] }>;
  locale: string;
  labels: DeckMultiCardOverlayChartLabels;
  /** Optional: show rating name in hover tooltip (same keys as study: again/hard/good/easy). */
  ratingLabel?: (rating: number) => string;
};

function cardColor(i: number, n: number): string {
  if (n <= 0) return 'var(--mc-accent-success)';
  const h = (i * 360) / Math.max(n, 1);
  return `hsl(${h} 58% 42%)`;
}

export function DeckMultiCardOverlayChart({ cards, locale, labels, ratingLabel }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [viewportWidth, setViewportWidth] = useState(CHART_MIN_WIDTH);
  const [metric, setMetric] = useState<Metric>('stability');
  const [ratingMarkerMode, setRatingMarkerMode] = useState<RatingMarkerMode>('visible');
  const [displayMode, setDisplayMode] = useState<OverlayDisplayMode>('all');
  const [cardScope, setCardScope] = useState<OverlayCardScope>('all');
  /** `true` = real dates on X; `false` = one step per review index (aligned across cards). */
  const [xAxisByTime, setXAxisByTime] = useState(true);
  /** Log Y only applies when `metric === 'stability'`. */
  const [stabilityYLog, setStabilityYLog] = useState(false);
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null);

  const showCardSeries = displayMode === 'all' || displayMode === 'cardsOnly';
  const showDeckSummary = displayMode === 'all' || displayMode === 'deckOnly';
  const titleId = useId();

  const seriesListFull = useMemo((): CardSeries[] => {
    const withIdx = cards.map((c, i) => {
      const pts: Array<{ tMs: number; y: number; log: CardReviewLogPoint }> = [];
      for (const log of c.logs) {
        const tMs = eventTimeToMs(log.review_time);
        if (tMs == null) continue;
        const yVal =
          metric === 'stability' ? log.stability_after : log.difficulty_after;
        if (yVal == null || !Number.isFinite(yVal)) continue;
        pts.push({ tMs, y: yVal, log });
      }
      pts.sort((a, b) => a.tMs - b.tMs);
      return {
        cardId: c.cardId,
        recto: c.recto,
        color: cardColor(i, cards.length),
        points: pts,
      };
    });
    return withIdx.filter((s) => s.points.length > 0);
  }, [cards, metric]);

  const seriesList = useMemo(() => {
    if (cardScope === 'all') return seriesListFull;
    return seriesListFull.slice(0, MAX_OVERLAY_VISIBLE_CARDS);
  }, [seriesListFull, cardScope]);

  /** One sample per local calendar day that has ≥1 review anywhere in the deck. */
  const deckEvolution = useMemo(() => {
    if (seriesList.length === 0) return [] as Array<{ tMs: number; mean: number; median: number }>;

    const dayStarts = new Set<number>();
    for (const s of seriesList) {
      for (const p of s.points) {
        dayStarts.add(startOfLocalDayMs(p.tMs));
      }
    }
    const sortedDays = [...dayStarts].sort((a, b) => a - b);
    const out: Array<{ tMs: number; mean: number; median: number }> = [];

    for (const dayStart of sortedDays) {
      const cutoff = endOfLocalDayMsFromDayStart(dayStart);
      const slice: number[] = [];
      for (const s of seriesList) {
        const yVal = lastMetricYAtOrBefore(s.points, cutoff);
        if (yVal != null && Number.isFinite(yVal)) slice.push(yVal);
      }
      if (slice.length === 0) continue;
      const mean = d3.mean(slice);
      const median = d3.median(slice);
      if (mean == null || !Number.isFinite(mean) || median == null || !Number.isFinite(median))
        continue;
      out.push({ tMs: cutoff, mean, median });
    }
    return out;
  }, [seriesList]);

  /** Mean/median at each review index k across cards that have a k-th review (even-spacing mode). */
  const deckEvolutionIndex = useMemo(() => {
    if (seriesList.length === 0) return [] as Array<{ idx: number; mean: number; median: number }>;
    const maxLen = d3.max(seriesList, (s) => s.points.length) ?? 0;
    const out: Array<{ idx: number; mean: number; median: number }> = [];
    for (let k = 0; k < maxLen; k++) {
      const slice: number[] = [];
      for (const s of seriesList) {
        if (k < s.points.length) slice.push(s.points[k]!.y);
      }
      if (slice.length === 0) continue;
      const mean = d3.mean(slice);
      const median = d3.median(slice);
      if (mean == null || !Number.isFinite(mean) || median == null || !Number.isFinite(median)) continue;
      out.push({ idx: k, mean, median });
    }
    return out;
  }, [seriesList]);

  const maxSeriesLen = useMemo(
    () => (seriesList.length ? d3.max(seriesList, (s) => s.points.length) ?? 0 : 0),
    [seriesList]
  );

  const allT = useMemo(() => seriesList.flatMap((s) => s.points.map((p) => p.tMs)), [seriesList]);
  const tMin = allT.length ? d3.min(allT)! : Date.now();
  const tMax = allT.length ? d3.max(allT)! : Date.now();
  const spanT = Math.max(tMax - tMin, 60_000);
  const padT = Math.max(spanT * 0.04, 3_600_000);

  const lineH = CHART_HEIGHT - M.top - M.bottom - R_BAND;

  const plotInnerW = useMemo(() => {
    const vw = Math.max(viewportWidth, CHART_MIN_WIDTH);
    const base = Math.max(0, vw - M.left - M.right);
    if (xAxisByTime) return base;
    if (maxSeriesLen <= 1) return base;
    return Math.max(base, (maxSeriesLen - 1) * MIN_LOG_GAP_PX);
  }, [viewportWidth, xAxisByTime, maxSeriesLen]);

  const yExtent = useMemo(() => {
    const vals = seriesList.flatMap((s) => s.points.map((p) => p.y));
    const evoVals = [
      ...deckEvolution.flatMap((e) => [e.mean, e.median]),
      ...deckEvolutionIndex.flatMap((e) => [e.mean, e.median]),
    ];
    const forExtent = vals.length ? [...vals, ...evoVals] : [];
    if (vals.length === 0) return { min: 0, max: 1 };
    if (metric === 'stability') {
      const maxS = Math.max(0.5, d3.max(forExtent) ?? 1);
      return {
        min: 0,
        max: Math.max(maxS * 1.12, STABILITY_LONG_TERM_GOAL_DAYS * 1.12),
      };
    }
    const dMin = Math.min(0, d3.min(forExtent) ?? 0);
    const dMax = Math.max(10, d3.max(forExtent) ?? 10);
    const dSpan = dMax - dMin;
    return { min: dMin, max: dMax + Math.max(dSpan * 0.08, 0.01) };
  }, [seriesList, metric, deckEvolution, deckEvolutionIndex]);

  /** Strictly positive domain for `d3.scaleLog` when stability + log Y is on. */
  const stabilityLogYDomain = useMemo(() => {
    if (metric !== 'stability') return null;
    const vals = seriesList.flatMap((s) => s.points.map((p) => p.y));
    const evoVals = [
      ...deckEvolution.flatMap((e) => [e.mean, e.median]),
      ...deckEvolutionIndex.flatMap((e) => [e.mean, e.median]),
    ];
    const forExtent = vals.length ? [...vals, ...evoVals] : [];
    const positive = forExtent.filter((v) => Number.isFinite(v) && v > 0);
    const ltm = STABILITY_LONG_TERM_GOAL_DAYS;
    if (positive.length === 0) {
      return { min: 0.01, max: Math.max(ltm * 1.12, 1) };
    }
    const rawMin = d3.min(positive)!;
    const rawMax = d3.max(positive)!;
    let hi = Math.max(rawMax * 1.08, ltm * 1.12);
    let lo = Math.max(1e-6, rawMin * 0.88);
    if (!(hi > lo)) hi = lo * 1.05;
    return { min: lo, max: hi };
  }, [metric, seriesList, deckEvolution, deckEvolutionIndex]);

  const chartTotalWidth = M.left + plotInnerW + M.right;

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      setViewportWidth(Math.max(CHART_MIN_WIDTH, Math.round(el.clientWidth)));
    });
    ro.observe(el);
    setViewportWidth(Math.max(CHART_MIN_WIDTH, Math.round(el.clientWidth)));
    return () => ro.disconnect();
  }, []);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (xAxisByTime) {
      el.scrollLeft = 0;
      return;
    }
    const run = () => {
      const s = scrollRef.current;
      if (!s) return;
      s.scrollLeft = Math.max(0, s.scrollWidth - s.clientWidth);
    };
    run();
    requestAnimationFrame(run);
  }, [
    xAxisByTime,
    chartTotalWidth,
    plotInnerW,
    maxSeriesLen,
    seriesList.length,
    metric,
    displayMode,
    cardScope,
    stabilityYLog,
  ]);

  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl || seriesList.length === 0 || plotInnerW <= 0) return;

    const useTimeX = xAxisByTime;
    const nIdx = maxSeriesLen;
    const xIndex = d3
      .scaleLinear()
      .domain(nIdx <= 1 ? [-0.5, 0.5] : [-0.5, nIdx - 0.5])
      .range([0, plotInnerW]);

    const xTime = d3
      .scaleTime()
      .domain([new Date(tMin - padT), new Date(tMax + padT)])
      .range([0, plotInnerW]);

    const logDom = stabilityLogYDomain;
    const useLogY = metric === 'stability' && stabilityYLog && logDom != null;
    const y = useLogY && logDom
      ? d3.scaleLog().domain([logDom.min, logDom.max]).range([lineH, 0]).clamp(true)
      : d3.scaleLinear().domain([yExtent.min, yExtent.max]).range([lineH, 0]);

    const tickFormatTime = (d: Date | number) => {
      const date = d instanceof Date ? d : new Date(+d);
      if (spanT > 365 * 86_400_000) {
        return date.toLocaleDateString(locale, { year: 'numeric', month: 'short' });
      }
      if (spanT > 2 * 86_400_000) {
        return date.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
      }
      return date.toLocaleString(locale, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    };

    const svg = d3.select(svgEl);
    svg.selectAll('*').remove();
    svg.attr('width', chartTotalWidth).attr('height', CHART_HEIGHT).attr('aria-hidden', 'true');

    const g = svg.append('g').attr('transform', `translate(${M.left},${M.top})`);

    const yGridTicks = y.ticks(useLogY ? 4 : 5).filter((t) => typeof t === 'number' && Number.isFinite(t));
    const [yDomLo, yDomHi] = y.domain();
    const gridG = g.append('g').attr('class', 'deck-overlay-y-grid').style('pointer-events', 'none');
    for (const tick of yGridTicks) {
      if (tick < yDomLo || tick > yDomHi) continue;
      const yy = y(tick);
      if (!Number.isFinite(yy)) continue;
      gridG
        .append('line')
        .attr('class', 'deck-overlay-y-grid-line')
        .attr('data-tick', String(tick))
        .attr('x1', 0)
        .attr('x2', plotInnerW)
        .attr('y1', yy)
        .attr('y2', yy)
        .attr('stroke', 'var(--mc-border-subtle)')
        .attr('stroke-width', 1)
        .attr('opacity', 0.4);
    }

    if (metric === 'stability') {
      const yG = y(STABILITY_LONG_TERM_GOAL_DAYS);
      const goalG = g
        .append('g')
        .attr('class', 'deck-overlay-stability-ltm')
        .style('pointer-events', 'none');
      goalG
        .append('line')
        .attr('x1', 0)
        .attr('x2', plotInnerW)
        .attr('y1', yG)
        .attr('y2', yG)
        .attr('stroke', 'var(--mc-accent-success)')
        .attr('stroke-width', 1.25)
        .attr('stroke-dasharray', '5 4')
        .attr('opacity', 0.92);
    }

    const xForSeriesPt = (tMs: number, i: number) => (useTimeX ? xTime(new Date(tMs)) : xIndex(i));

    const lineGen = d3
      .line<{ tMs: number; y: number }>()
      .defined((d) => !useLogY || (d.y > 0 && Number.isFinite(d.y)))
      .x((d, i) => xForSeriesPt(d.tMs, i))
      .y((d) => y(d.y))
      .curve(d3.curveMonotoneX);

    if (showCardSeries) {
      for (const s of seriesList) {
        if (s.points.length >= 2) {
          g.append('path')
            .datum(s.points)
            .attr('fill', 'none')
            .attr('stroke', s.color)
            .attr('stroke-width', seriesList.length > 40 ? 1 : seriesList.length > 15 ? 1.25 : 1.75)
            .attr('stroke-opacity', 0.88)
            .attr('d', lineGen);
        }
      }
    }

    const meanPathGenTime = d3
      .line<{ tMs: number; mean: number; median: number }>()
      .defined((d) => !useLogY || (d.mean > 0 && Number.isFinite(d.mean)))
      .x((d) => xTime(new Date(d.tMs)))
      .y((d) => y(d.mean))
      .curve(d3.curveMonotoneX);
    const medianPathGenTime = d3
      .line<{ tMs: number; mean: number; median: number }>()
      .defined((d) => !useLogY || (d.median > 0 && Number.isFinite(d.median)))
      .x((d) => xTime(new Date(d.tMs)))
      .y((d) => y(d.median))
      .curve(d3.curveMonotoneX);
    const meanPathGenIdx = d3
      .line<{ idx: number; mean: number; median: number }>()
      .defined((d) => !useLogY || (d.mean > 0 && Number.isFinite(d.mean)))
      .x((d) => xIndex(d.idx))
      .y((d) => y(d.mean))
      .curve(d3.curveMonotoneX);
    const medianPathGenIdx = d3
      .line<{ idx: number; mean: number; median: number }>()
      .defined((d) => !useLogY || (d.median > 0 && Number.isFinite(d.median)))
      .x((d) => xIndex(d.idx))
      .y((d) => y(d.median))
      .curve(d3.curveMonotoneX);

    if (showDeckSummary) {
      if (useTimeX) {
        if (deckEvolution.length >= 2) {
          const aggG = g.append('g').attr('class', 'deck-overlay-deck-evolution').style('pointer-events', 'none');
          const meanPath = aggG
            .append('path')
            .datum(deckEvolution)
            .attr('fill', 'none')
            .attr('stroke', 'var(--mc-text-muted)')
            .attr('stroke-width', 2)
            .attr('stroke-dasharray', '6 5')
            .attr('opacity', 0.95)
            .attr('d', meanPathGenTime);
          meanPath.append('title').text(labels.aggregateMeanCaption);
          const medPath = aggG
            .append('path')
            .datum(deckEvolution)
            .attr('fill', 'none')
            .attr('stroke', 'var(--mc-accent-primary)')
            .attr('stroke-width', 2)
            .attr('stroke-dasharray', '3 4')
            .attr('opacity', 0.95)
            .attr('d', medianPathGenTime);
          medPath.append('title').text(labels.aggregateMedianCaption);
        } else if (deckEvolution.length === 1) {
          const aggG = g.append('g').attr('class', 'deck-overlay-deck-evolution').style('pointer-events', 'none');
          const d0 = deckEvolution[0]!;
          const xm = xTime(new Date(d0.tMs));
          const ym = useLogY && !(d0.mean > 0 && Number.isFinite(d0.mean)) ? null : y(d0.mean);
          const ymed = useLogY && !(d0.median > 0 && Number.isFinite(d0.median)) ? null : y(d0.median);
          if (ym != null) {
            aggG
              .append('circle')
              .attr('cx', xm)
              .attr('cy', ym)
              .attr('r', 4)
              .attr('fill', 'none')
              .attr('stroke', 'var(--mc-text-muted)')
              .attr('stroke-width', 2)
              .append('title')
              .text(labels.aggregateMeanCaption);
          }
          if (ymed != null) {
            aggG
              .append('circle')
              .attr('cx', xm)
              .attr('cy', ymed)
              .attr('r', 4)
              .attr('fill', 'none')
              .attr('stroke', 'var(--mc-accent-primary)')
              .attr('stroke-width', 2)
              .append('title')
              .text(labels.aggregateMedianCaption);
          }
        }
      } else if (deckEvolutionIndex.length >= 2) {
        const aggG = g.append('g').attr('class', 'deck-overlay-deck-evolution').style('pointer-events', 'none');
        const meanPath = aggG
          .append('path')
          .datum(deckEvolutionIndex)
          .attr('fill', 'none')
          .attr('stroke', 'var(--mc-text-muted)')
          .attr('stroke-width', 2)
          .attr('stroke-dasharray', '6 5')
          .attr('opacity', 0.95)
          .attr('d', meanPathGenIdx);
        meanPath.append('title').text(labels.aggregateMeanCaption);
        const medPath = aggG
          .append('path')
          .datum(deckEvolutionIndex)
          .attr('fill', 'none')
          .attr('stroke', 'var(--mc-accent-primary)')
          .attr('stroke-width', 2)
          .attr('stroke-dasharray', '3 4')
          .attr('opacity', 0.95)
          .attr('d', medianPathGenIdx);
        medPath.append('title').text(labels.aggregateMedianCaption);
      } else if (deckEvolutionIndex.length === 1) {
        const aggG = g.append('g').attr('class', 'deck-overlay-deck-evolution').style('pointer-events', 'none');
        const d0 = deckEvolutionIndex[0]!;
        const xm = xIndex(d0.idx);
        const ym = useLogY && !(d0.mean > 0 && Number.isFinite(d0.mean)) ? null : y(d0.mean);
        const ymed = useLogY && !(d0.median > 0 && Number.isFinite(d0.median)) ? null : y(d0.median);
        if (ym != null) {
          aggG
            .append('circle')
            .attr('cx', xm)
            .attr('cy', ym)
            .attr('r', 4)
            .attr('fill', 'none')
            .attr('stroke', 'var(--mc-text-muted)')
            .attr('stroke-width', 2)
            .append('title')
            .text(labels.aggregateMeanCaption);
        }
        if (ymed != null) {
          aggG
            .append('circle')
            .attr('cx', xm)
            .attr('cy', ymed)
            .attr('r', 4)
            .attr('fill', 'none')
            .attr('stroke', 'var(--mc-accent-primary)')
            .attr('stroke-width', 2)
            .append('title')
            .text(labels.aggregateMedianCaption);
        }
      }
    }

    /** Rating-colored markers (cross for Again), aligned with CardReviewHistoryChart. */
    if (showCardSeries && ratingMarkerMode !== 'hidden') {
      const visMarkers = g
        .append('g')
        .attr('class', 'deck-overlay-markers')
        .style('pointer-events', 'none')
        .attr('opacity', ratingMarkerMode === 'faded' ? RATING_MARKER_FADE_OPACITY : 1);
      for (const s of seriesList) {
        const pts = s.points;
        for (let i = 0; i < pts.length; i++) {
          const p = pts[i]!;
          if (useLogY && !(p.y > 0 && Number.isFinite(p.y))) continue;
          const isLast = i === pts.length - 1;
          const cx = xForSeriesPt(p.tMs, i);
          const cy = y(p.y);
          const fill = ratingFillCss(p.log.rating);
          if (p.log.rating === 1) {
            const arm = isLast ? RATING_AGAIN_CROSS_ARM : RATING_AGAIN_CROSS_ARM_INNER;
            const crossG = visMarkers.append('g').attr('transform', `translate(${cx},${cy})`);
            const d = `M ${-arm},${-arm} L ${arm},${arm} M ${-arm},${arm} L ${arm},${-arm}`;
            if (isLast) {
              crossG
                .append('path')
                .attr('d', d)
                .attr('fill', 'none')
                .style('stroke', 'var(--mc-bg-surface)')
                .attr('stroke-width', 3)
                .attr('stroke-linecap', 'round');
              crossG
                .append('path')
                .attr('d', d)
                .attr('fill', 'none')
                .style('stroke', fill)
                .attr('stroke-width', 1.75)
                .attr('stroke-linecap', 'round');
            } else {
              crossG
                .append('path')
                .attr('d', d)
                .attr('fill', 'none')
                .style('stroke', fill)
                .attr('stroke-width', 1.2)
                .attr('stroke-linecap', 'round');
            }
          } else {
            const r = isLast ? RATING_MARKER_R_LAST : RATING_MARKER_R_INNER;
            const dot = visMarkers
              .append('circle')
              .attr('cx', cx)
              .attr('cy', cy)
              .attr('r', r)
              .style('fill', fill);
            if (isLast) {
              dot.style('stroke', 'var(--mc-bg-surface)').attr('stroke-width', 1.5);
            } else {
              dot.attr('stroke', 'none');
            }
          }
        }
      }
    }

    const xAxisG = g.append('g').attr('transform', `translate(0,${lineH})`);
    if (useTimeX) {
      const xAxis = d3
        .axisBottom(xTime)
        .ticks(Math.min(8, Math.max(3, Math.floor(plotInnerW / 72))))
        .tickFormat((d) => tickFormatTime(d as Date));
      xAxisG.call(xAxis);
      xAxisG.call((sel) => {
        sel.select('.domain').remove();
        sel.selectAll('.tick line').style('stroke', 'var(--mc-border-subtle)');
        sel.selectAll('text').style('fill', 'var(--mc-text-secondary)').attr('font-size', 10);
      });
    } else {
      const labelStep = nIdx <= 16 ? 1 : Math.max(1, Math.ceil(nIdx / 14));
      const xAxis = d3
        .axisBottom(xIndex)
        .tickValues(d3.range(nIdx))
        .tickFormat((d) => {
          const i = Number(d);
          return i % labelStep === 0 || i === nIdx - 1 ? String(i + 1) : '';
        });
      xAxisG.call(xAxis);
      xAxisG.call((sel) => {
        sel.select('.domain').remove();
        sel.selectAll('.tick line').style('stroke', 'var(--mc-border-subtle)');
        sel
          .selectAll('text')
          .style('fill', 'var(--mc-text-secondary)')
          .attr('font-size', nIdx > 24 ? 8 : 10)
          .attr('text-anchor', nIdx > 16 ? 'end' : 'middle')
          .attr('dx', nIdx > 16 ? '-0.35em' : '0')
          .attr('dy', nIdx > 16 ? '0.5em' : '0.71em')
          .attr('transform', nIdx > 16 ? 'rotate(-52)' : null);
      });
    }

    g.append('text')
      .attr('x', plotInnerW / 2)
      .attr('y', lineH + 28)
      .attr('text-anchor', 'middle')
      .style('fill', 'var(--mc-text-muted)')
      .attr('font-size', 10)
      .text(useTimeX ? labels.axisTimeCaption : labels.axisReviewOrder);

    const yLabel =
      metric === 'stability' ? labels.axisStability : labels.axisDifficulty;

    const axisY = useLogY
      ? d3
          .axisLeft(y)
          .ticks(4)
          .tickFormat((dv) => d3.format('.2f')(typeof dv === 'number' ? dv : Number(dv)))
      : d3.axisLeft(y).ticks(5).tickFormat(d3.format('.2f'));
    const yAxisG = g.append('g').attr('class', 'deck-overlay-axis-y');
    yAxisG.call(axisY);
    yAxisG.call((sel) => {
      sel.selectAll('path,line').style('stroke', 'var(--mc-border-subtle)');
      sel.selectAll('text').style('fill', 'var(--mc-text-secondary)').attr('font-size', 10);
    });

    const tickMatch = (a: number, b: number) =>
      Number.isFinite(a) &&
      Number.isFinite(b) &&
      (a === b || Math.abs(a - b) <= 1e-5 * Math.max(1, Math.abs(a), Math.abs(b)));

    const resetYGridHover = () => {
      gridG
        .selectAll('.deck-overlay-y-grid-line')
        .attr('opacity', 0.4)
        .attr('stroke-width', 1);
    };

    const showYTickHover = (tickVal: number, ev: MouseEvent) => {
      const rect = wrapRef.current?.getBoundingClientRect();
      if (!rect) return;
      const valTxt = d3.format('.2f')(tickVal);
      setTip({
        x: ev.clientX - rect.left,
        y: ev.clientY - rect.top,
        text: `${yLabel}: ${valTxt}`,
      });
      gridG.selectAll('.deck-overlay-y-grid-line').each(function () {
        const line = d3.select(this);
        const v = Number(line.attr('data-tick'));
        const match = tickMatch(v, tickVal);
        line.attr('opacity', match ? 0.95 : 0.22).attr('stroke-width', match ? 1.75 : 1);
      });
    };

    yAxisG.selectAll<SVGGElement, number | { valueOf(): number }>('g.tick').each(function (d) {
      const tickVal = typeof d === 'number' ? d : Number(d);
      if (!Number.isFinite(tickVal)) return;
      const tickG = d3.select(this);
      tickG.select('text').style('pointer-events', 'none');
      const textNode = tickG.select('text').node() as SVGGraphicsElement | null;
      if (!textNode) return;
      let bbox: DOMRect;
      try {
        bbox = textNode.getBBox();
      } catch {
        return;
      }
      if (bbox.width <= 0 || bbox.height <= 0) return;
      tickG
        .insert('rect', 'text')
        .attr('class', 'deck-overlay-y-tick-hit')
        .attr('x', bbox.x - 3)
        .attr('y', bbox.y - 2)
        .attr('width', bbox.width + 6)
        .attr('height', bbox.height + 4)
        .attr('fill', 'transparent')
        .style('cursor', 'default')
        .on('mouseenter', function (ev) {
          showYTickHover(tickVal, ev as MouseEvent);
        })
        .on('mouseleave', () => {
          resetYGridHover();
          setTip(null);
        });
    });

    g.append('text')
      .attr('transform', 'rotate(-90)')
      .attr('y', -34)
      .attr('x', -lineH / 2)
      .attr('text-anchor', 'middle')
      .style('fill', 'var(--mc-text-muted)')
      .attr('font-size', 10)
      .text(yLabel);

    /** Right-edge circled ? icons (LTM + last deck mean/median); values only in tooltips. */
    const endLab = g.append('g').attr('class', 'deck-overlay-end-labels');
    const fmtEnd = d3.format('.2f');
    const iconCx = plotInnerW + 6 + HELP_ICON_R;
    const endItems: EndCapRow[] = [];
    if (metric === 'stability') {
      const ltmDays = STABILITY_LONG_TERM_GOAL_DAYS;
      endItems.push({
        y: y(ltmDays),
        strokeColor: 'var(--mc-accent-success)',
        tooltip: `${labels.stabilityLongTermGoalCaption}\n${ltmDays} d\n\n${labels.lineTooltipLtm}`,
      });
    }
    const activeEvoLast = useTimeX
      ? deckEvolution[deckEvolution.length - 1]
      : deckEvolutionIndex[deckEvolutionIndex.length - 1];
    if (showDeckSummary && activeEvoLast) {
      const lastE = activeEvoLast;
      endItems.push({
        y: y(lastE.mean),
        strokeColor: 'var(--mc-text-muted)',
        tooltip: `${labels.lineEndMeanCaption}: ${fmtEnd(lastE.mean)}\n\n${labels.lineTooltipMean}`,
      });
      endItems.push({
        y: y(lastE.median),
        strokeColor: 'var(--mc-accent-primary)',
        tooltip: `${labels.lineEndMedianCaption}: ${fmtEnd(lastE.median)}\n\n${labels.lineTooltipMedian}`,
      });
    }
    for (const it of packEndLabels(endItems, lineH)) {
      const iconG = endLab
        .append('g')
        .attr('class', 'deck-overlay-end-help-icon')
        .attr('transform', `translate(${iconCx},${it.y})`)
        .attr('role', 'img')
        .attr('aria-label', `${labels.helpIconAria}: ${it.tooltip}`)
        .style('cursor', 'help');
      iconG.append('title').text(it.tooltip);
      appendLucideCircleQuestionHelp(iconG, it.strokeColor);
    }

    /** Invisible overlay for nearest-point tooltip */
    const flatPoints = showCardSeries
      ? seriesList.flatMap((s) =>
          s.points
            .map((p, i) => ({ p, i }))
            .filter(({ p }) => !useLogY || (p.y > 0 && Number.isFinite(p.y)))
            .map(({ p, i }) => ({
              px: xForSeriesPt(p.tMs, i),
              py: y(p.y),
              cardId: s.cardId,
              recto: s.recto,
              log: p.log,
              color: s.color,
            }))
        )
      : [];

    g.append('rect')
      .attr('x', 0)
      .attr('y', 0)
      .attr('width', plotInnerW)
      .attr('height', lineH)
      .attr('fill', 'transparent')
      .style('cursor', showCardSeries ? 'crosshair' : 'default')
      .on('mousemove', function (ev: MouseEvent) {
        resetYGridHover();
        if (!showCardSeries) {
          setTip(null);
          return;
        }
        const [mx, my] = d3.pointer(ev, this);
        let best: (typeof flatPoints)[0] | null = null;
        let bestD = Infinity;
        for (const p of flatPoints) {
          const dx = p.px - mx;
          const dy = p.py - my;
          const d2 = dx * dx + dy * dy;
          if (d2 < bestD) {
            bestD = d2;
            best = p;
          }
        }
        if (!best || bestD > 28 * 28) {
          setTip(null);
          return;
        }
        const rect = wrapRef.current?.getBoundingClientRect();
        if (!rect) return;
        const preview = previewCardRecto(best.recto ?? '', 72);
        const val =
          metric === 'stability' ? best.log.stability_after : best.log.difficulty_after;
        const valTxt = val != null && Number.isFinite(val) ? val.toFixed(2) : '—';
        const text = [
          preview,
          formatEventTime(best.log.review_time, locale),
          ...(ratingLabel ? [ratingLabel(best.log.rating)] : []),
          `${yLabel}: ${valTxt}`,
        ].join('\n');
        setTip({ x: ev.clientX - rect.left, y: ev.clientY - rect.top, text });
      })
      .on('mouseleave', () => {
        resetYGridHover();
        setTip(null);
      });

    return () => {
      resetYGridHover();
      setTip(null);
    };
  }, [
    seriesList,
    chartTotalWidth,
    plotInnerW,
    lineH,
    locale,
    labels.axisStability,
    labels.axisDifficulty,
    labels.axisTimeCaption,
    labels.axisReviewOrder,
    labels.stabilityLongTermGoalCaption,
    labels.aggregateMeanCaption,
    labels.aggregateMedianCaption,
    labels.lineEndMeanCaption,
    labels.lineEndMedianCaption,
    labels.lineTooltipLtm,
    labels.lineTooltipMean,
    labels.lineTooltipMedian,
    labels.helpIconAria,
    deckEvolution,
    deckEvolutionIndex,
    maxSeriesLen,
    xAxisByTime,
    metric,
    padT,
    spanT,
    tMax,
    tMin,
    yExtent.max,
    yExtent.min,
    stabilityYLog,
    stabilityLogYDomain,
    ratingLabel,
    ratingMarkerMode,
    displayMode,
    showCardSeries,
    showDeckSummary,
  ]);

  if (cards.length === 0) return null;

  return (
    <section
      className="rounded-lg border border-(--mc-border-subtle) bg-(--mc-bg-page) p-3"
      aria-labelledby={titleId}
    >
      <div className="mb-2 flex min-w-0 flex-col gap-2 md:flex-row md:items-start md:justify-between md:gap-3">
        <h4
          id={titleId}
          className="min-w-0 text-sm font-medium text-(--mc-text-primary) md:max-w-[min(100%,20rem)] md:shrink"
        >
          {labels.chartTitle}
        </h4>
        <div className="grid min-w-0 w-full grid-cols-2 gap-x-1.5 gap-y-1.5 md:flex md:w-auto md:max-w-full md:flex-wrap md:items-center md:justify-end md:gap-1">
          <select
            className={chartToolbarSelectClassName}
            value={metric}
            aria-label={labels.metricGroup}
            onChange={(e) => setMetric(e.target.value as Metric)}
          >
            <option value="stability">{labels.metricStability}</option>
            <option value="difficulty">{labels.metricDifficulty}</option>
          </select>
          {metric === 'stability' ? (
            <select
              className={chartToolbarSelectClassName}
              value={stabilityYLog ? 'log' : 'linear'}
              aria-label={labels.stabilityYScaleGroup}
              onChange={(e) => setStabilityYLog(e.target.value === 'log')}
            >
              <option value="linear">{labels.stabilityYScaleLinear}</option>
              <option value="log">{labels.stabilityYScaleLog}</option>
            </select>
          ) : null}
          <select
            className={chartToolbarSelectClassName}
            value={ratingMarkerMode}
            aria-label={labels.ratingMarkersModeGroup}
            onChange={(e) => setRatingMarkerMode(e.target.value as RatingMarkerMode)}
          >
            <option value="visible">{labels.ratingMarkersSolid}</option>
            <option value="faded">{labels.ratingMarkersFaded}</option>
            <option value="hidden">{labels.ratingMarkersHidden}</option>
          </select>
          <select
            className={chartToolbarSelectClassName}
            value={xAxisByTime ? 'time' : 'index'}
            aria-label={labels.chartXAxisModeGroup}
            onChange={(e) => setXAxisByTime(e.target.value === 'time')}
          >
            <option value="time">{labels.chartXAxisSwitchToTime}</option>
            <option value="index">{labels.chartXAxisSwitchToIndex}</option>
          </select>
          <select
            className={chartToolbarSelectClassName}
            value={displayMode}
            aria-label={labels.displayModeGroup}
            onChange={(e) => setDisplayMode(e.target.value as OverlayDisplayMode)}
          >
            <option value="all">{labels.displayModeAll}</option>
            <option value="cardsOnly">{labels.displayModeCardsOnly}</option>
            <option value="deckOnly">{labels.displayModeDeckOnly}</option>
          </select>
          <select
            className={chartToolbarSelectClassName}
            value={cardScope}
            aria-label={labels.cardScopeGroup}
            onChange={(e) => setCardScope(e.target.value as OverlayCardScope)}
          >
            <option value="all">{labels.cardScopeAll}</option>
            <option value="capped100">{labels.cardScopeCap}</option>
          </select>
        </div>
      </div>
      <p className="mb-2 text-[11px] text-(--mc-text-muted)">{labels.hoverHint}</p>
      {seriesList.length === 0 ? (
        <p className="text-sm text-(--mc-text-muted)">{labels.emptyMetric}</p>
      ) : (
        <div
          ref={scrollRef}
          className="w-full max-w-full overflow-x-auto overflow-y-hidden overscroll-x-contain"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          <div ref={wrapRef} className="relative" style={{ width: chartTotalWidth, minWidth: '100%' }}>
            <svg
              ref={svgRef}
              className="block max-w-none shrink-0"
              width={chartTotalWidth}
              height={CHART_HEIGHT}
              aria-hidden
            />
            {tip && (
              <div
                className="pointer-events-none absolute z-10 max-w-[min(100%,260px)] rounded-md border border-(--mc-border-subtle) bg-(--mc-bg-surface) px-2 py-1.5 text-[11px] text-(--mc-text-primary) shadow-lg whitespace-pre-line"
                style={{
                  left: Math.min(chartTotalWidth - 200, Math.max(8, tip.x + 12)),
                  top: Math.min(CHART_HEIGHT - 88, Math.max(8, tip.y + 12)),
                }}
              >
                {tip.text}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
