'use client';

import * as d3 from 'd3';
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { eventTimeToMs, formatEventTime, formatReviewLogGapMs } from './deckDetailHelpers';
import { chartToolbarSelectClassName } from '@/components/ui/chartToolbarSelect';

export type CardReviewLogPoint = {
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

type Augmented = { log: CardReviewLogPoint; tMs: number; index: number };

/** One x-step per review log (chronological order); calendar spacing is not visual width. */
function buildAugmented(logs: CardReviewLogPoint[]): Augmented[] {
  const withMs = logs
    .map((log) => ({ log, tMs: eventTimeToMs(log.review_time) }))
    .filter((x): x is { log: CardReviewLogPoint; tMs: number } => x.tMs != null);
  withMs.sort((a, b) => a.tMs - b.tMs);
  return withMs.map((row, index) => ({ ...row, index }));
}

/** Exported for DeckMultiCardOverlayChart — same legend as single-card history. */
export function ratingFillCss(rating: number): string {
  switch (rating) {
    case 1:
      return 'var(--mc-accent-danger)';
    case 2:
      return 'var(--mc-accent-warning)';
    case 3:
      return 'var(--mc-accent-success)';
    case 4:
      return 'var(--mc-accent-primary)';
    default:
      return 'var(--mc-text-muted)';
  }
}

const COLOR_S_LINE = 'var(--mc-accent-success)';
const COLOR_D_LINE = 'var(--mc-accent-primary)';
/** R bars: theme tint (avoid dark text-secondary on plot). */
const R_BAR_FILL = 'var(--mc-accent-primary)';

/** Half-size of Again (rating 1) cross arms; matches visual weight of r=5 circles. */
export const RATING_AGAIN_CROSS_ARM = 4;
/** Latest review on the card: full dot with surface ring (deck overlay uses the same). */
export const RATING_MARKER_R_LAST = 5;
/** Earlier reviews: smaller fill-only dot. */
export const RATING_MARKER_R_INNER = 2.75;
/** Again cross arm for earlier reviews (no halo). */
export const RATING_AGAIN_CROSS_ARM_INNER = 2.35;

/** Opacity for rating circles/crosses in "faded" mode (deck overlay + card history charts). */
export const RATING_MARKER_FADE_OPACITY = 0.4;

/** Reference stability (days) for the long-term memory zone band + threshold line on charts. */
export const STABILITY_LONG_TERM_GOAL_DAYS = 15;

export type RatingMarkerMode = 'visible' | 'faded' | 'hidden';

/** Optional neighbor histories for Tier A comparison (S/D polylines only, no markers). */
export type CardReviewLinkedSeries = {
  cardId: string;
  /** Short label (e.g. recto preview) for tooltips. */
  label: string;
  logs: CardReviewLogPoint[];
};

export type CardReviewHistoryChartLabels = {
  chartTitle: string;
  axisStability: string;
  axisDifficulty: string;
  axisRetrievability: string;
  axisReviewOrder: string;
  axisTimeCaption: string;
  chartXAxisSwitchToTime: string;
  chartXAxisSwitchToIndex: string;
  /** Accessible name for the X-axis mode `<select>`. */
  chartXAxisModeGroup: string;
  chartCompareLinkedOff: string;
  chartCompareLinkedOn: string;
  chartCompareLinkedGroup: string;
  srCaption: string;
  ratingMarkersSolid: string;
  ratingMarkersFaded: string;
  ratingMarkersHidden: string;
  /** `role="group"` on the three-way rating marks control */
  ratingMarkersModeGroup: string;
  /** Short label drawn on the S≥15d band (long-term memory goal). */
  stabilityLongTermGoalCaption: string;
};

type Props = {
  logs: CardReviewLogPoint[];
  locale: string;
  labels: CardReviewHistoryChartLabels;
  ratingLabel: (rating: number) => string;
  /** `null` = first log in chart (no previous sibling). */
  formatLogGap: (deltaMs: number | null) => string;
  /** When true, show compare control (parent still passes `linkedSeries` only when compare is on). */
  canCompareLinked?: boolean;
  compareLinked?: boolean;
  onCompareLinkedChange?: (value: boolean) => void;
  /** Linked card histories; typically empty unless compare is enabled. */
  linkedSeries?: CardReviewLinkedSeries[];
};

/** Top margin reduced: S/D/R legends live below the SVG. */
const M = { top: 14, right: 46, bottom: 54, left: 50 };
/** Bottom band: x-axis ticks, gaps between logs, review-order caption. */
const R_BAND = 64;
/** Height of the day damier strip (top of the x-axis band, under plot edge; ticks draw on top). */
const DAY_BAND_H = 10;
const CHART_MIN_WIDTH = 280;
const CHART_HEIGHT = 280;
/** Minimum horizontal distance between two consecutive logs (index axis mode). */
const MIN_LOG_GAP_PX = 35;

/** Strong enough contrast vs card background; CSS vars alone were often too subtle. */
const DAY_BAND_FILL_A = 'color-mix(in oklab, var(--mc-bg-page) 100%, transparent)';
const DAY_BAND_FILL_B = 'color-mix(in oklab, var(--mc-text-primary) 10%, var(--mc-bg-page))';

function startOfLocalDay(d: Date): Date {
  const x = new Date(d.getTime());
  x.setHours(0, 0, 0, 0);
  return x;
}

function addLocalDays(d: Date, n: number): Date {
  const x = new Date(d.getTime());
  x.setDate(x.getDate() + n);
  return x;
}

/** Stable local-calendar key for grouping logs by day. */
function dayKeyLocal(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Consistent 0/1 stripe for a calendar day (alternates by day). */
function stripeFromDayKey(key: string): number {
  const parts = key.split('-').map(Number);
  const y = parts[0]!;
  const mo = parts[1]!;
  const d = parts[2]!;
  return Math.floor(Date.UTC(y, mo - 1, d) / 86_400_000) % 2;
}

function linkedSeriesHue(j: number, total: number): string {
  const h = ((j + 3) * 360) / Math.max(total + 3, 1);
  return `hsl(${h} 52% 40%)`;
}

export function CardReviewHistoryChart({
  logs,
  locale,
  labels,
  ratingLabel,
  formatLogGap,
  canCompareLinked = false,
  compareLinked = false,
  onCompareLinkedChange,
  linkedSeries = [],
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [viewportWidth, setViewportWidth] = useState(CHART_MIN_WIDTH);
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null);
  /** `true` = X positions follow real review timestamps; `false` = one step per log. */
  const [xAxisByTime, setXAxisByTime] = useState(false);
  /** Rating point visuals: solid, semi-transparent, or not drawn (S/D lines and R bars unchanged). */
  const [ratingMarkerMode, setRatingMarkerMode] = useState<RatingMarkerMode>('visible');
  const titleId = useId();

  const augmented = useMemo(() => buildAugmented(logs), [logs]);
  const linkedAugmented = useMemo(
    () => linkedSeries.map((s) => buildAugmented(s.logs)),
    [linkedSeries]
  );

  const nLogs = augmented.length;
  const maxLinkedN = useMemo(
    () => (linkedAugmented.length ? Math.max(...linkedAugmented.map((a) => a.length)) : 0),
    [linkedAugmented]
  );
  const maxN = Math.max(nLogs, maxLinkedN, 1);

  const { tMin, tMax, spanT, padT } = useMemo(() => {
    const allRows = [augmented, ...linkedAugmented];
    const allT = allRows.flatMap((a) => a.map((x) => x.tMs));
    if (allT.length === 0) {
      return { tMin: 0, tMax: 1, spanT: 1, padT: 1 };
    }
    const tMinV = d3.min(allT)!;
    const tMaxV = d3.max(allT)!;
    const spanTV = Math.max(tMaxV - tMinV, 60_000);
    const padTV = Math.max(spanTV * 0.05, 3_600_000);
    return { tMin: tMinV, tMax: tMaxV, spanT: spanTV, padT: padTV };
  }, [augmented, linkedAugmented]);

  const plotInnerW = useMemo(() => {
    const vw = Math.max(viewportWidth, CHART_MIN_WIDTH);
    const viewportInnerW = Math.max(0, vw - M.left - M.right);
    if (xAxisByTime) return viewportInnerW;
    if (maxN <= 1) return viewportInnerW;
    return Math.max(viewportInnerW, (maxN - 1) * MIN_LOG_GAP_PX);
  }, [viewportWidth, xAxisByTime, maxN]);

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

  /** Wheel scrolls the chart horizontally when it overflows (vertical wheel or trackpad). */
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth + 1) return;
      const delta =
        Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.shiftKey ? e.deltaY : e.deltaY;
      if (delta === 0) return;
      e.preventDefault();
      e.stopPropagation();
      el.scrollLeft += delta;
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  /** Index mode: show the latest logs first (scroll to the right). Time mode: align start. */
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
  }, [xAxisByTime, plotInnerW, chartTotalWidth, nLogs, maxN, viewportWidth]);

  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl || augmented.length === 0) return;

    const n = augmented.length;
    const innerW = plotInnerW;
    const innerH = CHART_HEIGHT - M.top - M.bottom;
    const lineH = innerH - R_BAND;

    const xIndex = d3
      .scaleLinear()
      .domain(maxN === 1 ? [-0.5, 0.5] : [-0.5, maxN - 0.5])
      .range([0, innerW]);

    const xTime = d3
      .scaleTime()
      .domain([new Date(tMin - padT), new Date(tMax + padT)])
      .range([0, innerW]);

    const useTimeX = xAxisByTime;
    const xPos = (a: Augmented) => (useTimeX ? xTime(new Date(a.tMs)) : xIndex(a.index));

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

    const sVals = [
      ...augmented.map((a) => a.log.stability_after),
      ...linkedAugmented.flatMap((a) => a.map((x) => x.log.stability_after)),
    ].filter((v): v is number => v != null && Number.isFinite(v));
    const maxS = Math.max(0.5, d3.max(sVals) ?? 1);
    const yS = d3
      .scaleLinear()
      .domain([0, Math.max(maxS * 1.12, STABILITY_LONG_TERM_GOAL_DAYS * 1.12)])
      .range([lineH, 0]);

    const dVals = [
      ...augmented.map((a) => a.log.difficulty_after),
      ...linkedAugmented.flatMap((a) => a.map((x) => x.log.difficulty_after)),
    ].filter((v): v is number => v != null && Number.isFinite(v));
    const dMin = Math.min(0, d3.min(dVals) ?? 0);
    const dMax = Math.max(10, d3.max(dVals) ?? 10);
    const dSpan = dMax - dMin;
    const yD = d3
      .scaleLinear()
      .domain([dMin, dMax + Math.max(dSpan * 0.08, 0.01)])
      .range([lineH, 0]);

    /** R bars: 100% retrievability spans the full plot height (axis y = lineH up to y = 0). */
    const rMaxH = lineH;

    const svg = d3.select(svgEl);
    svg.selectAll('*').remove();
    svg.attr('width', chartTotalWidth).attr('height', CHART_HEIGHT).attr('aria-hidden', 'true');

    const g = svg.append('g').attr('transform', `translate(${M.left},${M.top})`);

    /** Area below the damier: gaps, axis caption (damier sits under ticks at lineH). */
    g.append('rect')
      .attr('x', 0)
      .attr('y', lineH + DAY_BAND_H)
      .attr('width', innerW)
      .attr('height', R_BAND - DAY_BAND_H)
      .style('fill', 'var(--mc-bg-page)');

    const dayBandsG = g
      .append('g')
      .attr('class', 'chart-x-day-bands')
      .attr('transform', `translate(0,${lineH})`);

    const pushDayBand = (x1: number, x2: number, stripe: number) => {
      const left = Math.max(0, Math.min(innerW, x1));
      const right = Math.max(0, Math.min(innerW, x2));
      if (right <= left) return;
      dayBandsG
        .append('rect')
        .attr('x', left)
        .attr('y', 0)
        .attr('width', right - left)
        .attr('height', DAY_BAND_H)
        .style('fill', stripe % 2 === 0 ? DAY_BAND_FILL_A : DAY_BAND_FILL_B)
        .style('stroke', 'var(--mc-border-subtle)')
        .style('stroke-width', 0.5)
        .style('stroke-opacity', 0.45)
        .style('pointer-events', 'none');
    };

    if (useTimeX) {
      const domainStart = new Date(tMin - padT);
      const domainEnd = new Date(tMax + padT);
      let cur = startOfLocalDay(domainStart);
      let stripe = 0;
      while (cur.getTime() < domainEnd.getTime()) {
        const next = addLocalDays(cur, 1);
        const x1 = xTime(cur);
        const x2 = xTime(next);
        pushDayBand(x1, x2, stripe);
        stripe += 1;
        cur = next;
      }
    } else {
      /**
       * Full calendar strip in index mode: within each horizontal segment (margin or
       * between consecutive logs), map time linearly to x and fill with one rect per
       * local calendar day (empty days appear as stripes in long gaps).
       */
      const appendCalendarStripesForTimeSegment = (
        t0: number,
        t1: number,
        xLeft: number,
        xRight: number
      ) => {
        if (t1 <= t0) return;
        const dur = t1 - t0;
        let cur = startOfLocalDay(new Date(t0));
        while (cur.getTime() < t1) {
          const next = addLocalDays(cur, 1);
          const segT0 = Math.max(t0, cur.getTime());
          const segT1 = Math.min(t1, next.getTime());
          if (segT0 < segT1) {
            const xl = xLeft + ((segT0 - t0) / dur) * (xRight - xLeft);
            const xr = xLeft + ((segT1 - t0) / dur) * (xRight - xLeft);
            const stripe = stripeFromDayKey(dayKeyLocal(segT0));
            pushDayBand(xl, xr, stripe);
          }
          cur = next;
        }
      };

      if (n === 1) {
        const t0 = augmented[0]!.tMs;
        const d0 = startOfLocalDay(new Date(t0));
        const d1 = addLocalDays(d0, 1);
        appendCalendarStripesForTimeSegment(d0.getTime(), d1.getTime(), xIndex(-0.5), xIndex(0.5));
      } else {
        const tFirst = augmented[0]!.tMs;
        const dayStartFirst = startOfLocalDay(new Date(tFirst)).getTime();
        if (tFirst > dayStartFirst) {
          appendCalendarStripesForTimeSegment(
            dayStartFirst,
            tFirst,
            xIndex(-0.5),
            xIndex(0)
          );
        }
        for (let i = 1; i < n; i++) {
          appendCalendarStripesForTimeSegment(
            augmented[i - 1]!.tMs,
            augmented[i]!.tMs,
            xIndex(i - 1),
            xIndex(i)
          );
        }
        const tLast = augmented[n - 1]!.tMs;
        const dayEndLast = addLocalDays(startOfLocalDay(new Date(tLast)), 1).getTime();
        if (dayEndLast > tLast) {
          appendCalendarStripesForTimeSegment(
            tLast,
            dayEndLast,
            xIndex(n - 1),
            xIndex(n - 0.5)
          );
        }
      }
      if (maxN > n && n >= 1) {
        const tLast = augmented[n - 1]!.tMs;
        const dayEndLast = addLocalDays(startOfLocalDay(new Date(tLast)), 1).getTime();
        appendCalendarStripesForTimeSegment(
          tLast,
          dayEndLast,
          xIndex(n - 1),
          xIndex(maxN - 0.5)
        );
      }
    }

    /** Dashed threshold at goal stability (days) — behind R bars and curves. */
    if (sVals.length > 0) {
      const yG = yS(STABILITY_LONG_TERM_GOAL_DAYS);
      const goalG = g.append('g').attr('class', 'chart-stability-ltm-goal').style('pointer-events', 'none');
      goalG
        .append('line')
        .attr('x1', 0)
        .attr('x2', innerW)
        .attr('y1', yG)
        .attr('y2', yG)
        .attr('stroke', 'var(--mc-accent-success)')
        .attr('stroke-width', 1.25)
        .attr('stroke-dasharray', '5 4')
        .attr('opacity', 0.92);
      goalG
        .append('text')
        .attr('x', innerW - 6)
        .attr('y', Math.max(11, yG - 4))
        .attr('text-anchor', 'end')
        .style('fill', 'var(--mc-accent-success)')
        .attr('font-size', 10)
        .attr('font-weight', '600')
        .text(labels.stabilityLongTermGoalCaption);
    }

    for (let j = 0; j < linkedAugmented.length; j++) {
      const la = linkedAugmented[j]!;
      const strokeHue = linkedSeriesHue(j, linkedAugmented.length);
      const xL = (idx: number, tMs: number) => (useTimeX ? xTime(new Date(tMs)) : xIndex(idx));
      const sLinked = la.map((a, idx) => ({
        index: idx,
        tMs: a.tMs,
        y:
          a.log.stability_after != null && Number.isFinite(a.log.stability_after)
            ? a.log.stability_after
            : null,
      }));
      if (sLinked.some((d) => d.y != null)) {
        const lineSL = d3
          .line<(typeof sLinked)[0]>()
          .defined((d) => d.y != null)
          .x((d) => xL(d.index, d.tMs))
          .y((d) => yS(d.y as number))
          .curve(d3.curveMonotoneX);
        g.append('path')
          .datum(sLinked)
          .attr('fill', 'none')
          .style('stroke', strokeHue)
          .attr('stroke-width', 1.2)
          .attr('stroke-opacity', 0.52)
          .attr('d', lineSL);
      }
      const dLinked = la.map((a, idx) => ({
        index: idx,
        tMs: a.tMs,
        y:
          a.log.difficulty_after != null && Number.isFinite(a.log.difficulty_after)
            ? a.log.difficulty_after
            : null,
      }));
      if (dLinked.some((d) => d.y != null)) {
        const lineDL = d3
          .line<(typeof dLinked)[0]>()
          .defined((d) => d.y != null)
          .x((d) => xL(d.index, d.tMs))
          .y((d) => yD(d.y as number))
          .curve(d3.curveMonotoneX);
        g.append('path')
          .datum(dLinked)
          .attr('fill', 'none')
          .style('stroke', strokeHue)
          .attr('stroke-width', 1.15)
          .attr('stroke-dasharray', '4 3')
          .attr('stroke-opacity', 0.48)
          .attr('d', lineDL);
      }
    }

    const rBarsBack = g.append('g').attr('class', 'chart-r-bars-back');
    const rBarW = 5;
    augmented.forEach((a) => {
      const r = a.log.retrievability_before;
      if (r == null || !Number.isFinite(r)) return;
      const cx = xPos(a);
      const h = Math.max(0, r) * rMaxH;
      rBarsBack
        .append('rect')
        .attr('x', cx - rBarW / 2)
        .attr('y', lineH - h)
        .attr('width', rBarW)
        .attr('height', h)
        .attr('rx', 1)
        .style('fill', R_BAR_FILL)
        .style('opacity', '0.28');
    });

    const labelStep = maxN <= 16 ? 1 : Math.max(1, Math.ceil(maxN / 14));
    const xAxisG = g.append('g').attr('transform', `translate(0,${lineH})`);
    if (useTimeX) {
      const xAxis = d3
        .axisBottom(xTime)
        .ticks(Math.min(8, Math.max(3, Math.floor(innerW / 72))))
        .tickFormat((d) => tickFormatTime(d as Date));
      xAxisG.call(xAxis);
      xAxisG.call((sel) => {
        sel.select('.domain').remove();
        sel.selectAll('.tick line').style('stroke', 'var(--mc-border-subtle)');
        sel
          .selectAll('text')
          .style('fill', 'var(--mc-text-secondary)')
          .attr('font-size', maxN > 24 ? 8 : 10)
          .attr('text-anchor', 'middle')
          .attr('dy', '0.71em');
      });
    } else {
      const xAxis = d3
        .axisBottom(xIndex)
        .tickValues(d3.range(maxN))
        .tickFormat((d) => {
          const i = Number(d);
          return i % labelStep === 0 || i === maxN - 1 ? String(i + 1) : '';
        });
      xAxisG.call(xAxis);
      xAxisG.call((sel) => {
        sel.select('.domain').remove();
        sel.selectAll('.tick line').style('stroke', 'var(--mc-border-subtle)');
        sel
          .selectAll('text')
          .style('fill', 'var(--mc-text-secondary)')
          .attr('font-size', maxN > 24 ? 8 : 10)
          .attr('text-anchor', maxN > 16 ? 'end' : 'middle')
          .attr('dx', maxN > 16 ? '-0.35em' : '0')
          .attr('dy', maxN > 16 ? '0.5em' : '0.71em')
          .attr('transform', maxN > 16 ? 'rotate(-52)' : null);
      });
    }

    if (!useTimeX && n > 1) {
      const segWIndex = innerW / Math.max(maxN - 1, 1);
      const gapG = g.append('g').attr('class', 'chart-x-gap-labels');
      let lastCx = -Infinity;
      for (let i = 1; i < n; i++) {
        const cx = (xPos(augmented[i - 1]!) + xPos(augmented[i]!)) / 2;
        const segW = Math.abs(xPos(augmented[i]!) - xPos(augmented[i - 1]!));
        const gapFs = Math.min(8, Math.max(6, segWIndex * 0.38));
        const minCenterDist =
          segWIndex >= 14 ? 0 : segWIndex >= 10 ? 16 : 22;
        const mustShow = i === 1 || i === n - 1;
        if (!mustShow && minCenterDist > 0 && cx - lastCx < minCenterDist) continue;
        lastCx = cx;
        const deltaMs = augmented[i]!.tMs - augmented[i - 1]!.tMs;
        gapG
          .append('text')
          .attr('x', cx)
          .attr('y', lineH + 20)
          .attr('text-anchor', 'middle')
          .style('fill', 'var(--mc-text-muted)')
          .attr('font-size', gapFs)
          .text(formatReviewLogGapMs(deltaMs, locale));
      }
    }

    g.append('text')
      .attr('x', innerW / 2)
      .attr('y', lineH + (maxN > 16 ? 54 : 42))
      .attr('text-anchor', 'middle')
      .style('fill', 'var(--mc-text-muted)')
      .attr('font-size', 10)
      .text(useTimeX ? labels.axisTimeCaption : labels.axisReviewOrder);

    const axisS = d3.axisLeft(yS).ticks(4).tickFormat(d3.format('.2f'));
    g.append('g')
      .call(axisS)
      .call((sel) => {
        sel.selectAll('path,line').style('stroke', 'var(--mc-border-subtle)');
        sel.selectAll('text').style('fill', 'var(--mc-text-secondary)').attr('font-size', 10);
      });

    g.append('text')
      .attr('transform', 'rotate(-90)')
      .attr('y', -38)
      .attr('x', -lineH / 2)
      .attr('text-anchor', 'middle')
      .style('fill', 'var(--mc-text-muted)')
      .attr('font-size', 10)
      .text(labels.axisStability);

    const axisD = d3.axisRight(yD).ticks(4).tickFormat(d3.format('.2f'));
    g.append('g')
      .attr('transform', `translate(${innerW},0)`)
      .call(axisD)
      .call((sel) => {
        sel.selectAll('path,line').style('stroke', 'var(--mc-border-subtle)');
        sel.selectAll('text').style('fill', 'var(--mc-text-secondary)').attr('font-size', 10);
      });

    g.append('text')
      .attr('transform', 'rotate(-90)')
      .attr('y', innerW + 38)
      .attr('x', -lineH / 2)
      .attr('text-anchor', 'middle')
      .style('fill', 'var(--mc-text-muted)')
      .attr('font-size', 10)
      .text(labels.axisDifficulty);

    const sData = augmented.map((a) => ({
      index: a.index,
      y:
        a.log.stability_after != null && Number.isFinite(a.log.stability_after)
          ? a.log.stability_after
          : null,
    }));
    if (sData.some((d) => d.y != null)) {
      const lineS = d3
        .line<{ index: number; y: number | null }>()
        .defined((d) => d.y != null)
        .x((d) => xPos(augmented[d.index]!))
        .y((d) => yS(d.y as number))
        .curve(d3.curveMonotoneX);
      g.append('path')
        .datum(sData)
        .attr('fill', 'none')
        .style('stroke', COLOR_S_LINE)
        .attr('stroke-width', 2)
        .attr('d', lineS);
    }

    const dData = augmented.map((a) => ({
      index: a.index,
      y:
        a.log.difficulty_after != null && Number.isFinite(a.log.difficulty_after)
          ? a.log.difficulty_after
          : null,
    }));
    if (dData.some((d) => d.y != null)) {
      const lineD = d3
        .line<{ index: number; y: number | null }>()
        .defined((d) => d.y != null)
        .x((d) => xPos(augmented[d.index]!))
        .y((d) => yD(d.y as number))
        .curve(d3.curveMonotoneX);
      g.append('path')
        .datum(dData)
        .attr('fill', 'none')
        .style('stroke', COLOR_D_LINE)
        .attr('stroke-width', 2)
        .attr('stroke-dasharray', '5 3')
        .attr('d', lineD);
    }

    const hitLayer = g.append('g');

    const pointLayout = augmented.map((a) => {
      const cx = xPos(a);
      const s = a.log.stability_after;
      const d = a.log.difficulty_after;
      let cy: number;
      if (s != null && Number.isFinite(s)) cy = yS(s);
      else if (d != null && Number.isFinite(d)) cy = yD(d);
      else cy = lineH / 2;
      const rb = a.log.retrievability_before;
      const rTxt = rb != null && Number.isFinite(rb) ? `${(rb * 100).toFixed(0)}%` : '—';
      const sTxt = s != null && Number.isFinite(s) ? s.toFixed(2) : '—';
      const dTxt = d != null && Number.isFinite(d) ? d.toFixed(2) : '—';
      const deltaMs =
        a.index === 0 ? null : a.tMs - augmented[a.index - 1]!.tMs;
      const text = [
        formatEventTime(a.log.review_time, locale),
        formatLogGap(deltaMs),
        ratingLabel(a.log.rating),
        `${labels.axisStability}: ${sTxt}`,
        `${labels.axisDifficulty}: ${dTxt}`,
        `${labels.axisRetrievability}: ${rTxt}`,
      ].join('\n');
      return { a, cx, cy, text };
    });

    pointLayout.forEach(({ cx, cy, text }) => {
      hitLayer
        .append('circle')
        .attr('cx', cx)
        .attr('cy', cy)
        .attr('r', 12)
        .attr('fill', 'transparent')
        .style('cursor', 'pointer')
        .on('mouseenter', (ev: MouseEvent) => {
          const rect = wrapRef.current?.getBoundingClientRect();
          if (!rect) return;
          setTip({ x: ev.clientX - rect.left, y: ev.clientY - rect.top, text });
        })
        .on('mousemove', (ev: MouseEvent) => {
          const rect = wrapRef.current?.getBoundingClientRect();
          if (!rect) return;
          setTip({ x: ev.clientX - rect.left, y: ev.clientY - rect.top, text });
        })
        .on('mouseleave', () => setTip(null));
    });

    if (ratingMarkerMode !== 'hidden') {
      const visLayer = g
        .append('g')
        .attr('class', 'chart-rating-markers')
        .style('pointer-events', 'none')
        .attr('opacity', ratingMarkerMode === 'faded' ? RATING_MARKER_FADE_OPACITY : 1);
      pointLayout.forEach(({ a, cx, cy }) => {
        const isLast = a.index === augmented.length - 1;
        const fill = ratingFillCss(a.log.rating);
        if (a.log.rating === 1) {
          const arm = isLast ? RATING_AGAIN_CROSS_ARM : RATING_AGAIN_CROSS_ARM_INNER;
          const crossG = visLayer.append('g').attr('transform', `translate(${cx},${cy})`);
          const d = `M ${-arm},${-arm} L ${arm},${arm} M ${-arm},${arm} L ${arm},${-arm}`;
          if (isLast) {
            crossG
              .append('path')
              .attr('d', d)
              .attr('fill', 'none')
              .style('stroke', 'var(--mc-bg-surface)')
              .attr('stroke-width', 3)
              .attr('stroke-linecap', 'round')
              .style('pointer-events', 'none');
            crossG
              .append('path')
              .attr('d', d)
              .attr('fill', 'none')
              .style('stroke', fill)
              .attr('stroke-width', 1.75)
              .attr('stroke-linecap', 'round')
              .style('pointer-events', 'none');
          } else {
            crossG
              .append('path')
              .attr('d', d)
              .attr('fill', 'none')
              .style('stroke', fill)
              .attr('stroke-width', 1.2)
              .attr('stroke-linecap', 'round')
              .style('pointer-events', 'none');
          }
        } else {
          const r = isLast ? RATING_MARKER_R_LAST : RATING_MARKER_R_INNER;
          const dot = visLayer
            .append('circle')
            .attr('cx', cx)
            .attr('cy', cy)
            .attr('r', r)
            .style('fill', fill)
            .style('pointer-events', 'none');
          if (isLast) {
            dot.style('stroke', 'var(--mc-bg-surface)').attr('stroke-width', 1.5);
          } else {
            dot.attr('stroke', 'none');
          }
        }
      });
    }

    return () => setTip(null);
  }, [
    augmented,
    linkedAugmented,
    maxN,
    chartTotalWidth,
    formatLogGap,
    locale,
    labels,
    plotInnerW,
    ratingLabel,
    xAxisByTime,
    ratingMarkerMode,
    tMin,
    tMax,
    spanT,
    padT,
  ]);

  const srLines = useMemo(() => {
    return augmented.map((a, i) => {
      const rb = a.log.retrievability_before;
      const rTxt = rb != null && Number.isFinite(rb) ? `${(rb * 100).toFixed(0)}%` : '—';
      const deltaMs = i === 0 ? null : a.tMs - augmented[i - 1]!.tMs;
      return `${formatEventTime(a.log.review_time, locale)} · ${formatLogGap(deltaMs)} · ${ratingLabel(a.log.rating)} · S ${a.log.stability_after != null ? a.log.stability_after.toFixed(2) : '—'} · D ${a.log.difficulty_after != null ? a.log.difficulty_after.toFixed(2) : '—'} · R ${rTxt}`;
    });
  }, [augmented, formatLogGap, locale, ratingLabel]);

  if (logs.length === 0) return null;

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
          {canCompareLinked && (
            <select
              className={chartToolbarSelectClassName}
              value={compareLinked ? 'on' : 'off'}
              aria-label={labels.chartCompareLinkedGroup}
              onChange={(e) => onCompareLinkedChange?.(e.target.value === 'on')}
            >
              <option value="off">{labels.chartCompareLinkedOff}</option>
              <option value="on">{labels.chartCompareLinkedOn}</option>
            </select>
          )}
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
            value={ratingMarkerMode}
            aria-label={labels.ratingMarkersModeGroup}
            onChange={(e) => setRatingMarkerMode(e.target.value as RatingMarkerMode)}
          >
            <option value="visible">{labels.ratingMarkersSolid}</option>
            <option value="faded">{labels.ratingMarkersFaded}</option>
            <option value="hidden">{labels.ratingMarkersHidden}</option>
          </select>
        </div>
      </div>
      <div
        ref={scrollRef}
        className="w-full max-w-full overflow-x-auto overflow-y-hidden overscroll-x-contain"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        <div
          ref={wrapRef}
          className="relative"
          style={{ width: chartTotalWidth, minWidth: '100%' }}
        >
          <svg
            ref={svgRef}
            className="block max-w-none shrink-0"
            width={chartTotalWidth}
            height={CHART_HEIGHT}
            aria-hidden
          />
          {tip && (
            <div
              className="pointer-events-none absolute z-10 max-w-[min(100%,280px)] rounded-md border border-(--mc-border-subtle) bg-(--mc-bg-surface) px-2 py-1.5 text-[11px] text-(--mc-text-primary) shadow-lg whitespace-pre-line"
              style={{
                left: Math.min(chartTotalWidth - 200, Math.max(8, tip.x + 12)),
                top: Math.min(CHART_HEIGHT - 80, Math.max(8, tip.y + 12)),
              }}
            >
              {tip.text}
            </div>
          )}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-x-5 gap-y-1 px-1 text-center text-[11px] text-(--mc-text-muted)">
        <span className="text-(--mc-accent-primary)">{labels.axisRetrievability}</span>
        <span className="text-(--mc-accent-success)">— {labels.axisStability}</span>
        <span className="text-(--mc-accent-primary)">— {labels.axisDifficulty}</span>
      </div>
      <p className="sr-only">{labels.srCaption}</p>
      <ul className="sr-only">
        {srLines.map((line, i) => (
          <li key={augmented[i]?.log.id ?? i}>{line}</li>
        ))}
      </ul>
    </section>
  );
}
