'use client';

import { useRef, useCallback, useEffect, useState } from 'react';

/** Entry for a learning-phase card that will re-enter the queue at showAgainAt. */
export interface ReinsertionEntry<T> {
  card: T;
  showAgainAt: number;
}

/** Optional cap: max times a card can be reinserted in one session (0 = no cap). */
const REINSERT_CAP_PER_CARD = 5;

/**
 * Phase 3: Silent reinsertion — learning-phase cards re-enter the study queue when their
 * Short-FSRS interval has passed. No extra UI; cards just reappear.
 *
 * @param getNow - optional clock (default Date.now)
 * @param checkIntervalMs - how often to move ready cards back into the queue (default 15s)
 */
export function useStudyReinsertion<T extends { id: string }>(
  getNow: () => number = () => Date.now(),
  checkIntervalMs: number = 15_000
) {
  const mapRef = useRef<Map<string, ReinsertionEntry<T>>>(new Map());
  const reinsertCountRef = useRef<Map<string, number>>(new Map());
  const [, setTick] = useState(0);

  /** Add a learning card to be shown again after nextReviewInMinutes. */
  const add = useCallback((card: T, nextReviewInMinutes: number) => {
    const showAgainAt = getNow() + nextReviewInMinutes * 60 * 1000;
    const count = reinsertCountRef.current.get(card.id) ?? 0;
    if (REINSERT_CAP_PER_CARD > 0 && count >= REINSERT_CAP_PER_CARD) return;
    mapRef.current.set(card.id, { card, showAgainAt });
    reinsertCountRef.current.set(card.id, count + 1);
  }, [getNow]);

  /** Remove a card from the reinsertion map (e.g. after showing it again). */
  const remove = useCallback((cardId: string) => {
    mapRef.current.delete(cardId);
  }, []);

  /** Get all entries that are ready (showAgainAt <= now), sorted by showAgainAt ascending. */
  const getReady = useCallback((): ReinsertionEntry<T>[] => {
    const now = getNow();
    const ready: ReinsertionEntry<T>[] = [];
    mapRef.current.forEach((entry) => {
      if (entry.showAgainAt <= now) ready.push(entry);
    });
    ready.sort((a, b) => a.showAgainAt - b.showAgainAt);
    return ready;
  }, [getNow]);

  /** Take one ready card from the map and return it; returns null if none ready. */
  const takeNextReady = useCallback((): T | null => {
    const ready = getReady();
    if (ready.length === 0) return null;
    const entry = ready[0];
    mapRef.current.delete(entry.card.id);
    return entry.card;
  }, [getReady]);

  /** Move all ready cards into the front of the queue at index 1 (so next card is first ready, then rest). */
  const injectReadyIntoQueue = useCallback((queue: T[]): T[] => {
    const ready = getReady();
    if (ready.length === 0) return queue;
    const idsToRemove = new Set(ready.map((e) => e.card.id));
    ready.forEach((e) => mapRef.current.delete(e.card.id));
    const rest = queue.filter((c) => !idsToRemove.has(c.id));
    const toInject = ready.map((e) => e.card);
    return [...toInject, ...rest];
  }, [getReady]);

  /** Tick to trigger a re-check (e.g. from a setInterval). Call setTick from a timer to re-run injectReadyIntoQueue in the parent. */
  const tick = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    const interval = setInterval(tick, checkIntervalMs);
    return () => clearInterval(interval);
  }, [checkIntervalMs, tick]);

  const getPendingCount = useCallback(() => mapRef.current.size, []);

  return {
    add,
    remove,
    getReady,
    takeNextReady,
    injectReadyIntoQueue,
    getPendingCount,
  };
}
