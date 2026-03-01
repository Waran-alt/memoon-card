/**
 * User settings service: study and app preferences (e.g. session auto-end after away).
 * user_settings table; session_auto_end_away_minutes added in migration 024.
 */

import { pool } from '@/config/database';
import { FSRS_V6_DEFAULT_WEIGHTS, FSRS_CONSTANTS } from '@/constants/fsrs.constants';
import { STUDY_INTERVAL } from '@/constants/study.constants';

const DEFAULT_AWAY_MINUTES = 5;
const MIN_AWAY_MINUTES = 1;
const MAX_AWAY_MINUTES = 120;

const DEFAULT_LEARNING_MIN_INTERVAL_MINUTES = STUDY_INTERVAL.MIN_INTERVAL_MINUTES;
const MIN_LEARNING_INTERVAL = STUDY_INTERVAL.MIN_INTERVAL_MINUTES;
const MAX_LEARNING_INTERVAL = STUDY_INTERVAL.MAX_LEARNING_INTERVAL_MINUTES;

export interface StudySessionSettings {
  session_auto_end_away_minutes: number;
  knowledge_enabled: boolean;
  /** Short-FSRS minimum interval (minutes); used e.g. for reverse-pair time gap. */
  learning_min_interval_minutes: number;
  /** FSRS v6 weights (21 values); used for long-term scheduling. */
  fsrs_weights?: number[];
  /** Default FSRS v6 weights (21 values) for comparison. */
  fsrs_weights_default: number[];
  /** Per-weight difference (user - default) when user has custom weights; length 21. */
  fsrs_weights_delta?: number[];
  /** Target retention (0–1) for FSRS. */
  target_retention?: number;
  /** Default target retention. */
  target_retention_default: number;
  /** Short-FSRS fitted params from optimizer, or null if using defaults. */
  learning_short_fsrs_params?: Record<string, unknown> | null;
}

export async function getStudySessionSettings(userId: string): Promise<StudySessionSettings> {
  const result = await pool.query<{
    session_auto_end_away_minutes: number | null;
    knowledge_enabled: boolean | null;
    learning_min_interval_minutes: number | null;
    fsrs_weights: number[] | null;
    target_retention: number | null;
    learning_short_fsrs_params: Record<string, unknown> | null;
  }>(
    `SELECT session_auto_end_away_minutes, knowledge_enabled, learning_min_interval_minutes,
            fsrs_weights, target_retention, learning_short_fsrs_params
     FROM user_settings WHERE user_id = $1`,
    [userId]
  );
  const row = result.rows[0];
  const raw = row?.session_auto_end_away_minutes;
  const awayMinutes =
    raw != null && Number.isFinite(Number(raw))
      ? (() => {
          const n = Math.round(Number(raw));
          return n >= MIN_AWAY_MINUTES && n <= MAX_AWAY_MINUTES ? n : DEFAULT_AWAY_MINUTES;
        })()
      : DEFAULT_AWAY_MINUTES;
  const knowledgeEnabled = row?.knowledge_enabled === true;
  const rawMin = row?.learning_min_interval_minutes;
  const learningMinInterval =
    rawMin != null && Number.isFinite(Number(rawMin))
      ? (() => {
          const n = Math.round(Number(rawMin));
          return n >= MIN_LEARNING_INTERVAL && n <= MAX_LEARNING_INTERVAL ? n : DEFAULT_LEARNING_MIN_INTERVAL_MINUTES;
        })()
      : DEFAULT_LEARNING_MIN_INTERVAL_MINUTES;
  const rawWeights = row?.fsrs_weights;
  const fsrsWeights =
    Array.isArray(rawWeights) && rawWeights.length >= 21
      ? rawWeights.slice(0, 21).map((w) => (Number.isFinite(Number(w)) ? Number(w) : 1))
      : undefined;
  const targetRetention =
    row?.target_retention != null && Number.isFinite(Number(row.target_retention))
      ? Number(row.target_retention)
      : undefined;
  const shortFsrsParams =
    row?.learning_short_fsrs_params != null &&
    typeof row.learning_short_fsrs_params === 'object' &&
    !Array.isArray(row.learning_short_fsrs_params)
      ? (row.learning_short_fsrs_params as Record<string, unknown>)
      : undefined;

  const defaultWeights = [...FSRS_V6_DEFAULT_WEIGHTS];
  const fsrsWeightsDelta =
    fsrsWeights &&
    defaultWeights.length === fsrsWeights.length
      ? fsrsWeights.map((w, i) => w - (defaultWeights[i] ?? 0))
      : undefined;

  const targetRetentionDefault = FSRS_CONSTANTS.DEFAULT_TARGET_RETENTION;

  return {
    session_auto_end_away_minutes: awayMinutes,
    knowledge_enabled: knowledgeEnabled,
    learning_min_interval_minutes: learningMinInterval,
    fsrs_weights_default: defaultWeights,
    ...(fsrsWeights ? { fsrs_weights: fsrsWeights } : {}),
    ...(fsrsWeightsDelta ? { fsrs_weights_delta: fsrsWeightsDelta } : {}),
    ...(targetRetention != null ? { target_retention: targetRetention } : {}),
    target_retention_default: targetRetentionDefault,
    ...(shortFsrsParams !== undefined ? { learning_short_fsrs_params: shortFsrsParams } : {}),
  };
}

/**
 * Ensure user has a user_settings row (insert with defaults if missing).
 * Keeps the base in sync when settings are updated via API.
 */
async function ensureUserSettingsRow(userId: string): Promise<void> {
  await pool.query(
    `INSERT INTO user_settings (
      user_id, fsrs_weights, fsrs_version, target_retention,
      review_count_since_optimization, study_intensity_mode, session_auto_end_away_minutes, knowledge_enabled,
      learning_graduation_cap_days, learning_target_retention_short, learning_min_interval_minutes,
      learning_max_attempts_before_graduate, learning_apply_to_lapses
    )
    VALUES ($1, $2::jsonb, 'v6', 0.9, 0, 'default', $3, false, 1, 0.85, $4, 7, 'always')
    ON CONFLICT (user_id) DO NOTHING`,
    [userId, JSON.stringify([...FSRS_V6_DEFAULT_WEIGHTS]), DEFAULT_AWAY_MINUTES, DEFAULT_LEARNING_MIN_INTERVAL_MINUTES]
  );
}

export async function updateSessionAutoEndAwayMinutes(
  userId: string,
  minutes: number
): Promise<StudySessionSettings> {
  await ensureUserSettingsRow(userId);
  const clamped = Math.max(MIN_AWAY_MINUTES, Math.min(MAX_AWAY_MINUTES, Math.round(minutes)));
  await pool.query(
    `UPDATE user_settings SET session_auto_end_away_minutes = $1, updated_at = CURRENT_TIMESTAMP WHERE user_id = $2`,
    [clamped, userId]
  );
  return getStudySessionSettings(userId);
}

export async function updateKnowledgeEnabled(
  userId: string,
  knowledgeEnabled: boolean
): Promise<StudySessionSettings> {
  await ensureUserSettingsRow(userId);
  await pool.query(
    `UPDATE user_settings SET knowledge_enabled = $1, updated_at = CURRENT_TIMESTAMP WHERE user_id = $2`,
    [knowledgeEnabled, userId]
  );
  return getStudySessionSettings(userId);
}
