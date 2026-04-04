import type { Card } from '@/types';
import {
  CARD_STATS_R_HIGH_MIN,
  CARD_STATS_R_MEDIUM_MIN,
} from './cardStatsConstants';

export type CardFollowUpEstimationKind = 'high' | 'medium' | 'low' | 'unknown';

/** Start of local calendar day in ms. */
function startOfLocalDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Signed difference in whole local calendar days (b − a). */
export function localCalendarDayDiff(aMs: number, bMs: number): number {
  const a = startOfLocalDay(new Date(aMs));
  const b = startOfLocalDay(new Date(bMs));
  return Math.round((b - a) / 86_400_000);
}

/**
 * Retrievability estimate (same decay as card detail page) when stability and last review exist.
 */
export function estimateRetrievability(card: Card, nowMs: number): number | null {
  if (!card.last_review) return null;
  const s = card.stability;
  if (s == null || !Number.isFinite(Number(s)) || Number(s) <= 0) return null;
  const lastMs = new Date(card.last_review).getTime();
  if (!Number.isFinite(lastMs)) return null;
  const elapsedDays = (nowMs - lastMs) / (24 * 60 * 60 * 1000);
  const stability = Number(s);
  return 1 / Math.pow(1 + (0.4 * elapsedDays) / stability, 1);
}

export function getCardFollowUpEstimationKind(card: Card, nowMs: number): CardFollowUpEstimationKind {
  const r = estimateRetrievability(card, nowMs);
  if (r == null) return 'unknown';
  if (r >= CARD_STATS_R_HIGH_MIN) return 'high';
  if (r >= CARD_STATS_R_MEDIUM_MIN) return 'medium';
  return 'low';
}

/** Neutral calendar-day comparison: next review vs “today” in local time. */
export type NextReviewTone = 'past' | 'today' | 'tomorrow' | 'future';

export function getNextReviewCalendarTone(nextReviewIso: string, nowMs: number): NextReviewTone {
  const ns = startOfLocalDay(new Date(nextReviewIso));
  const ts = startOfLocalDay(new Date(nowMs));
  if (ns < ts) return 'past';
  if (ns === ts) return 'today';
  const days = Math.round((ns - ts) / 86_400_000);
  if (days === 1) return 'tomorrow';
  return 'future';
}

export function calendarDaysFromTodayToNextReview(nextReviewIso: string, nowMs: number): number {
  const nextStart = startOfLocalDay(new Date(nextReviewIso));
  const todayStart = startOfLocalDay(new Date(nowMs));
  return Math.max(0, Math.round((nextStart - todayStart) / 86_400_000));
}

export type LastReviewTone = 'today' | 'yesterday' | 'older';

export function getLastReviewCalendarTone(lastReviewIso: string, nowMs: number): LastReviewTone {
  const ls = startOfLocalDay(new Date(lastReviewIso));
  const ts = startOfLocalDay(new Date(nowMs));
  if (ls === ts) return 'today';
  if (ls === ts - 86_400_000) return 'yesterday';
  return 'older';
}

export function calendarDaysSinceLastReview(lastReviewIso: string, nowMs: number): number {
  const lastStart = startOfLocalDay(new Date(lastReviewIso));
  const todayStart = startOfLocalDay(new Date(nowMs));
  return Math.max(0, Math.round((todayStart - lastStart) / 86_400_000));
}
