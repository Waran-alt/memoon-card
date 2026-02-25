/**
 * Short-term (learning) optimizer service.
 * Learning parameters are not user-editable; this service runs when the user
 * clicks the Short-term optimizer button (same style as FSRS optimizer).
 * Fits short-FSRS params from learning-phase review logs and persists to user_settings.
 */

import { pool } from '../config/database';
import { UserSettings } from '../types/database';
import { SHORT_TERM_OPTIMIZER_CONFIG } from '../constants/optimization.constants';
import {
  getInitialShortStabilityMinutes,
  updateShortStability,
  type ShortFSParams,
  type Rating,
} from './short-fsrs.service';

const TARGET_RETENTION = 0.85;
const LN_TARGET = -Math.log(TARGET_RETENTION); // -ln(0.85)

/** review_state: 0=New, 1=Learning, 2=Review, 3=Relearning — we count 0,1,3 as learning-phase for short-FSRS. */
const LEARNING_REVIEW_STATES = [0, 1, 3];

export type ShortTermEligibilityStatus = 'NOT_READY' | 'OPTIMIZED' | 'READY_TO_UPGRADE';

export interface ShortTermEligibility {
  status: ShortTermEligibilityStatus;
  learningReviewCount: number;
  newLearningReviewsSinceLast: number;
  daysSinceLast: number;
  minRequiredFirst: number;
  minRequiredSubsequent: number;
  minDaysSinceLast: number;
  lastOptimizedAt: string | null;
}

async function getLearningReviewCount(userId: string): Promise<number> {
  const result = await pool.query<{ count: string }>(
    `SELECT COUNT(*) as count FROM review_logs
     WHERE user_id = $1 AND review_state = ANY($2::int[])`,
    [userId, LEARNING_REVIEW_STATES]
  );
  return parseInt(result.rows[0]?.count ?? '0', 10);
}

async function getLearningReviewsSince(userId: string, since: Date): Promise<number> {
  const sinceMs = since.getTime();
  const result = await pool.query<{ count: string }>(
    `SELECT COUNT(*) as count FROM review_logs
     WHERE user_id = $1 AND review_state = ANY($2::int[]) AND review_time >= $3`,
    [userId, LEARNING_REVIEW_STATES, sinceMs]
  );
  return parseInt(result.rows[0]?.count ?? '0', 10);
}

async function getUserSettings(userId: string): Promise<UserSettings> {
  const result = await pool.query<UserSettings>(
    'SELECT * FROM user_settings WHERE user_id = $1',
    [userId]
  );
  if (result.rows.length === 0) {
    return {
      user_id: userId,
      fsrs_weights: [],
      target_retention: 0.9,
      last_optimized_at: null,
      review_count_since_optimization: 0,
      updated_at: new Date(),
      learning_last_optimized_at: null,
    } as UserSettings;
  }
  return result.rows[0];
}

/**
 * Eligibility for short-term optimization: based on learning-phase review counts.
 */
export async function getShortTermEligibility(userId: string): Promise<ShortTermEligibility> {
  const settings = await getUserSettings(userId);
  const lastAt = settings.learning_last_optimized_at ?? null;

  let learningReviewCount: number;
  let newLearningReviewsSinceLast: number;

  if (!lastAt) {
    learningReviewCount = await getLearningReviewCount(userId);
    newLearningReviewsSinceLast = learningReviewCount;
  } else {
    const [total, since] = await Promise.all([
      getLearningReviewCount(userId),
      getLearningReviewsSince(userId, lastAt),
    ]);
    learningReviewCount = total;
    newLearningReviewsSinceLast = since;
  }

  const daysSinceLast = lastAt
    ? (Date.now() - new Date(lastAt).getTime()) / SHORT_TERM_OPTIMIZER_CONFIG.MS_PER_DAY
    : 0;

  const minFirst = SHORT_TERM_OPTIMIZER_CONFIG.MIN_LEARNING_REVIEWS_FIRST;
  const minSubsequent = SHORT_TERM_OPTIMIZER_CONFIG.MIN_LEARNING_REVIEWS_SUBSEQUENT;
  const minDays = SHORT_TERM_OPTIMIZER_CONFIG.MIN_DAYS_SINCE_LAST_LEARNING_OPT;

  let status: ShortTermEligibilityStatus;
  if (learningReviewCount < minFirst) {
    status = 'NOT_READY';
  } else if (!lastAt) {
    status = 'READY_TO_UPGRADE';
  } else if (newLearningReviewsSinceLast < minSubsequent && daysSinceLast < minDays) {
    status = 'OPTIMIZED';
  } else {
    status = 'READY_TO_UPGRADE';
  }

  return {
    status,
    learningReviewCount,
    newLearningReviewsSinceLast,
    daysSinceLast,
    minRequiredFirst: minFirst,
    minRequiredSubsequent: minSubsequent,
    minDaysSinceLast: minDays,
    lastOptimizedAt: lastAt ? new Date(lastAt).toISOString() : null,
  };
}

/**
 * Whether the user can run short-term optimization (same style as FSRS canOptimize).
 */
export async function canOptimizeShortTerm(userId: string): Promise<{
  canOptimize: boolean;
  learningReviewCount: number;
  minRequired: number;
}> {
  const eligibility = await getShortTermEligibility(userId);
  const minRequired =
    eligibility.status === 'NOT_READY'
      ? eligibility.minRequiredFirst
      : eligibility.minRequiredSubsequent;
  return {
    canOptimize: eligibility.status === 'READY_TO_UPGRADE',
    learningReviewCount: eligibility.learningReviewCount,
    minRequired,
  };
}

