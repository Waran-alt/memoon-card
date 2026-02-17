import { PoolClient } from 'pg';
import {
  DAY1_SHORT_LOOP_ENABLED,
  DAY1_SHORT_LOOP_FATIGUE_THRESHOLD,
  DAY1_SHORT_LOOP_MAX_GAP_SECONDS,
  DAY1_SHORT_LOOP_MAX_REPS_DEFAULT,
  DAY1_SHORT_LOOP_MAX_REPS_INTENSIVE,
  DAY1_SHORT_LOOP_MAX_REPS_LIGHT,
  DAY1_SHORT_LOOP_MIN_GAP_SECONDS,
} from '@/config/env';
import { Card, CardDailyLoopState } from '@/types/database';
import { Rating } from './fsrs.service';
import { FEATURE_FLAGS, FeatureFlagService } from '@/services/feature-flag.service';

export type StudyIntensityMode = 'light' | 'default' | 'intensive';
export type ShortLoopAction = 'reinsert_today' | 'defer' | 'graduate_to_fsrs';

export interface ShortLoopDecision {
  enabled: boolean;
  action: ShortLoopAction;
  reason: string;
  nextGapSeconds: number | null;
  loopIteration: number;
  fatigueScore: number | null;
  importanceMode: StudyIntensityMode;
}

interface EvaluateShortLoopInput {
  client: PoolClient;
  userId: string;
  card: Card;
  rating: Rating;
  sessionId?: string;
  intensityMode?: StudyIntensityMode;
}

interface PolicyConfig {
  enabled: boolean;
  minGapSeconds: number;
  maxGapSeconds: number;
  fatigueThreshold: number;
  maxRepsByMode: Record<StudyIntensityMode, number>;
}

export class ShortLoopPolicyService {
  private readonly featureFlagService = new FeatureFlagService();

  private getConfig(): PolicyConfig {
    return {
      enabled: DAY1_SHORT_LOOP_ENABLED === 'true',
      minGapSeconds: Math.max(30, DAY1_SHORT_LOOP_MIN_GAP_SECONDS ?? 60),
      maxGapSeconds: Math.max(120, DAY1_SHORT_LOOP_MAX_GAP_SECONDS ?? 4 * 60 * 60),
      fatigueThreshold: DAY1_SHORT_LOOP_FATIGUE_THRESHOLD ?? 0.72,
      maxRepsByMode: {
        light: DAY1_SHORT_LOOP_MAX_REPS_LIGHT ?? 3,
        default: DAY1_SHORT_LOOP_MAX_REPS_DEFAULT ?? 5,
        intensive: DAY1_SHORT_LOOP_MAX_REPS_INTENSIVE ?? 7,
      },
    };
  }

  private normalizeMode(mode?: string): StudyIntensityMode {
    if (mode === 'light' || mode === 'intensive') return mode;
    return 'default';
  }

  private async getTodayState(
    client: PoolClient,
    userId: string,
    cardId: string
  ): Promise<CardDailyLoopState | null> {
    const result = await client.query<CardDailyLoopState>(
      `SELECT *
       FROM card_daily_loop_state
       WHERE user_id = $1
         AND card_id = $2
         AND loop_date = CURRENT_DATE
       LIMIT 1`,
      [userId, cardId]
    );
    return result.rows[0] ?? null;
  }

  private async estimateFatigue(
    client: PoolClient,
    userId: string,
    sessionId?: string
  ): Promise<number | null> {
    if (!sessionId) return null;
    const result = await client.query(
      `SELECT
          COUNT(*)::int AS review_count,
          AVG(CASE WHEN rating = 1 THEN 1.0 ELSE 0.0 END) AS fail_ratio,
          AVG(review_duration) FILTER (WHERE review_duration IS NOT NULL) AS avg_duration_ms
       FROM review_logs
       WHERE user_id = $1
         AND session_id = $2`,
      [userId, sessionId]
    );
    const row = result.rows[0];
    const reviewCount = Number(row?.review_count ?? 0);
    if (!Number.isFinite(reviewCount) || reviewCount <= 0) return 0;
    const failRatio = Number(row?.fail_ratio ?? 0);
    const avgDuration = Number(row?.avg_duration_ms ?? 0);
    const fatigue = Math.min(1, failRatio * 0.5 + Math.min(1, reviewCount / 50) * 0.3 + Math.min(1, avgDuration / 12000) * 0.2);
    return Math.max(0, fatigue);
  }

  private adaptiveGapSeconds(
    cfg: PolicyConfig,
    card: Card,
    rating: Rating,
    currentIteration: number,
    fatigueScore: number | null,
    mode: StudyIntensityMode
  ): number {
    const base = cfg.minGapSeconds * Math.pow(2, Math.max(0, currentIteration));
    const difficultyFactor =
      card.difficulty != null ? Math.max(0.75, Math.min(1.75, card.difficulty / 5)) : 1;
    const fatigueFactor = 1 + (fatigueScore ?? 0) * 0.8;
    const modeFactor = mode === 'light' ? 1.35 : mode === 'intensive' ? 0.8 : 1;
    const importanceFactor = card.is_important ? 0.85 : 1;
    const ratingFactor = rating === 1 ? 1.35 : rating === 2 ? 1.15 : rating === 3 ? 0.9 : 0.75;
    const next = base * difficultyFactor * fatigueFactor * modeFactor * importanceFactor * ratingFactor;
    return Math.max(cfg.minGapSeconds, Math.min(cfg.maxGapSeconds, Math.round(next)));
  }

