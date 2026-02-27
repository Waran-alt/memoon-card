/**
 * User settings service: study and app preferences (e.g. session auto-end after away).
 * user_settings table; session_auto_end_away_minutes added in migration 024.
 */

import { pool } from '@/config/database';

const DEFAULT_AWAY_MINUTES = 5;
const MIN_AWAY_MINUTES = 1;
const MAX_AWAY_MINUTES = 120;

export interface StudySessionSettings {
  session_auto_end_away_minutes: number;
  knowledge_enabled: boolean;
}

export async function getStudySessionSettings(userId: string): Promise<StudySessionSettings> {
  const result = await pool.query<{ session_auto_end_away_minutes: number | null; knowledge_enabled: boolean | null }>(
    'SELECT session_auto_end_away_minutes, knowledge_enabled FROM user_settings WHERE user_id = $1',
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
  return { session_auto_end_away_minutes: awayMinutes, knowledge_enabled: knowledgeEnabled };
}

export async function updateSessionAutoEndAwayMinutes(
  userId: string,
  minutes: number
): Promise<StudySessionSettings> {
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
  await pool.query(
    `UPDATE user_settings SET knowledge_enabled = $1, updated_at = CURRENT_TIMESTAMP WHERE user_id = $2`,
    [knowledgeEnabled, userId]
  );
  return getStudySessionSettings(userId);
}
