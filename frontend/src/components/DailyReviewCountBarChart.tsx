'use client';

import { useMemo } from 'react';

export type DailyReviewCountRow = { metricDate: string; reviewCount: number };

type Props = {
  rows: DailyReviewCountRow[];
  locale: string;
  title: string;
  footnote?: string;
  /** When false, omit outer card border (e.g. inside another panel). */
  bordered?: boolean;
  /**
   * Number of calendar days ending today (inclusive). Defaults to span of row dates or 90.
   */
  windowDays?: number;
  /** Legend labels (e.g. from `ta('reviewCalendarLess')`). */
  legendLess: string;
  legendMore: string;
};

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addLocalDays(d: Date, n: number): Date {
  const x = new Date(d.getTime());
  x.setDate(x.getDate() + n);
  return x;
}

/** Monday 00:00 local of the week containing `d`. */
function startOfWeekMonday(d: Date): Date {
  const x = startOfLocalDay(d);
  const dow = x.getDay();
  const offset = dow === 0 ? -6 : 1 - dow;
  x.setDate(x.getDate() + offset);
  return x;
}

function toDayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

type Cell = { date: Date; count: number; inRange: boolean };

function buildContributionWeeks(
  countByDay: Map<string, number>,
  rangeStart: Date,
  rangeEnd: Date
): Cell[][] {
  const rs = startOfLocalDay(rangeStart);
  const re = startOfLocalDay(rangeEnd);
  const gridStart = startOfWeekMonday(rs);
  const lastWeekMonday = startOfWeekMonday(re);
  const weeks: Cell[][] = [];
  for (let mon = new Date(gridStart.getTime()); mon <= lastWeekMonday; mon = addLocalDays(mon, 7)) {
    const col: Cell[] = [];
    for (let i = 0; i < 7; i++) {
      const date = addLocalDays(mon, i);
      const inRange = date >= rs && date <= re;
      const key = toDayKey(date);
      const count = inRange ? countByDay.get(key) ?? 0 : 0;
      col.push({ date, count, inRange });
    }
    weeks.push(col);
  }
  return weeks;
}

/** Map count to 0–4 intensity (GitHub-style); 0 = no activity in range. */
function intensityLevel(count: number, maxPositive: number): 0 | 1 | 2 | 3 | 4 {
  if (count <= 0) return 0;
  if (maxPositive <= 0) return 1;
  const t = count / maxPositive;
  if (t <= 0.25) return 1;
  if (t <= 0.5) return 2;
  if (t <= 0.75) return 3;
  return 4;
}

const LEVEL_CLASS: Record<number, string> = {
  0: 'bg-(--mc-border-subtle)',
  1: 'bg-(--mc-accent-success)/25',
  2: 'bg-(--mc-accent-success)/45',
  3: 'bg-(--mc-accent-success)/70',
  4: 'bg-(--mc-accent-success)',
};

/**
 * GitHub-style contribution calendar: weeks as columns, Mon–Sun as rows.
 */
export function DailyReviewCountBarChart({
  rows,
  locale,
  title,
  footnote,
  bordered = true,
  windowDays: windowDaysProp,
  legendLess,
  legendMore,
}: Props) {
  const weekdayLabels = useMemo(() => {
    const mon = startOfWeekMonday(new Date(2024, 0, 1));
    return Array.from({ length: 7 }, (_, i) =>
      addLocalDays(mon, i).toLocaleDateString(locale, { weekday: 'short' })
    );
  }, [locale]);

  const { weeks, maxInRange, rangeStart, rangeEnd } = useMemo(() => {
    const countByDay = new Map<string, number>();
    for (const r of rows) {
      countByDay.set(r.metricDate, r.reviewCount);
    }

    const today = startOfLocalDay(new Date());
    let wd: number;
    if (windowDaysProp != null && windowDaysProp > 0) {
      wd = Math.min(366, Math.max(1, windowDaysProp));
    } else if (rows.length > 0) {
      const dates = rows.map((r) => new Date(r.metricDate + 'T12:00:00'));
      const minT = Math.min(...dates.map((d) => d.getTime()));
      const maxT = Math.max(...dates.map((d) => d.getTime()));
      wd = Math.max(1, Math.ceil((maxT - minT) / 86_400_000) + 1);
    } else {
      wd = 90;
    }

    const rangeEnd = today;
    const rangeStart = addLocalDays(today, -(wd - 1));
    const w = buildContributionWeeks(countByDay, rangeStart, rangeEnd);
    let maxInRange = 0;
    for (const col of w) {
      for (const c of col) {
        if (c.inRange && c.count > maxInRange) maxInRange = c.count;
      }
    }
    return { weeks: w, maxInRange, rangeStart, rangeEnd };
  }, [rows, windowDaysProp]);

  if (weeks.length === 0) return null;

  const body = (
    <>
      <h2 className="text-sm font-semibold text-(--mc-text-primary)">{title}</h2>

      <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
        <div className="flex shrink-0 flex-col justify-between pt-5 pb-6 text-[10px] leading-none text-(--mc-text-muted)">
          {weekdayLabels.map((label, i) => (
            <span key={i} className="h-3.5 leading-3.5">
              {label}
            </span>
          ))}
        </div>
        <div className="flex min-w-0 gap-0.5 pt-5">
          {weeks.map((column, wi) => (
            <div key={wi} className="flex flex-col gap-0.5">
              {column.map((cell, di) => {
                const level = cell.inRange ? intensityLevel(cell.count, maxInRange) : 0;
                const cls = cell.inRange ? LEVEL_CLASS[level] ?? LEVEL_CLASS[0] : 'bg-transparent';
                const dateLabel = cell.date.toLocaleDateString(locale, {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                });
                const titleText = cell.inRange ? `${dateLabel}: ${cell.count}` : '';
                return (
                  <div
                    key={`${wi}-${di}`}
                    className={`h-3.5 w-3.5 shrink-0 rounded-sm border border-(--mc-border-subtle)/40 ${cls}`}
                    title={titleText}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-(--mc-text-muted)">
        <span className="tabular-nums">
          {rangeStart.toLocaleDateString(locale, { month: 'short', day: 'numeric' })}
          {' — '}
          {rangeEnd.toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' })}
        </span>
        <div className="flex items-center gap-1.5">
          <span>{legendLess}</span>
          <div className="flex gap-0.5">
            {[0, 1, 2, 3, 4].map((lv) => (
              <div
                key={lv}
                className={`h-3.5 w-3.5 rounded-sm border border-(--mc-border-subtle)/40 ${LEVEL_CLASS[lv]}`}
                aria-hidden
              />
            ))}
          </div>
          <span>{legendMore}</span>
        </div>
      </div>

      {footnote ? <p className="mt-2 text-xs text-(--mc-text-secondary)">{footnote}</p> : null}
    </>
  );

  if (bordered) {
    return (
      <div className="rounded-lg border border-(--mc-border-subtle) bg-(--mc-bg-surface) p-4">
        {body}
      </div>
    );
  }

  return <div className="mt-4 border-t border-(--mc-border-subtle) pt-4">{body}</div>;
}
