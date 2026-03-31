/**
 * Python FSRS Optimizer integration for personalized weights (see https://github.com/open-spaced-repetition/fsrs-optimizer).
 * runSpawn with argv only; binary path from constants. userId validated as UUID before temp file paths.
 */

import { writeFile, unlink, mkdir } from 'fs/promises';
import { resolve, basename } from 'path';
import {
  getFsrsOptimizerCheckCandidates,
  getFsrsOptimizerRunCandidates,
} from '@/constants/optimizer-spawn.constants';
import { pool } from '../config/database';
import { UserSettings, UserWeightSnapshot } from '../types/database';
import { ValidationError } from '../utils/errors';
import { OPTIMIZER_CONFIG } from '../constants/optimization.constants';
import { logger, serializeError } from '@/utils/logger';
import { runSpawn } from '@/utils/run-spawn';
import { pickValidTimezone } from '@/utils/iana-timezone';

// UUID validation regex
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validate and sanitize user ID
 */
function validateUserId(userId: string): void {
  if (!UUID_REGEX.test(userId)) {
    throw new ValidationError('Invalid user ID format');
  }
}

/**
 * Sanitize and validate file path
 * Ensures path is within temp directory and doesn't contain path traversal
 */
function sanitizePath(filePath: string, baseDir: string): string {
  const resolved = resolve(baseDir, basename(filePath));
  
  // Ensure resolved path is within base directory
  if (!resolved.startsWith(resolve(baseDir))) {
    throw new ValidationError('Invalid file path');
  }
  
  return resolved;
}

export interface OptimizationResult {
  success: boolean;
  weights?: number[];
  message: string;
  error?: string;
}

export interface OptimizationConfig {
  timezone?: string;
  dayStart?: number;
  targetRetention?: number;
}

interface SnapshotMeta {
  targetRetention: number;
  reviewCountUsed: number;
  newReviewsSinceLast: number;
  daysSinceLast: number;
  optimizerMethod?: string;
  activatedBy: string;
  activationReason: string;
}

/**
 * FSRS Optimization Service
 */
export class OptimizationService {
  private static readonly ADAPTIVE_TARGET_MAX_DELTA = 0.02;
  private static readonly ADAPTIVE_TARGET_COOLDOWN_DAYS = 7;
  /**
   * Export review logs to CSV format for FSRS Optimizer
   */
  async exportReviewLogsToCSV(userId: string, outputPath: string): Promise<void> {
    // Validate userId format
    validateUserId(userId);
    const query = `
      SELECT 
        card_id::text as card_id,
        review_time,
        rating as review_rating,
        COALESCE(review_state, 
          CASE 
            WHEN stability_before IS NULL THEN 0
            WHEN stability_before < 1 THEN 1
            WHEN rating = 1 THEN 3
            ELSE 2
          END
        ) as review_state,
        COALESCE(review_duration, NULL) as review_duration
      FROM review_logs
      WHERE user_id = $1
        AND review_time IS NOT NULL
      ORDER BY review_time
    `;

    const result = await pool.query(query, [userId]);

    if (result.rows.length === 0) {
      throw new Error('No review logs found for user');
    }

    // Generate CSV content
    const csvHeader = 'card_id,review_time,review_rating,review_state,review_duration\n';
    const csvRows = result.rows.map(row => {
      const cardId = String(row.card_id);
      const reviewTime = String(row.review_time);
      const reviewRating = String(row.review_rating);
      const reviewState = row.review_state !== null ? String(row.review_state) : '';
      const reviewDuration = row.review_duration !== null ? String(row.review_duration) : '';
      
      return `${cardId},${reviewTime},${reviewRating},${reviewState},${reviewDuration}`;
    }).join('\n');

    await writeFile(outputPath, csvHeader + csvRows, 'utf-8');
  }

