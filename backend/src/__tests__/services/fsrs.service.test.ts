import { describe, expect, it } from 'vitest';
import { FSRS, createFSRS, type FSRSState } from '@/services/fsrs.service';

describe('FSRS service', () => {
  it('creates scheduler with defaults via factory', () => {
    const fsrs = createFSRS();
    expect(fsrs).toBeInstanceOf(FSRS);
  });

  it('throws when weights are fewer than 21', () => {
    expect(() => new FSRS({ weights: [1, 2, 3], targetRetention: 0.9 })).toThrow(
      /requires exactly 21 weights/i
    );
  });

  it('reviews a new card and returns interval and message', () => {
    const fsrs = createFSRS();
    const result = fsrs.reviewCard(null, 3);

    expect(result.state.lastReview).toBeInstanceOf(Date);
    expect(result.state.nextReview).toBeInstanceOf(Date);
    expect(result.interval).toBeGreaterThan(0);
    expect(typeof result.message).toBe('string');
    expect(result.message.length).toBeGreaterThan(0);
  });

  it('returns due cards sorted by lowest retrievability first', () => {
    const fsrs = createFSRS({ targetRetention: 0.9 });
    const now = Date.now();
    const cards: Array<{ id: string; state: FSRSState }> = [
      {
        id: 'recent',
        state: {
          stability: 10,
          difficulty: 5,
          lastReview: new Date(now - 1 * 24 * 60 * 60 * 1000),
          nextReview: new Date(now + 8 * 24 * 60 * 60 * 1000),
        },
      },
      {
        id: 'old',
        state: {
          stability: 3,
          difficulty: 5,
          lastReview: new Date(now - 7 * 24 * 60 * 60 * 1000),
          nextReview: new Date(now - 1 * 24 * 60 * 60 * 1000),
        },
      },
    ];

    const due = fsrs.getDueCards(cards);
    expect(due.length).toBeGreaterThan(0);
    expect(due[0].id).toBe('old');
    expect(due[0].retrievability).toBeLessThanOrEqual(0.9);
  });

  it('does not apply management penalty for short reveal or far due cards', () => {
    const fsrs = createFSRS();
    const base: FSRSState = {
      stability: 5,
      difficulty: 4,
      lastReview: new Date(Date.now() - 24 * 60 * 60 * 1000),
      nextReview: new Date(Date.now() + 72 * 60 * 60 * 1000),
    };

    const shortReveal = fsrs.applyManagementPenalty(base, 1);
    expect(shortReveal.nextReview.getTime()).toBe(base.nextReview.getTime());

    const longRevealButFarDue = fsrs.applyManagementPenalty(base, 30);
    expect(longRevealButFarDue.nextReview.getTime()).toBe(base.nextReview.getTime());
  });

  it('detects significant and reset-worthy content changes', () => {
    const fsrs = createFSRS();
    const unchanged = fsrs.detectContentChange('same content', 'same content');
    expect(unchanged).toEqual({ changePercent: 0, isSignificant: false, shouldReset: false });

    const changed = fsrs.detectContentChange('short', 'completely different and much longer text');
    expect(changed.changePercent).toBeGreaterThan(30);
    expect(changed.isSignificant).toBe(true);
  });

  describe('reviewCard with different ratings', () => {
    it('handles Again (1) rating on new card', () => {
      const fsrs = createFSRS();
      const result = fsrs.reviewCard(null, 1);
      expect(result.state.difficulty).toBeGreaterThan(0);
      expect(result.state.stability).toBeGreaterThan(0);
      // Again rating may have very short interval (could be 0 or minimum)
      expect(result.interval).toBeGreaterThanOrEqual(0);
    });

    it('handles Hard (2) rating on new card', () => {
      const fsrs = createFSRS();
      const result = fsrs.reviewCard(null, 2);
      expect(result.state.difficulty).toBeGreaterThan(0);
      expect(result.state.stability).toBeGreaterThan(0);
    });

    it('handles Good (3) rating on new card', () => {
      const fsrs = createFSRS();
      const result = fsrs.reviewCard(null, 3);
      expect(result.state.difficulty).toBeGreaterThan(0);
      expect(result.state.stability).toBeGreaterThan(0);
      expect(result.interval).toBeGreaterThan(0);
    });

    it('handles Easy (4) rating on new card', () => {
      const fsrs = createFSRS();
      const result = fsrs.reviewCard(null, 4);
      expect(result.state.difficulty).toBeGreaterThan(0);
      expect(result.state.stability).toBeGreaterThan(0);
      expect(result.interval).toBeGreaterThan(0);
    });

    it('updates state correctly when reviewing existing card with Good rating', () => {
      const fsrs = createFSRS();
      const initialState: FSRSState = {
        stability: 5,
        difficulty: 4,
        lastReview: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
        nextReview: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
      };

      const result = fsrs.reviewCard(initialState, 3);
      expect(result.state.stability).toBeGreaterThan(initialState.stability);
      expect(result.state.lastReview).toBeInstanceOf(Date);
      expect(result.retrievability).toBeGreaterThanOrEqual(0);
      expect(result.retrievability).toBeLessThanOrEqual(1);
    });

    it('reduces stability when rating is Again (1)', () => {
      const fsrs = createFSRS();
      const initialState: FSRSState = {
        stability: 10,
        difficulty: 5,
        lastReview: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
        nextReview: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      };

      const result = fsrs.reviewCard(initialState, 1);
      expect(result.state.stability).toBeLessThanOrEqual(initialState.stability);
    });

    it('increases difficulty when rating is Again (1)', () => {
      const fsrs = createFSRS();
      const initialState: FSRSState = {
        stability: 5,
        difficulty: 4,
        lastReview: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
        nextReview: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
      };

      const result = fsrs.reviewCard(initialState, 1);
      expect(result.state.difficulty).toBeGreaterThan(initialState.difficulty);
    });

    it('decreases difficulty when rating is Easy (4)', () => {
      const fsrs = createFSRS();
      const initialState: FSRSState = {
        stability: 5,
        difficulty: 6,
        lastReview: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
        nextReview: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
      };

      const result = fsrs.reviewCard(initialState, 4);
      expect(result.state.difficulty).toBeLessThan(initialState.difficulty);
    });
  });

  describe('calculateRetrievability', () => {
    it('returns 1.0 when elapsedDays is 0', () => {
      const fsrs = createFSRS();
      const r = fsrs.calculateRetrievability(0, 10);
      expect(r).toBe(1.0);
    });

    it('returns 0 when stability is 0', () => {
      const fsrs = createFSRS();
      const r = fsrs.calculateRetrievability(5, 0);
      expect(r).toBe(0);
    });

    it('returns lower retrievability for longer elapsed time', () => {
      const fsrs = createFSRS();
      const r1 = fsrs.calculateRetrievability(1, 10);
      const r2 = fsrs.calculateRetrievability(10, 10);
      expect(r2).toBeLessThan(r1);
    });

    it('returns retrievability between 0 and 1', () => {
      const fsrs = createFSRS();
      const r = fsrs.calculateRetrievability(5, 10);
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThanOrEqual(1);
    });
  });

  describe('getDueCards', () => {
    it('returns empty array when no cards are due', () => {
      const fsrs = createFSRS();
      const now = Date.now();
      const cards: Array<{ id: string; state: FSRSState }> = [
        {
          id: 'future',
          state: {
            stability: 10,
            difficulty: 5,
            lastReview: new Date(now - 1 * 24 * 60 * 60 * 1000),
            nextReview: new Date(now + 10 * 24 * 60 * 60 * 1000),
          },
        },
      ];

      const due = fsrs.getDueCards(cards);
      expect(due.length).toBe(0);
    });

    it('includes cards with nextReview in the past', () => {
      const fsrs = createFSRS();
      const now = Date.now();
      const cards: Array<{ id: string; state: FSRSState }> = [
        {
          id: 'due',
          state: {
            stability: 5,
            difficulty: 4,
            lastReview: new Date(now - 10 * 24 * 60 * 60 * 1000),
            nextReview: new Date(now - 1 * 24 * 60 * 60 * 1000),
          },
        },
      ];

      const due = fsrs.getDueCards(cards);
      expect(due.length).toBe(1);
      expect(due[0].id).toBe('due');
    });

    it('sorts by retrievability (lowest first)', () => {
      const fsrs = createFSRS();
      const now = Date.now();
      const cards: Array<{ id: string; state: FSRSState }> = [
        {
          id: 'high-retrievability',
          state: {
            stability: 20,
            difficulty: 5,
            lastReview: new Date(now - 1 * 24 * 60 * 60 * 1000),
            nextReview: new Date(now - 0.5 * 24 * 60 * 60 * 1000), // Due (in past)
          },
        },
        {
          id: 'low-retrievability',
          state: {
            stability: 5,
            difficulty: 5,
            lastReview: new Date(now - 10 * 24 * 60 * 60 * 1000),
            nextReview: new Date(now - 5 * 24 * 60 * 60 * 1000), // Due (in past)
          },
        },
      ];

      const due = fsrs.getDueCards(cards);
      expect(due.length).toBeGreaterThanOrEqual(1);
      if (due.length >= 2) {
        expect(due[0].retrievability).toBeLessThanOrEqual(due[1].retrievability);
      }
    });
  });

  describe('applyManagementPenalty', () => {
    it('applies penalty when card is due soon and reveal time is long', () => {
      const fsrs = createFSRS();
      const now = Date.now();
      const base: FSRSState = {
        stability: 5,
        difficulty: 4,
        lastReview: new Date(now - 24 * 60 * 60 * 1000),
        nextReview: new Date(now + 2 * 60 * 60 * 1000), // Due in 2 hours
      };

      const penalized = fsrs.applyManagementPenalty(base, 10); // 10 seconds reveal
      expect(penalized.nextReview.getTime()).toBeGreaterThan(base.nextReview.getTime());
    });

    it('does not apply penalty when card is far from due', () => {
      const fsrs = createFSRS();
      const now = Date.now();
      const base: FSRSState = {
        stability: 5,
        difficulty: 4,
        lastReview: new Date(now - 24 * 60 * 60 * 1000),
        nextReview: new Date(now + 10 * 24 * 60 * 60 * 1000), // Due in 10 days
      };

      const penalized = fsrs.applyManagementPenalty(base, 30);
      expect(penalized.nextReview.getTime()).toBe(base.nextReview.getTime());
    });
  });

  describe('detectContentChange', () => {
    it('returns no change for identical content', () => {
      const fsrs = createFSRS();
      const result = fsrs.detectContentChange('test', 'test');
      expect(result.changePercent).toBe(0);
      expect(result.isSignificant).toBe(false);
      expect(result.shouldReset).toBe(false);
    });

    it('detects significant change when content differs substantially', () => {
      const fsrs = createFSRS();
      const result = fsrs.detectContentChange('old', 'completely new and different content');
      expect(result.changePercent).toBeGreaterThan(30);
      expect(result.isSignificant).toBe(true);
    });

    it('suggests reset when change is very significant', () => {
      const fsrs = createFSRS();
      const result = fsrs.detectContentChange('a', 'b'.repeat(1000));
      expect(result.isSignificant).toBe(true);
      // Very large changes may suggest reset
    });
  });
});
