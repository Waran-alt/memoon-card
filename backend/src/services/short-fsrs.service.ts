/**
 * Short-FSRS: retention model for 0–2 day learning phase.
 * R_short(t) = e^(-t / S_short); update S_short from (rating, elapsed); predict next interval.
 */

export type Rating = 1 | 2 | 3 | 4;

/** Default initial short-term stability (minutes) by first rating */
const INITIAL_S_SHORT_BY_RATING: Record<Rating, number> = {
  1: 5,   // Again
  2: 15,  // Hard
  3: 30,  // Good
  4: 60,  // Easy
};

/** After Again we reset to this (minutes) */
const S_SHORT_AFTER_AGAIN = 5;

/** Growth multipliers on success (Hard / Good / Easy) */
const GROWTH_BY_RATING: Record<Rating, number> = {
  1: 0.5,  // Again: decay
  2: 1.15,
  3: 1.4,
  4: 1.7,
};

/** Fitted/saved params from short-term optimizer (stored in user_settings.learning_short_fsrs_params). */
export interface ShortFSParams {
  initialSShortByRating?: Record<string, number>;
  sShortAfterAgain?: number;
  growthByRating?: Record<string, number>;
}

function getInitialFromParams(rating: Rating, params?: ShortFSParams | null): number {
  const v = params?.initialSShortByRating?.[String(rating)];
  if (v != null && Number.isFinite(v) && v >= 1) return Math.min(120, v);
  return Math.max(1, INITIAL_S_SHORT_BY_RATING[rating] ?? 30);
}

function getAgainFromParams(params?: ShortFSParams | null): number {
  const v = params?.sShortAfterAgain;
  if (v != null && Number.isFinite(v) && v >= 1) return Math.min(30, v);
  return S_SHORT_AFTER_AGAIN;
}

function getGrowthFromParams(rating: Rating, params?: ShortFSParams | null): number {
  const v = params?.growthByRating?.[String(rating)];
  if (v != null && Number.isFinite(v) && v >= 0.5 && v <= 3) return v;
  return GROWTH_BY_RATING[rating] ?? 1.4;
}

export interface ShortFSRSConfig {
  targetRetentionShort: number;
  minIntervalMinutes: number;
  maxIntervalMinutes: number;
  graduationCapDays: number;
}

const DEFAULT_CONFIG: ShortFSRSConfig = {
  targetRetentionShort: 0.85,
  minIntervalMinutes: 1,
  maxIntervalMinutes: 24 * 60,
  graduationCapDays: 1,
};

/**
 * Initial short-term stability (minutes) from first rating (new card or re-entry).
 * @param params Optional fitted params from optimizer (user_settings.learning_short_fsrs_params).
 */
export function getInitialShortStabilityMinutes(rating: Rating, params?: ShortFSParams | null): number {
  return getInitialFromParams(rating, params);
}

/**
 * Update S_short after a learning review.
 * @param sShortMinutes current short-term stability (minutes)
 * @param elapsedMinutes time since last review (minutes)
 * @param rating 1–4
 * @param params Optional fitted params from optimizer.
 * @returns new S_short in minutes
 */
export function updateShortStability(
  sShortMinutes: number,
  elapsedMinutes: number,
  rating: Rating,
  params?: ShortFSParams | null
): number {
  if (rating === 1) {
    return Math.max(1, getAgainFromParams(params));
  }
  const growth = getGrowthFromParams(rating, params);
  const elapsedFactor = Math.log(1 + Math.max(0, elapsedMinutes) / 60) * 0.5 + 1;
  const newS = sShortMinutes * growth * Math.min(2, elapsedFactor);
  return Math.max(1, Math.min(24 * 60 * 7, newS)); // cap at 1 week in minutes
}

/**
 * Predict next interval (minutes) so that R_short(interval) = target.
 * R_short(t) = e^(-t / S_short) => t = S_short * (-ln(target))
 */
export function predictIntervalMinutes(
  sShortMinutes: number,
  targetRetention: number
): number {
  const t = Math.max(0, targetRetention);
  if (t >= 1) return 0;
  const interval = sShortMinutes * (-Math.log(t));
  return Math.max(0, interval);
}

/**
 * Clamp interval to [minMinutes, maxMinutes].
 */
export function clampIntervalMinutes(
  intervalMinutes: number,
  minMinutes: number,
  maxMinutes: number
): number {
  return Math.max(minMinutes, Math.min(maxMinutes, intervalMinutes));
}

/**
 * Check if the card should graduate (predicted interval >= cap in minutes).
 */
export function shouldGraduateShortTerm(
  intervalMinutes: number,
  graduationCapDays: number
): boolean {
  const capMinutes = graduationCapDays * 24 * 60;
  return intervalMinutes >= capMinutes;
}

/**
 * Merge user config with defaults.
 */
export function getShortFSRSConfig(partial: Partial<ShortFSRSConfig> | null): ShortFSRSConfig {
  if (!partial) return DEFAULT_CONFIG;
  return {
    targetRetentionShort: partial.targetRetentionShort ?? DEFAULT_CONFIG.targetRetentionShort,
    minIntervalMinutes: partial.minIntervalMinutes ?? DEFAULT_CONFIG.minIntervalMinutes,
    maxIntervalMinutes: partial.maxIntervalMinutes ?? DEFAULT_CONFIG.maxIntervalMinutes,
    graduationCapDays: partial.graduationCapDays ?? DEFAULT_CONFIG.graduationCapDays,
  };
}