  /**
   * Run FSRS Optimizer on review logs
   * 
   * Requires Python and fsrs-optimizer package to be installed:
   * pip install fsrs-optimizer
   */
  async optimizeWeights(
    userId: string,
    config?: OptimizationConfig
  ): Promise<OptimizationResult> {
    // Validate userId format to prevent command injection
    validateUserId(userId);
    
    const tempDir = resolve(process.cwd(), 'temp');
    const timestamp = Date.now();
    
    // Create safe file names (userId is already validated as UUID)
    const csvFileName = `revlog_${userId}_${timestamp}.csv`;
    const outputFileName = `output_${userId}_${timestamp}.json`;
    
    // Sanitize paths to prevent path traversal
    const csvPath = sanitizePath(csvFileName, tempDir);
    const outputPath = sanitizePath(outputFileName, tempDir);

    try {
      // Use fs.mkdir instead of shell command to prevent command injection
      await mkdir(tempDir, { recursive: true });

      // Export review logs to CSV
      await this.exportReviewLogsToCSV(userId, csvPath);

      // Get user settings for timezone and day_start
      const userSettings = await this.getUserSettings(userId);
      const timezone = pickValidTimezone(
        config?.timezone ?? userSettings.timezone ?? undefined,
        OPTIMIZER_CONFIG.DEFAULT_TIMEZONE
      );
      const dayStart = config?.dayStart ?? userSettings.day_start ?? OPTIMIZER_CONFIG.DEFAULT_DAY_START;

      // Build optimizer command
      // Note: FSRS Optimizer CLI accepts timezone and day_start as environment variables
      const env = {
        ...process.env,
        TZ: timezone,
        DAY_START: String(dayStart),
      };

      const spawnCandidates = getFsrsOptimizerRunCandidates(csvPath);

      let stdout = '';
      let stderr = '';
      let lastError: Error | null = null;
      let usedOptimizerMethod: string | undefined;

      for (const cand of spawnCandidates) {
        try {
          const result = await runSpawn(cand.file, cand.args, {
            env,
            timeoutMs: OPTIMIZER_CONFIG.EXECUTION_TIMEOUT_MS,
            maxBufferBytes: OPTIMIZER_CONFIG.MAX_BUFFER_BYTES,
          });
          stdout = result.stdout;
          stderr = result.stderr;
          usedOptimizerMethod = cand.label;
          lastError = null;
          break;
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
        }
      }

      if (lastError) {
        const tried = spawnCandidates.map((c) => c.label).join(', ');
        throw new Error(
          `Failed to run FSRS Optimizer. Tried: ${tried}\n` +
          `Error: ${lastError.message}\n\n` +
          `Please install fsrs-optimizer using one of:\n` +
          `  - pipx install fsrs-optimizer (recommended)\n` +
          `  - python3 -m venv venv && venv/bin/pip install fsrs-optimizer\n` +
          `  - Or ensure it's available in your Python path`
        );
      }

      // Parse optimizer output
      // The optimizer outputs weights in various formats
      const weights = this.parseOptimizerOutput(stdout, stderr);

      if (!weights || weights.length !== 21) {
        throw new Error(`Invalid optimizer output: expected 21 weights, got ${weights?.length || 0}`);
      }

      const eligibility = await this.getOptimizationEligibility(userId);

      // Update user settings with optimized weights
      await this.updateUserWeights(userId, weights, {
        targetRetention: config?.targetRetention ?? userSettings.target_retention,
        reviewCountUsed: eligibility.totalReviews,
        newReviewsSinceLast: eligibility.newReviewsSinceLast,
        daysSinceLast: eligibility.daysSinceLast,
        optimizerMethod: usedOptimizerMethod,
        activatedBy: userId,
        activationReason: 'optimizer_run',
      });

      // Cleanup temp files
      await unlink(csvPath).catch(() => {}); // Ignore errors if file doesn't exist

      return {
        success: true,
        weights,
        message: 'FSRS weights optimized successfully',
      };
    } catch (error) {
      // Cleanup temp files on error
      await unlink(csvPath).catch(() => {});
      await unlink(outputPath).catch(() => {});

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      return {
        success: false,
        message: 'Failed to optimize FSRS weights',
        error: errorMessage,
      };
    }
  }

