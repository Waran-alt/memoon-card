import {
  ADAPTIVE_RETENTION_DEFAULT,
  ADAPTIVE_RETENTION_ENABLED,
  ADAPTIVE_RETENTION_MAX,
  ADAPTIVE_RETENTION_MIN,
  ADAPTIVE_RETENTION_STEP,
} from '@/config/env';
import { pool } from '@/config/database';
import { FEATURE_FLAGS, FeatureFlagService } from '@/services/feature-flag.service';
import { FsrsMetricsService } from '@/services/fsrs-metrics.service';

const DEFAULT_MIN = 0.85;
const DEFAULT_MAX = 0.95;
const DEFAULT_TARGET = 0.9;
const DEFAULT_STEP = 0.01;
const MIN_REVIEWS_FOR_CONFIDENCE = 300;
const MIN_SESSIONS_FOR_CONFIDENCE = 20;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function roundToStep(value: number, step: number): number {
  return Math.round(value / step) * step;
}

export interface AdaptiveTargetRecommendation {
  enabled: boolean;
  currentTarget: number;
  recommendedTarget: number;
  confidence: 'low' | 'medium' | 'high';
  reasons: string[];
  windowMeta: {
    reviewCount: number;
    sessionCount: number;
    reliability: 'low' | 'medium' | 'high';
  };
}

export class AdaptiveRetentionService {
  private readonly fsrsMetricsService = new FsrsMetricsService();
  private readonly featureFlagService = new FeatureFlagService();

  private getConfig() {
    const min = ADAPTIVE_RETENTION_MIN ?? DEFAULT_MIN;
    const max = ADAPTIVE_RETENTION_MAX ?? DEFAULT_MAX;
    const step = ADAPTIVE_RETENTION_STEP ?? DEFAULT_STEP;
    const defaultTarget = ADAPTIVE_RETENTION_DEFAULT ?? DEFAULT_TARGET;
    return {
      enabled: ADAPTIVE_RETENTION_ENABLED === 'true',
      min: clamp(min, 0.5, 0.99),
      max: clamp(max, 0.5, 0.99),
      step: clamp(step, 0.001, 0.1),
      defaultTarget: clamp(defaultTarget, 0.5, 0.99),
    };
  }

  async getCurrentTargetRetention(userId: string): Promise<number> {
    const result = await pool.query<{ target_retention: number | null }>(
      'SELECT target_retention FROM user_settings WHERE user_id = $1',
      [userId]
    );
    if (result.rows.length === 0) return this.getConfig().defaultTarget;
    const target = result.rows[0].target_retention;
    return target ?? this.getConfig().defaultTarget;
  }

  async computeRecommendedTarget(userId: string): Promise<AdaptiveTargetRecommendation> {
    const cfg = this.getConfig();
    const enabledByFlag = await this.featureFlagService.isEnabledForUser({
      flagKey: FEATURE_FLAGS.adaptiveRetentionPolicy,
      userId,
      fallback: cfg.enabled,
    });
    const currentTarget = await this.getCurrentTargetRetention(userId);
    const summary = await this.fsrsMetricsService.getSummary(userId, 30);
    const windows = await this.fsrsMetricsService.getWindows(userId);
    const reviewCount = windows.sessionWindow.reviewCount;
    const sessionCount = windows.sessionWindow.sessionCount;
    const reliability = summary.current.reliability;
    const reasons: string[] = [];

    if (!enabledByFlag) {
      return {
        enabled: false,
        currentTarget,
        recommendedTarget: currentTarget,
        confidence: 'low',
        reasons: ['adaptive_retention_disabled'],
        windowMeta: { reviewCount, sessionCount, reliability },
      };
    }

    const enoughEvidence = reviewCount >= MIN_REVIEWS_FOR_CONFIDENCE || sessionCount >= MIN_SESSIONS_FOR_CONFIDENCE;
    if (!enoughEvidence || reliability === 'low') {
      reasons.push('insufficient_evidence');
      return {
        enabled: true,
        currentTarget,
        recommendedTarget: currentTarget,
        confidence: 'low',
        reasons,
        windowMeta: { reviewCount, sessionCount, reliability },
      };
    }

    let recommended = currentTarget;
    const observed = summary.current.observedRecallRate;
    const predicted = summary.current.avgPredictedRecall;
    const brier = summary.current.avgBrierScore;
    const gap = observed != null && predicted != null ? observed - predicted : null;

    if (gap != null) {
      if (gap < -0.05) {
        recommended += cfg.step;
        reasons.push('observed_below_predicted');
      } else if (gap > 0.05) {
        recommended -= cfg.step;
        reasons.push('observed_above_predicted');
      }
    }

    if (brier != null && brier > 0.22) {
      recommended += cfg.step;
      reasons.push('high_brier_score');
    }

    if (reviewCount > 600 && observed != null && observed > 0.9 && (brier == null || brier < 0.18)) {
      recommended -= cfg.step;
      reasons.push('high_load_with_good_recall');
    }

    if (reasons.length === 0) {
      reasons.push('stable_keep_current');
    }

    recommended = roundToStep(clamp(recommended, cfg.min, cfg.max), cfg.step);

    const confidence: 'low' | 'medium' | 'high' =
      reliability === 'high' && reviewCount >= 600 ? 'high' : 'medium';

    return {
      enabled: true,
      currentTarget,
      recommendedTarget: recommended,
      confidence,
      reasons,
      windowMeta: { reviewCount, sessionCount, reliability },
    };
  }
}