  async evaluateAndPersist(input: EvaluateShortLoopInput): Promise<ShortLoopDecision> {
    const cfg = this.getConfig();
    const mode = this.normalizeMode(input.intensityMode);
    const enabledByFlag = await this.featureFlagService.isEnabledForUser({
      flagKey: FEATURE_FLAGS.day1ShortLoopPolicy,
      userId: input.userId,
      fallback: cfg.enabled,
    });
    if (!enabledByFlag) {
      return {
        enabled: false,
        action: 'graduate_to_fsrs',
        reason: 'feature_disabled',
        nextGapSeconds: null,
        loopIteration: 0,
        fatigueScore: null,
        importanceMode: mode,
      };
    }

    const state = await this.getTodayState(input.client, input.userId, input.card.id);
    const reviewsToday = state?.reviews_today ?? 0;
    const fatigueScore = await this.estimateFatigue(input.client, input.userId, input.sessionId);
    const maxReps = cfg.maxRepsByMode[mode];

    const candidate = input.card.stability == null || input.card.is_important || input.rating <= 2;
    let action: ShortLoopAction = 'graduate_to_fsrs';
    let reason = 'default_graduate';
    let nextGapSeconds: number | null = null;

    if (!candidate) {
      action = 'graduate_to_fsrs';
      reason = 'not_candidate';
    } else if (reviewsToday >= maxReps) {
      action = 'defer';
      reason = 'max_reps';
    } else if ((fatigueScore ?? 0) >= cfg.fatigueThreshold && reviewsToday >= 2) {
      action = 'defer';
      reason = 'fatigue_throttle';
    } else if (input.rating >= 3 && (state?.consecutive_successes ?? 0) >= 1) {
      action = 'graduate_to_fsrs';
      reason = 'graduated';
    } else {
      action = 'reinsert_today';
      reason = input.rating <= 2 ? 'retry' : 'confirm_success';
      nextGapSeconds = this.adaptiveGapSeconds(
        cfg,
        input.card,
        input.rating,
        state?.iteration ?? 0,
        fatigueScore,
        mode
      );
    }

    const nextIteration = (state?.iteration ?? 0) + 1;
    const nextSuccess = input.rating >= 3 ? (state?.consecutive_successes ?? 0) + 1 : 0;
    const nextFail = input.rating === 1 ? (state?.consecutive_failures ?? 0) + 1 : 0;

    await input.client.query(
      `INSERT INTO card_daily_loop_state (
        user_id, card_id, loop_date, session_id, is_active, iteration, reviews_today,
        consecutive_successes, consecutive_failures, last_rating, last_gap_seconds,
        next_short_loop_at, fatigue_score, importance_multiplier, difficulty_multiplier,
        confidence_multiplier, updated_at
      )
      VALUES (
        $1, $2, CURRENT_DATE, $3, $4, $5, $6, $7, $8, $9, $10,
        CASE WHEN $11::int IS NULL THEN NULL ELSE NOW() + ($11::int * INTERVAL '1 second') END,
        $12, $13, $14, $15, NOW()
      )
      ON CONFLICT (user_id, card_id, loop_date)
      DO UPDATE SET
        session_id = EXCLUDED.session_id,
        is_active = EXCLUDED.is_active,
        iteration = EXCLUDED.iteration,
        reviews_today = EXCLUDED.reviews_today,
        consecutive_successes = EXCLUDED.consecutive_successes,
        consecutive_failures = EXCLUDED.consecutive_failures,
        last_rating = EXCLUDED.last_rating,
        last_gap_seconds = EXCLUDED.last_gap_seconds,
        next_short_loop_at = EXCLUDED.next_short_loop_at,
        fatigue_score = EXCLUDED.fatigue_score,
        importance_multiplier = EXCLUDED.importance_multiplier,
        difficulty_multiplier = EXCLUDED.difficulty_multiplier,
        confidence_multiplier = EXCLUDED.confidence_multiplier,
        updated_at = NOW()`,
      [
        input.userId,
        input.card.id,
        input.sessionId ?? null,
        action === 'reinsert_today',
        nextIteration,
        reviewsToday + 1,
        nextSuccess,
        nextFail,
        input.rating,
        nextGapSeconds,
        nextGapSeconds,
        fatigueScore,
        mode === 'intensive' ? 0.8 : mode === 'light' ? 1.3 : 1,
        input.card.difficulty != null ? Math.max(0.75, Math.min(1.75, input.card.difficulty / 5)) : 1,
        input.rating >= 3 ? 1.1 : 0.9,
      ]
    );

    return {
      enabled: true,
      action,
      reason,
      nextGapSeconds,
      loopIteration: nextIteration,
      fatigueScore,
      importanceMode: mode,
    };
  }
}