  /**
   * Parse optimizer output to extract weights
   * 
   * The FSRS Optimizer outputs weights in various formats.
   * This method attempts to parse the most common formats.
   * 
   * The optimizer typically outputs:
   * - A JSON array of weights
   * - A Python list format
   * - Space or comma-separated values
   */
  private parseOptimizerOutput(stdout: string, stderr: string): number[] | null {
    const output = stdout + '\n' + stderr;
    
    try {
      // Method 1: Try to find JSON array in output
      const jsonMatches = output.match(/\[[\d.,\-\s]+\]/g);
      if (jsonMatches) {
        for (const match of jsonMatches) {
          try {
            const weights = JSON.parse(match);
            if (Array.isArray(weights) && weights.length === 21) {
              return weights;
            }
          } catch {
            // Continue to next match
          }
        }
      }

      // Method 2: Try Python list format [0.212, 1.2931, ...]
      const pythonListMatch = output.match(/\[([\d.,\-\s]+)\]/);
      if (pythonListMatch) {
        const weights = pythonListMatch[1]
          .split(/[,\s]+/)
          .map(s => s.trim())
          .filter(s => s.length > 0)
          .map(Number)
          .filter(n => !isNaN(n));
        
        if (weights.length === 21) {
          return weights;
        }
      }

      // Method 3: Try to find all decimal numbers and take first 21
      const numbers = output.match(/[\d]+\.[\d]+/g);
      if (numbers && numbers.length >= 21) {
        const weights = numbers.slice(0, 21).map(Number);
        if (weights.every(w => !isNaN(w))) {
          return weights;
        }
      }

      // Method 4: Look for lines with "weights" or "parameters"
      const lines = output.split('\n');
      for (const line of lines) {
        // Try various patterns
        const patterns = [
          /weights?[:\s=]+\[([\d.,\-\s]+)\]/i,
          /parameters?[:\s=]+\[([\d.,\-\s]+)\]/i,
          /\[([\d.,\-\s]{50,})\]/i, // Long array-like string
        ];

        for (const pattern of patterns) {
          const match = line.match(pattern);
          if (match) {
            const weights = match[1]
              .split(/[,\s]+/)
              .map(s => s.trim())
              .filter(s => s.length > 0)
              .map(Number)
              .filter(n => !isNaN(n));
            
            if (weights.length === 21) {
              return weights;
            }
          }
        }
      }

      logger.error('Could not parse optimizer output', {
        stdout: stdout.substring(0, OPTIMIZER_CONFIG.ERROR_OUTPUT_MAX_LENGTH),
        stderr: stderr.substring(0, OPTIMIZER_CONFIG.ERROR_OUTPUT_MAX_LENGTH),
      });
      return null;
    } catch (error) {
      logger.error('Error parsing optimizer output', { error: serializeError(error) });
      return null;
    }
  }

  /**
   * Get user settings
   */
  private async getUserSettings(userId: string): Promise<UserSettings> {
    const result = await pool.query<UserSettings>(
      'SELECT * FROM user_settings WHERE user_id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      // Return defaults
      return {
        user_id: userId,
        fsrs_weights: [],
        target_retention: 0.9,
        last_optimized_at: null,
        review_count_since_optimization: 0,
        updated_at: new Date(),
      };
    }

    return result.rows[0];
  }

