import type { ReviewWithLogId } from '@/services/review.service';

/**
 * Whether the client should offer the card again in the current study session after a rating correction.
 * Mirrors study queue intent: due now, or a short FSRS step (interval under one day) including min-interval scheduling.
 */
export function shouldIncludeCardForSessionRepeat(result: ReviewWithLogId): boolean {
  const next = new Date(result.state.nextReview as Date | string);
  if (Number.isNaN(next.getTime())) return false;
  if (next.getTime() <= Date.now()) return true;
  return Number.isFinite(result.interval) && result.interval < 1;
}