interface LearningLogRow {
  card_id: string;
  review_time: number;
  rating: number;
  review_state: number;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/**
 * Fit short-FSRS params from learning-phase logs: initial S by rating, Again reset, growth by rating.
 */
function fitShortFsrsParams(rows: LearningLogRow[]): ShortFSParams {
  const byCard = new Map<string, LearningLogRow[]>();
  for (const r of rows) {
    const list = byCard.get(r.card_id) ?? [];
    list.push(r);
    byCard.set(r.card_id, list);
  }
  for (const list of byCard.values()) {
    list.sort((a, b) => a.review_time - b.review_time);
  }

  const initialIntervalsByRating: Record<number, number[]> = { 1: [], 2: [], 3: [], 4: [] };
  const againIntervals: number[] = [];
  const growthByRating: Record<number, number[]> = { 2: [], 3: [], 4: [] };

  for (const list of byCard.values()) {
    let sShort = 0;
    let prevTime = 0;
    for (let i = 0; i < list.length; i++) {
      const row = list[i]!;
      const rating = row.rating as Rating;
      const reviewTimeMs = Number(row.review_time);
      const elapsedMinutes = i === 0 ? 0 : (reviewTimeMs - prevTime) / (60 * 1000);
      const nextRow = list[i + 1];
      const actualIntervalMinutes =
        nextRow == null ? null : (Number(nextRow.review_time) - reviewTimeMs) / (60 * 1000);

      if (i === 0) {
        sShort = getInitialShortStabilityMinutes(rating, null);
        if (actualIntervalMinutes != null && actualIntervalMinutes >= 0.1) {
          if (rating === 1) againIntervals.push(actualIntervalMinutes);
          else initialIntervalsByRating[rating]!.push(actualIntervalMinutes);
        }
        sShort = updateShortStability(sShort, 0, rating, null);
      } else {
        if (rating === 1 && actualIntervalMinutes != null && actualIntervalMinutes >= 0.1) {
          againIntervals.push(actualIntervalMinutes);
        } else if (
          (rating === 2 || rating === 3 || rating === 4) &&
          actualIntervalMinutes != null &&
          actualIntervalMinutes >= 0.1
        ) {
          const elapsedFactor = Math.log(1 + Math.max(0, elapsedMinutes) / 60) * 0.5 + 1;
          const sAfter = actualIntervalMinutes / LN_TARGET;
          const growth = sAfter / (sShort * Math.min(2, elapsedFactor));
          growthByRating[rating]!.push(growth);
        }
        sShort = updateShortStability(sShort, Math.max(0, elapsedMinutes), rating, null);
      }
      prevTime = reviewTimeMs;
    }
  }

  const initialSShortByRating: Record<string, number> = {};
  for (const r of [1, 2, 3, 4] as Rating[]) {
    const vals = initialIntervalsByRating[r];
    if (vals && vals.length > 0) {
      const sShort = median(vals) / LN_TARGET;
      initialSShortByRating[String(r)] = Math.max(1, Math.min(120, sShort));
    }
  }
  const sShortAfterAgain =
    againIntervals.length > 0
      ? Math.max(1, Math.min(30, median(againIntervals) / LN_TARGET))
      : undefined;
  const growthByRatingOut: Record<string, number> = {};
  for (const r of [2, 3, 4] as Rating[]) {
    const vals = growthByRating[r];
    if (vals && vals.length > 0) {
      const g = median(vals);
      growthByRatingOut[String(r)] = Math.max(1, Math.min(2.5, g));
    }
  }

  return {
    ...(Object.keys(initialSShortByRating).length ? { initialSShortByRating } : {}),
    ...(sShortAfterAgain != null ? { sShortAfterAgain } : {}),
    ...(Object.keys(growthByRatingOut).length ? { growthByRating: growthByRatingOut } : {}),
  };
}

async function fetchLearningLogs(userId: string): Promise<LearningLogRow[]> {
  const result = await pool.query<{ card_id: string; review_time: string; rating: number; review_state: number }>(
    `SELECT card_id, review_time, rating, review_state
     FROM review_logs
     WHERE user_id = $1 AND review_state = ANY($2::int[])
     ORDER BY card_id, review_time`,
    [userId, LEARNING_REVIEW_STATES]
  );
  return result.rows.map((r) => ({
    card_id: r.card_id,
    review_time: Number(r.review_time),
    rating: r.rating,
    review_state: r.review_state,
  }));
}

/**
 * Run short-term optimization: fit short-FSRS params from learning-phase logs and persist.
 */
export async function optimizeShortTerm(userId: string): Promise<{ success: boolean; message: string }> {
  const { canOptimize, learningReviewCount, minRequired } = await canOptimizeShortTerm(userId);
  if (!canOptimize) {
    return {
      success: false,
      message: `Not enough learning-phase reviews. Need ${minRequired}, have ${learningReviewCount}.`,
    };
  }

  const rows = await fetchLearningLogs(userId);
  const params = fitShortFsrsParams(rows);
  const now = new Date();
  const paramsJson = JSON.stringify(Object.keys(params).length > 0 ? params : null);

  await pool.query(
    `UPDATE user_settings
     SET learning_short_fsrs_params = $2::jsonb, learning_last_optimized_at = $3, updated_at = $3
     WHERE user_id = $1`,
    [userId, paramsJson, now]
  );

  return {
    success: true,
    message: 'Short-term (learning) parameters fitted and saved.',
  };
}
