'use client';

import * as d3 from 'd3';
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { eventTimeToMs, formatEventTime, previewCardRecto } from './deckDetailHelpers';
import type { CardReviewLogPoint } from './CardReviewHistoryChart';

const M = { top: 14, right: 20, bottom: 54, left: 46 };
const CHART_MIN_WIDTH = 320;
const CHART_HEIGHT = 300;
const R_BAND = 36;

type Metric = 'stability' | 'difficulty';

export type DeckMultiCardOverlayChartLabels = {
  chartTitle: string;
  axisStability: string;
  axisDifficulty: string;
  axisTimeCaption: string;
  metricStability: string;
  metricDifficulty: string;
  hoverHint: string;
  emptyMetric: string;
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
};

function cardColor(i: number, n: number): string {
  if (n <= 0) return 'var(--mc-accent-success)';
  const h = (i * 360) / Math.max(n, 1);
  return `hsl(${h} 58% 42%)`;
}

export function DeckMultiCardOverlayChart({ cards, locale, labels }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [viewportWidth, setViewportWidth] = useState(CHART_MIN_WIDTH);
  const [metric, setMetric] = useState<Metric>('stability');
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null);
  const titleId = useId();

  const seriesList = useMemo((): CardSeries[] => {
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

  const allT = useMemo(() => seriesList.flatMap((s) => s.points.map((p) => p.tMs)), [seriesList]);
  const tMin = allT.length ? d3.min(allT)! : Date.now();
  const tMax = allT.length ? d3.max(allT)! : Date.now();
  const spanT = Math.max(tMax - tMin, 60_000);
  const padT = Math.max(spanT * 0.04, 3_600_000);

  const innerW = Math.max(0, viewportWidth - M.left - M.right);
  const lineH = CHART_HEIGHT - M.top - M.bottom - R_BAND;

  const yExtent = useMemo(() => {
    const vals = seriesList.flatMap((s) => s.points.map((p) => p.y));
    if (vals.length === 0) return { min: 0, max: 1 };
    if (metric === 'stability') {
      const maxS = Math.max(0.5, d3.max(vals) ?? 1);
      return { min: 0, max: maxS * 1.12 };
    }
    const dMin = Math.min(0, d3.min(vals) ?? 0);
    const dMax = Math.max(10, d3.max(vals) ?? 10);
    const dSpan = dMax - dMin;
    return { min: dMin, max: dMax + Math.max(dSpan * 0.08, 0.01) };
  }, [seriesList, metric]);

  const chartTotalWidth = M.left + innerW + M.right;

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
    el.scrollLeft = Math.max(0, el.scrollWidth - el.clientWidth);
  }, [chartTotalWidth, seriesList.length, metric]);

  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl || seriesList.length === 0 || innerW <= 0) return;

    const xTime = d3
      .scaleTime()
      .domain([new Date(tMin - padT), new Date(tMax + padT)])
      .range([0, innerW]);

    const y = d3
      .scaleLinear()
      .domain([yExtent.min, yExtent.max])
      .range([lineH, 0]);

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

    const lineGen = d3
      .line<{ tMs: number; y: number }>()
      .x((d) => xTime(new Date(d.tMs)))
      .y((d) => y(d.y))
      .curve(d3.curveMonotoneX);

    for (const s of seriesList) {
      if (s.points.length === 1) {
        g.append('circle')
          .attr('cx', xTime(new Date(s.points[0]!.tMs)))
          .attr('cy', y(s.points[0]!.y))
          .attr('r', 3)
          .attr('fill', s.color)
          .style('pointer-events', 'none');
        continue;
      }
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

    const xAxisG = g.append('g').attr('transform', `translate(0,${lineH})`);
    const xAxis = d3
      .axisBottom(xTime)
      .ticks(Math.min(8, Math.max(3, Math.floor(innerW / 72))))
      .tickFormat((d) => tickFormatTime(d as Date));
    xAxisG.call(xAxis);
    xAxisG.call((sel) => {
      sel.select('.domain').remove();
      sel.selectAll('.tick line').style('stroke', 'var(--mc-border-subtle)');
      sel.selectAll('text').style('fill', 'var(--mc-text-secondary)').attr('font-size', 10);
    });

    g.append('text')
      .attr('x', innerW / 2)
      .attr('y', lineH + 28)
      .attr('text-anchor', 'middle')
      .style('fill', 'var(--mc-text-muted)')
      .attr('font-size', 10)
      .text(labels.axisTimeCaption);

    const axisY = d3.axisLeft(y).ticks(5).tickFormat(d3.format('.2f'));
    g.append('g')
      .call(axisY)
      .call((sel) => {
        sel.selectAll('path,line').style('stroke', 'var(--mc-border-subtle)');
        sel.selectAll('text').style('fill', 'var(--mc-text-secondary)').attr('font-size', 10);
      });

    const yLabel =
      metric === 'stability' ? labels.axisStability : labels.axisDifficulty;
    g.append('text')
      .attr('transform', 'rotate(-90)')
      .attr('y', -34)
      .attr('x', -lineH / 2)
      .attr('text-anchor', 'middle')
      .style('fill', 'var(--mc-text-muted)')
      .attr('font-size', 10)
      .text(yLabel);

    /** Invisible overlay for nearest-point tooltip */
    const flatPoints = seriesList.flatMap((s) =>
      s.points.map((p) => ({
        px: xTime(new Date(p.tMs)),
        py: y(p.y),
        cardId: s.cardId,
        recto: s.recto,
        log: p.log,
        color: s.color,
      }))
    );

    g.append('rect')
      .attr('x', 0)
      .attr('y', 0)
      .attr('width', innerW)
      .attr('height', lineH)
      .attr('fill', 'transparent')
      .style('cursor', 'crosshair')
      .on('mousemove', function (ev: MouseEvent) {
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
          `${yLabel}: ${valTxt}`,
        ].join('\n');
        setTip({ x: ev.clientX - rect.left, y: ev.clientY - rect.top, text });
      })
      .on('mouseleave', () => setTip(null));

    return () => setTip(null);
  }, [
    seriesList,
    chartTotalWidth,
    innerW,
    lineH,
    locale,
    labels.axisStability,
    labels.axisDifficulty,
    labels.axisTimeCaption,
    metric,
    padT,
    spanT,
    tMax,
    tMin,
    yExtent.max,
    yExtent.min,
  ]);

  if (cards.length === 0) return null;

  return (
    <section
      className="rounded-lg border border-(--mc-border-subtle) bg-(--mc-bg-page) p-3"
      aria-labelledby={titleId}
    >
      <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
        <h4 id={titleId} className="text-sm font-medium text-(--mc-text-primary)">
          {labels.chartTitle}
        </h4>
        <div className="flex shrink-0 gap-1 rounded-md border border-(--mc-border-subtle) bg-(--mc-bg-surface) p-0.5">
          <button
            type="button"
            className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
              metric === 'stability'
                ? 'bg-(--mc-bg-card-back) text-(--mc-text-primary)'
                : 'text-(--mc-text-secondary) hover:text-(--mc-text-primary)'
            }`}
            aria-pressed={metric === 'stability'}
            onClick={() => setMetric('stability')}
          >
            {labels.metricStability}
          </button>
          <button
            type="button"
            className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
              metric === 'difficulty'
                ? 'bg-(--mc-bg-card-back) text-(--mc-text-primary)'
                : 'text-(--mc-text-secondary) hover:text-(--mc-text-primary)'
            }`}
            aria-pressed={metric === 'difficulty'}
            onClick={() => setMetric('difficulty')}
          >
            {labels.metricDifficulty}
          </button>
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
