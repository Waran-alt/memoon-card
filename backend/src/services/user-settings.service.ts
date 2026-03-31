/**
 * User settings: study preferences (reverse-pair interval, knowledge, FSRS display).
 * Every query is keyed by `user_id`; routes must pass the authenticated id from JWT, never a client-chosen user id alone.
 */

import { pool } from '@/config/database';
import { FSRS_V6_DEFAULT_WEIGHTS, FSRS_CONSTANTS } from '@/constants/fsrs.constants';
import { STUDY_INTERVAL } from '@/constants/study.constants';

const DEFAULT_LEARNING_MIN_INTERVAL_MINUTES = STUDY_INTERVAL.MIN_INTERVAL_MINUTES;
const MIN_LEARNING_INTERVAL = STUDY_INTERVAL.MIN_INTERVAL_MINUTES;
const MAX_LEARNING_INTERVAL = STUDY_INTERVAL.MAX_LEARNING_INTERVAL_MINUTES;

export interface StudySessionSettings {
  knowledge_enabled: boolean;
  learning_min_interval_minutes: number;
  fsrs_weights?: number[];
  fsrs_weights_default: number[];
  fsrs_weights_delta?: number[];
  target_retention?: number;
  target_retention_default: number;
}

export async function getStudySessionSettings(userId: string): Promise<StudySessionSettings> {
  const result = await pool.query<{
    knowledge_enabled: boolean | null;
    learning_min_interval_minutes: number | null;
    fsrs_weights: number[] | null;
    target_retention: number | null;
  }>(
    `SELECT knowledge_enabled, learning_min_interval_minutes,
            fsrs_weights, target_retention
     FROM user_settings WHERE user_id = $1`,
    [userId]
  );
  const row = result.rows[0];
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
  const defaultWeights = [...FSRS_V6_DEFAULT_WEIGHTS];
  const fsrsWeightsDelta =
    fsrsWeights && defaultWeights.length === fsrsWeights.length
      ? fsrsWeights.map((w, i) => w - (defaultWeights[i] ?? 0))
      : undefined;
  const targetRetentionDefault = FSRS_CONSTANTS.DEFAULT_TARGET_RETENTION;

  return {
    knowledge_enabled: knowledgeEnabled,
    learning_min_interval_minutes: learningMinInterval,
    fsrs_weights_default: defaultWeights,
    ...(fsrsWeights ? { fsrs_weights: fsrsWeights } : {}),
    ...(fsrsWeightsDelta ? { fsrs_weights_delta: fsrsWeightsDelta } : {}),
    ...(targetRetention != null ? { target_retention: targetRetention } : {}),
    target_retention_default: targetRetentionDefault,
  };
}

async function ensureUserSettingsRow(userId: string): Promise<void> {
  await pool.query(
    `INSERT INTO user_settings (
      user_id, fsrs_weights, fsrs_version, target_retention,
      review_count_since_optimization, knowledge_enabled,
      learning_min_interval_minutes
    )
    VALUES ($1, $2::jsonb, 'v6', 0.9, 0, false, $3)
    ON CONFLICT (user_id) DO NOTHING`,
    [userId, JSON.stringify([...FSRS_V6_DEFAULT_WEIGHTS]), DEFAULT_LEARNING_MIN_INTERVAL_MINUTES]
  );
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
