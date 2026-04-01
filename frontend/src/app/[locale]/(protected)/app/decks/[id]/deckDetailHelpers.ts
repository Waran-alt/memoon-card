import type { Card } from '@/types';

export const LAST_STUDIED_KEY = (deckId: string) => `memoon_last_studied_${deckId}`;

export function formatCardDate(isoDate: string, locale: string): string {
  return new Date(isoDate).toLocaleDateString(locale, { dateStyle: 'short' });
}

/** Next/Last review: show time if same calendar day as now, otherwise show date. */
export function formatCardDateOrTime(isoDate: string, locale: string, nowMs: number = Date.now()): string {
  const d = new Date(isoDate);
  const now = new Date(nowMs);
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString(locale, { dateStyle: 'short' });
}

/** Format a numeric card field (stability, difficulty); show — when null/undefined/NaN. */
export function formatCardNumber(value: unknown): string {
  const n = Number(value);
  if (value == null || !Number.isFinite(n)) return '—';
  return n.toFixed(2);
}

/**
 * Format event/review timestamp for display. Accepts ms or seconds (if < 1e12).
 * Handles string from API (pg bigint) and invalid values.
 */
export function formatEventTime(ts: unknown, locale: string): string {
  const n = Number(ts);
  if (!Number.isFinite(n)) return '—';
  const ms = n < 1e12 ? n * 1000 : n;
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(locale);
}

/** Normalize event_time to milliseconds for timeline positioning. */
export function eventTimeToMs(ts: unknown): number | null {
  const n = Number(ts);
  if (!Number.isFinite(n)) return null;
  return n < 1e12 ? n * 1000 : n;
}

const TIMING_GRAPH_EVENT_COLORS: Record<string, string> = {
  card_shown: 'var(--mc-accent-primary)',
  answer_revealed: 'var(--mc-accent-warning)',
  rating_submitted: 'var(--mc-accent-success)',
  card_created: 'var(--mc-text-muted)',
};

export function getTimingEventColor(eventType: string): string {
  return TIMING_GRAPH_EVENT_COLORS[eventType] ?? 'var(--mc-accent-primary)';
}

export function cardMatchesSearch(card: Card, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    card.recto.toLowerCase().includes(q) ||
    card.verso.toLowerCase().includes(q) ||
    (card.comment?.toLowerCase().includes(q) ?? false)
  );
}

/** Plain-text preview of card front for link lists. */
export function previewCardRecto(html: string, maxLen = 52): string {
  const t = html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  if (t.length <= maxLen) return t || '—';
  return `${t.slice(0, maxLen)}…`;
}

/** Single-line recto + verso for native `<option>` labels. */
export function previewCardRectoVerso(recto: string, verso: string, maxEach = 44): string {
  const front = previewCardRecto(recto, maxEach);
  const back = previewCardRecto(verso, maxEach);
  return `${front} · ${back}`;
}