  /**
   * Update user weights in database
   */
  private async updateUserWeights(userId: string, weights: number[], meta: SnapshotMeta): Promise<void> {
    const now = new Date();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const versionResult = await client.query<{ next_version: string }>(
        `
        SELECT COALESCE(MAX(version), 0) + 1 AS next_version
        FROM user_weight_snapshots
        WHERE user_id = $1
        `,
        [userId]
      );
      const nextVersion = parseInt(versionResult.rows[0].next_version, 10);

      await client.query(
        `
        INSERT INTO user_settings (user_id, fsrs_weights, target_retention, last_optimized_at, review_count_since_optimization, updated_at)
        VALUES ($1, $2::float8[], $3, $4, 0, $5)
        ON CONFLICT (user_id)
        DO UPDATE SET
          fsrs_weights = $2::float8[],
          target_retention = $3,
          last_optimized_at = $4,
          review_count_since_optimization = 0,
          updated_at = $5
        `,
        [userId, weights, meta.targetRetention, now, now]
      );

      await client.query(
        `
        UPDATE user_weight_snapshots
        SET is_active = false
        WHERE user_id = $1 AND is_active = true
        `,
        [userId]
      );

      await client.query(
        `
        INSERT INTO user_weight_snapshots (
          user_id, version, weights, target_retention, source,
          review_count_used, new_reviews_since_last, days_since_last_opt,
          optimizer_method, is_active, activated_by, activated_at, activation_reason, created_at
        )
        VALUES ($1, $2, $3::float8[], $4, 'optimizer', $5, $6, $7, $8, true, $9, $10, $11, $12)
        `,
        [
          userId,
          nextVersion,
          weights,
          meta.targetRetention,
          meta.reviewCountUsed,
          meta.newReviewsSinceLast,
          meta.daysSinceLast,
          meta.optimizerMethod ?? null,
          meta.activatedBy,
          now,
          meta.activationReason,
          now,
        ]
      );

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  async getWeightSnapshots(userId: string, limit: number = 20): Promise<UserWeightSnapshot[]> {
    validateUserId(userId);
    const safeLimit = Number.isInteger(limit) ? Math.max(1, Math.min(100, limit)) : 20;
    const result = await pool.query<UserWeightSnapshot>(
      `
      SELECT
        id, user_id, version, weights, target_retention, source,
        review_count_used, new_reviews_since_last, days_since_last_opt,
          optimizer_method, is_active, activated_by, activated_at, activation_reason, created_at
      FROM user_weight_snapshots
      WHERE user_id = $1
      ORDER BY version DESC
      LIMIT $2
      `,
      [userId, safeLimit]
    );
    return result.rows;
  }

  async activateSnapshotVersion(userId: string, version: number, reason?: string): Promise<UserWeightSnapshot | null> {
    validateUserId(userId);
    if (!Number.isInteger(version) || version < 1) {
      throw new ValidationError('Invalid snapshot version');
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const snapshotResult = await client.query<UserWeightSnapshot>(
        `
        SELECT
          id, user_id, version, weights, target_retention, source,
          review_count_used, new_reviews_since_last, days_since_last_opt,
          optimizer_method, is_active, activated_by, activated_at, activation_reason, created_at
        FROM user_weight_snapshots
        WHERE user_id = $1 AND version = $2
        FOR UPDATE
        `,
        [userId, version]
      );

      if (snapshotResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return null;
      }

      const snapshot = snapshotResult.rows[0];

      await client.query(
        `
        UPDATE user_weight_snapshots
        SET is_active = false
        WHERE user_id = $1 AND is_active = true
        `,
        [userId]
      );

      await client.query(
        `
        UPDATE user_weight_snapshots
        SET is_active = true, activated_by = $3, activated_at = NOW(), activation_reason = $4
        WHERE user_id = $1 AND version = $2
        `,
        [userId, version, userId, reason ?? 'manual_rollback']
      );

      await client.query(
        `
        INSERT INTO user_settings (
          user_id, fsrs_weights, target_retention, last_optimized_at, review_count_since_optimization, updated_at
        )
        VALUES ($1, $2::float8[], $3, NULL, 0, NOW())
        ON CONFLICT (user_id)
        DO UPDATE SET
          fsrs_weights = $2::float8[],
          target_retention = COALESCE($3, user_settings.target_retention),
          updated_at = NOW()
        `,
        [userId, snapshot.weights, snapshot.target_retention]
      );

      await client.query('COMMIT');

      return {
        ...snapshot,
        is_active: true,
        activated_by: userId,
        activated_at: new Date(),
        activation_reason: reason ?? 'manual_rollback',
      };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  async applyAdaptiveTargetRetention(
    userId: string,
    recommendedTarget: number,
    reason: string = 'adaptive_target_apply'
  ): Promise<UserWeightSnapshot> {
    validateUserId(userId);
    const now = new Date();

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const settingsResult = await client.query<UserSettings>(
        'SELECT * FROM user_settings WHERE user_id = $1 FOR UPDATE',
        [userId]
      );
      const settings = settingsResult.rows[0];
      const currentTarget = settings?.target_retention ?? 0.9;
      const weights = settings?.fsrs_weights ?? [];

      if (!settings || weights.length === 0) {
        throw new ValidationError('Cannot apply adaptive target without existing user settings');
      }

      const targetDelta = Math.abs(recommendedTarget - currentTarget);
      if (targetDelta > OptimizationService.ADAPTIVE_TARGET_MAX_DELTA) {
        throw new ValidationError(
          `Adaptive target change too large (${targetDelta.toFixed(3)}). Maximum allowed is ${OptimizationService.ADAPTIVE_TARGET_MAX_DELTA}`
        );
      }

      const recentAdaptiveResult = await client.query<{ created_at: Date }>(
        `
        SELECT created_at
        FROM user_weight_snapshots
        WHERE user_id = $1 AND source = 'adaptive_policy'
        ORDER BY created_at DESC
        LIMIT 1
        `,
        [userId]
      );
      if (recentAdaptiveResult.rows.length > 0) {
        const last = recentAdaptiveResult.rows[0].created_at;
        const days = (Date.now() - last.getTime()) / (1000 * 60 * 60 * 24);
        if (days < OptimizationService.ADAPTIVE_TARGET_COOLDOWN_DAYS) {
          throw new ValidationError(
            `Adaptive target cooldown active. Try again in ${Math.ceil(OptimizationService.ADAPTIVE_TARGET_COOLDOWN_DAYS - days)} day(s)`
          );
        }
      }

      const versionResult = await client.query<{ next_version: string }>(
        `
        SELECT COALESCE(MAX(version), 0) + 1 AS next_version
        FROM user_weight_snapshots
        WHERE user_id = $1
        `,
        [userId]
      );
      const nextVersion = parseInt(versionResult.rows[0].next_version, 10);

      await client.query(
        `
        UPDATE user_settings
        SET target_retention = $2, updated_at = $3
        WHERE user_id = $1
        `,
        [userId, recommendedTarget, now]
      );

      await client.query(
        `
        UPDATE user_weight_snapshots
        SET is_active = false
        WHERE user_id = $1 AND is_active = true
        `,
        [userId]
      );

      const snapshotInsert = await client.query<UserWeightSnapshot>(
        `
        INSERT INTO user_weight_snapshots (
          user_id, version, weights, target_retention, source,
          review_count_used, new_reviews_since_last, days_since_last_opt,
          optimizer_method, is_active, activated_by, activated_at, activation_reason, created_at
        )
        VALUES ($1, $2, $3::float8[], $4, 'adaptive_policy', NULL, NULL, NULL, NULL, true, $5, $6, $7, $8)
        RETURNING
          id, user_id, version, weights, target_retention, source,
          review_count_used, new_reviews_since_last, days_since_last_opt,
          optimizer_method, is_active, activated_by, activated_at, activation_reason, created_at
        `,
        [userId, nextVersion, weights, recommendedTarget, userId, now, reason, now]
      );

      await client.query('COMMIT');
      return snapshotInsert.rows[0];
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Check if FSRS Optimizer is available
   * 
   * Tries multiple Python executables and virtual environment paths
   */
  async checkOptimizerAvailable(): Promise<{ available: boolean; pythonPath?: string; method?: string }> {
    const checks = getFsrsOptimizerCheckCandidates();

    for (const { file, args, method } of checks) {
      try {
        await runSpawn(file, args, {
          env: { ...process.env },
          timeoutMs: OPTIMIZER_CONFIG.CHECK_TIMEOUT_MS,
          maxBufferBytes: OPTIMIZER_CONFIG.MAX_BUFFER_BYTES,
        });
        return { available: true, method };
      } catch {
        // Continue to next
      }
    }

    return { available: false };
  }

  /**
   * Get minimum review count required for optimization (for display).
   * First run: MIN_REVIEW_COUNT_FIRST; subsequent: MIN_REVIEW_COUNT_SUBSEQUENT.
   */
  getMinReviewCount(hasOptimizedBefore: boolean): number {
    return hasOptimizedBefore
      ? OPTIMIZER_CONFIG.MIN_REVIEW_COUNT_SUBSEQUENT
      : OPTIMIZER_CONFIG.MIN_REVIEW_COUNT_FIRST;
  }

  /**
   * Count new reviews since last optimization from DB (source of truth).
   * review_time is stored in milliseconds (BIGINT).
   */
  private async getNewReviewsSinceLast(
    userId: string,
    lastOptimizedAt: Date | null
  ): Promise<number> {
    if (!lastOptimizedAt) {
      const total = await pool.query(
        'SELECT COUNT(*) as count FROM review_logs WHERE user_id = $1',
        [userId]
      );
      return parseInt(total.rows[0].count, 10);
    }
    const sinceMs = lastOptimizedAt.getTime();
    const result = await pool.query(
      `SELECT COUNT(*) as count FROM review_logs
       WHERE user_id = $1 AND review_time > $2`,
      [userId, sinceMs]
    );
    return parseInt(result.rows[0].count, 10);
  }

  /**
   * Eligibility status: based on actual DB counts, not stored counter.
   * - NOT_READY: total reviews < MIN_REVIEW_COUNT_FIRST (first run gate).
   * - OPTIMIZED: already ran and (new reviews < MIN_REVIEW_COUNT_SUBSEQUENT AND days since last < MIN_DAYS_SINCE_LAST_OPT).
   * - READY_TO_UPGRADE: first run with enough reviews, or subsequent with enough new reviews or days.
   * When user has never optimized, a single COUNT is used for both totalReviews and newReviewsSinceLast.
   */
  async getOptimizationEligibility(userId: string): Promise<{
    status: 'NOT_READY' | 'OPTIMIZED' | 'READY_TO_UPGRADE';
    totalReviews: number;
    newReviewsSinceLast: number;
    daysSinceLast: number;
    minRequiredFirst: number;
    minRequiredSubsequent: number;
    minDaysSinceLast: number;
    lastOptimizedAt: string | null;
    reviewCountSinceOptimization: number;
  }> {
    const settings = await this.getUserSettings(userId);
    const lastAt = settings.last_optimized_at;

    let totalReviews: number;
    let newReviewsSinceLast: number;

    if (!lastAt) {
      const totalResult = await pool.query(
        'SELECT COUNT(*) as count FROM review_logs WHERE user_id = $1',
        [userId]
      );
      totalReviews = parseInt(totalResult.rows[0].count, 10);
      newReviewsSinceLast = totalReviews;
    } else {
      const [totalResult, newSinceResult] = await Promise.all([
        pool.query('SELECT COUNT(*) as count FROM review_logs WHERE user_id = $1', [userId]),
        this.getNewReviewsSinceLast(userId, lastAt),
      ]);
      totalReviews = parseInt(totalResult.rows[0].count, 10);
      newReviewsSinceLast = newSinceResult;
    }

    const daysSinceLast = lastAt
      ? (Date.now() - lastAt.getTime()) / OPTIMIZER_CONFIG.MS_PER_DAY
      : 0;

    const minFirst = OPTIMIZER_CONFIG.MIN_REVIEW_COUNT_FIRST;
    const minSubsequent = OPTIMIZER_CONFIG.MIN_REVIEW_COUNT_SUBSEQUENT;
    const minDays = OPTIMIZER_CONFIG.MIN_DAYS_SINCE_LAST_OPT;

    let status: 'NOT_READY' | 'OPTIMIZED' | 'READY_TO_UPGRADE';
    if (totalReviews < minFirst) {
      status = 'NOT_READY';
    } else if (!lastAt) {
      status = 'READY_TO_UPGRADE';
    } else if (newReviewsSinceLast < minSubsequent && daysSinceLast < minDays) {
      status = 'OPTIMIZED';
    } else {
      status = 'READY_TO_UPGRADE';
    }

    return {
      status,
      totalReviews,
      newReviewsSinceLast,
      daysSinceLast,
      minRequiredFirst: minFirst,
      minRequiredSubsequent: minSubsequent,
      minDaysSinceLast: minDays,
      lastOptimizedAt: lastAt ? lastAt.toISOString() : null,
      reviewCountSinceOptimization: newReviewsSinceLast,
    };
  }

  /**
   * Check if user can run optimization (uses DB counts, not stored counter).
   */
  async canOptimize(userId: string): Promise<{ canOptimize: boolean; reviewCount: number; minRequired: number }> {
    const eligibility = await this.getOptimizationEligibility(userId);
    const minRequired =
      eligibility.status === 'NOT_READY'
        ? eligibility.minRequiredFirst
        : eligibility.minRequiredSubsequent;
    return {
      canOptimize: eligibility.status === 'READY_TO_UPGRADE',
      reviewCount: eligibility.totalReviews,
      minRequired,
    };
  }

  /**
   * Get user optimization metadata for display.
   * Uses actual DB count for "reviews since" (sync with reality).
   */
  async getUserOptimizationInfo(userId: string): Promise<{
    lastOptimizedAt: string | null;
    reviewCountSinceOptimization: number;
  }> {
    const settings = await this.getUserSettings(userId);
    const newSince = await this.getNewReviewsSinceLast(userId, settings.last_optimized_at);
    return {
      lastOptimizedAt: settings.last_optimized_at
        ? settings.last_optimized_at.toISOString()
        : null,
      reviewCountSinceOptimization: newSince,
    };
  }
}
