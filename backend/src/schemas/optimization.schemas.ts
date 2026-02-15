/**
 * Optimization Validation Schemas
 */

import { z } from 'zod';

export const OptimizeWeightsSchema = z.object({
  timezone: z.string().optional(),
  dayStart: z.number().int().min(0).max(23).optional(),
  targetRetention: z.number().min(0.5).max(0.99).optional(),
});

const DaysQuerySchema = z.object({
  days: z.string().regex(/^\d+$/).transform(Number).pipe(
    z.number().int().min(7).max(180)
  ).optional(),
});

export const FsrsMetricsDailyQuerySchema = DaysQuerySchema;
export const FsrsMetricsSummaryQuerySchema = DaysQuerySchema;
export const FsrsMetricsSessionsQuerySchema = DaysQuerySchema;

export const FsrsMetricsRefreshSchema = z.object({
  days: z.number().int().min(1).max(180).optional(),
});

export const OptimizationSnapshotsQuerySchema = z.object({
  limit: z.string().regex(/^\d+$/).transform(Number).pipe(
    z.number().int().min(1).max(100)
  ).optional(),
});

export const OptimizationSnapshotVersionParamSchema = z.object({
  version: z.string().regex(/^[1-9]\d*$/),
});

export const OptimizationActivateSnapshotSchema = z.object({
  reason: z.string().trim().min(1).max(255).optional(),
}).default({});
