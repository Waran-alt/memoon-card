import { describe, expect, it } from 'vitest';
import {
  applyManagementPenaltyToState,
  calculateDeckManagementRiskForCards,
  calculateManagementRiskForState,
  getPreStudyCardsByRisk,
  type FsrsStateLike,
  type ManagementRiskLike,
} from '@/services/fsrs-management.utils';

describe('fsrs-management utils', () => {
  const now = new Date('2026-02-01T12:00:00.000Z');
  const ops = {
    now,
    getElapsedDays: (from: Date, to: Date) => (to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000),
    getElapsedHours: (from: Date, to: Date) => (to.getTime() - from.getTime()) / (60 * 60 * 1000),
    calculateRetrievability: (elapsedDays: number, stability: number) =>
      Math.max(0, Math.min(1, 1 - elapsedDays / Math.max(1, stability * 4))),
    addHours: (date: Date, hours: number) => new Date(date.getTime() + hours * 60 * 60 * 1000),
  };

  const state: FsrsStateLike = {
    stability: 4,
    difficulty: 5,
    lastReview: new Date('2026-01-31T12:00:00.000Z'),
    nextReview: new Date('2026-02-01T14:00:00.000Z'),
  };

  it('calculates risk shape with expected fields', () => {
    const risk = calculateManagementRiskForState(state, ops);
    expect(risk.riskPercent).toBeGreaterThanOrEqual(0);
    expect(risk.riskPercent).toBeLessThanOrEqual(100);
    expect(['low', 'medium', 'high', 'critical']).toContain(risk.riskLevel);
  });

  it('aggregates deck-level risk counts', () => {
    const stubRisk = (s: FsrsStateLike): ManagementRiskLike => ({
      cardId: '',
      riskLevel: s.stability < 3 ? 'critical' : 'low',
      riskPercent: s.stability < 3 ? 90 : 10,
      retrievability: 0.5,
      stability: s.stability,
      hoursUntilDue: 1,
      recommendedAction: s.stability < 3 ? 'avoid' : 'safe',
    });
    const deck = calculateDeckManagementRiskForCards(
      [
        { id: 'c1', state: { ...state, stability: 2 } },
        { id: 'c2', state: { ...state, stability: 6 } },
      ],
      stubRisk
    );
    expect(deck.totalCards).toBe(2);
    expect(deck.criticalCards).toBe(1);
    expect(deck.lowRiskCards).toBe(1);
  });

  it('applies management penalty only when eligible', () => {
    const config = {
      minRevealSeconds: 5,
      fuzzingHoursMin: 4,
      fuzzingHoursMax: 8,
      adaptiveFuzzing: true,
      warnBeforeManaging: true,
    };

    const unchanged = applyManagementPenaltyToState(state, 1, config, ops);
    expect(unchanged.nextReview.getTime()).toBe(state.nextReview.getTime());

    const penalized = applyManagementPenaltyToState(state, 10, config, ops);
    expect(penalized.nextReview.getTime()).toBeGreaterThan(state.nextReview.getTime());
  });

  it('returns filtered pre-study cards by risk and retention', () => {
    const riskForState = (s: FsrsStateLike): ManagementRiskLike => ({
      cardId: '',
      riskLevel: s.stability < 5 ? 'high' : 'low',
      riskPercent: s.stability < 5 ? 75 : 10,
      retrievability: 0.5,
      stability: s.stability,
      hoursUntilDue: 2,
      recommendedAction: s.stability < 5 ? 'pre-study' : 'safe',
    });
    const rows = getPreStudyCardsByRisk(
      [
        { id: 'high', state: { ...state, stability: 3 } },
        { id: 'low', state: { ...state, stability: 7 } },
      ],
      0.95,
      10,
      riskForState,
      ops
    );
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows[0].id).toBe('high');
  });
});
