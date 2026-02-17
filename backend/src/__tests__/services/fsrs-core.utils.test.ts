import { describe, expect, it } from 'vitest';
import { FSRS_V6_DEFAULT_WEIGHTS } from '@/constants/fsrs.constants';
import {
  calculateInitialDifficultyCore,
  calculateInitialStabilityCore,
  calculateIntervalCore,
  calculateRetrievabilityCore,
  updateDifficultyCore,
  updateStabilityFailureCore,
  updateStabilitySameDayCore,
  updateStabilitySuccessCore,
} from '@/services/fsrs-core.utils';

describe('fsrs-core utils', () => {
  const weights = [...FSRS_V6_DEFAULT_WEIGHTS];

  it('calculates retrievability bounds correctly', () => {
    expect(calculateRetrievabilityCore(weights, 0, 10)).toBe(1);
    expect(calculateRetrievabilityCore(weights, 3, 0)).toBe(0);
    const shortGap = calculateRetrievabilityCore(weights, 1, 10);
    const longGap = calculateRetrievabilityCore(weights, 10, 10);
    expect(longGap).toBeLessThan(shortGap);
  });

  it('calculates initial stability and difficulty from rating', () => {
    const sAgain = calculateInitialStabilityCore(weights, 1);
    const sEasy = calculateInitialStabilityCore(weights, 4);
    expect(sAgain).toBe(weights[0]);
    expect(sEasy).toBe(weights[3]);

    const d = calculateInitialDifficultyCore(weights, 3);
    expect(d).toBeGreaterThanOrEqual(1);
    expect(d).toBeLessThanOrEqual(10);
  });

  it('updates difficulty with rating polarity', () => {
    const base = 5;
    const harder = updateDifficultyCore(weights, base, 1);
    const easier = updateDifficultyCore(weights, base, 4);
    expect(harder).toBeGreaterThan(base);
    expect(easier).toBeLessThan(base);
  });

  it('updates stability for success/failure', () => {
    const s = 8;
    const d = 5;
    const r = 0.6;
    const success = updateStabilitySuccessCore(weights, s, d, r);
    const failure = updateStabilityFailureCore(weights, s, d, r);
    expect(success).toBeGreaterThan(s);
    expect(failure).toBeLessThanOrEqual(s);
  });

  it('calculates interval and same-day adjustment', () => {
    const intervalGood = calculateIntervalCore(weights, 0.9, 10, 3);
    const intervalEasy = calculateIntervalCore(weights, 0.9, 10, 4);
    expect(intervalGood).toBeGreaterThan(0);
    expect(intervalEasy).toBeGreaterThan(intervalGood);

    const sameDay = updateStabilitySameDayCore(weights, 5, 1, 3);
    const notSameDay = updateStabilitySameDayCore(weights, 5, 48, 3);
    expect(sameDay).toBeGreaterThanOrEqual(5);
    expect(notSameDay).toBe(5);
  });
});
