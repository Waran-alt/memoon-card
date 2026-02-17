import { FSRS_CONSTANTS } from '@/constants/fsrs.constants';
import type { Rating } from '@/services/fsrs.service';

function clampDifficulty(value: number): number {
  return Math.max(FSRS_CONSTANTS.DIFFICULTY.MIN, Math.min(FSRS_CONSTANTS.DIFFICULTY.MAX, value));
}

export function calculateRetrievabilityCore(
  weights: number[],
  elapsedDays: number,
  stability: number
): number {
  if (stability <= 0) return 0;
  if (elapsedDays <= 0) return 1;
  const w20 = weights[20];
  const factor = Math.pow(0.9, -1 / w20) - 1;
  return Math.pow(1 + factor * (elapsedDays / stability), -w20);
}

export function calculateInitialStabilityCore(weights: number[], rating: Rating): number {
  return weights[rating - 1];
}

export function calculateInitialDifficultyCore(weights: number[], rating: Rating): number {
  const w4 = weights[4];
  const w5 = weights[5];
  return clampDifficulty(w4 - Math.exp(w5 * (rating - 1)) + 1);
}

export function updateDifficultyCore(
  weights: number[],
  currentDifficulty: number,
  rating: Rating
): number {
  const w6 = weights[6];
  const w7 = weights[7];
  const w4 = weights[4];
  const w5 = weights[5];
  const deltaD = -w6 * (rating - 3);
  const dPrime = currentDifficulty + (deltaD * (10 - currentDifficulty)) / 9;
  const d0Easy = w4 - Math.exp(w5 * 3) + 1;
  return clampDifficulty(w7 * d0Easy + (1 - w7) * dPrime);
}

export function updateStabilitySuccessCore(
  weights: number[],
  currentStability: number,
  difficulty: number,
  retrievability: number
): number {
  const w8 = weights[8];
  const w9 = weights[9];
  const w10 = weights[10];
  const growthFactor =
    1 +
    Math.exp(w8) *
      (11 - difficulty) *
      Math.pow(currentStability, -w9) *
      (Math.exp(w10 * (1 - retrievability)) - 1);
  return currentStability * growthFactor;
}

export function updateStabilityFailureCore(
  weights: number[],
  currentStability: number,
  difficulty: number,
  retrievability: number
): number {
  const w11 = weights[11];
  const w12 = weights[12];
  const w13 = weights[13];
  const w14 = weights[14];
  const newStability =
    w11 *
    Math.pow(difficulty, -w12) *
    (Math.pow(currentStability + 1, w13) - 1) *
    Math.exp(w14 * (1 - retrievability));
  return Math.min(newStability, currentStability);
}

export function calculateIntervalCore(
  weights: number[],
  targetRetention: number,
  stability: number,
  rating: Rating
): number {
  let interval = (stability / FSRS_CONSTANTS.LN_09) * Math.log(targetRetention);
  if (rating === 2) {
    interval *= weights[15];
  } else if (rating === 4) {
    interval *= weights[16];
  }
  return Math.max(FSRS_CONSTANTS.MIN_INTERVAL_DAYS, interval);
}

export function updateStabilitySameDayCore(
  weights: number[],
  currentStability: number,
  elapsedHours: number,
  rating: Rating
): number {
  if (elapsedHours >= FSRS_CONSTANTS.SAME_DAY.THRESHOLD_HOURS) {
    return currentStability;
  }
  const w17 = weights[17];
  const w18 = weights[18];
  const w19 = weights[19];
  const sInc = Math.exp(w17 * (rating - 3 + w18)) * Math.pow(currentStability, -w19);
  const finalSInc = rating >= 3 ? Math.max(1, sInc) : sInc;
  return currentStability * finalSInc;
}
