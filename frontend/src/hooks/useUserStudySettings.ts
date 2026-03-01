'use client';

import { useState, useEffect } from 'react';
import apiClient from '@/lib/api';
import { STUDY_INTERVAL } from '@memoon-card/shared';

export interface StudySessionSettings {
  session_auto_end_away_minutes: number;
  learning_min_interval_minutes?: number;
}

const DEFAULT_AWAY_MINUTES = 5;
const DEFAULT_LEARNING_MIN_INTERVAL_MINUTES = STUDY_INTERVAL.MIN_INTERVAL_MINUTES;
const SETTINGS_URL = '/api/user/settings';

/**
 * Fetches user study settings (e.g. session_auto_end_away_minutes, learning_min_interval_minutes).
 * Falls back to default if API is missing or fails.
 */
export function useUserStudySettings(): {
  awayMinutes: number;
  learningMinIntervalMinutes: number;
  loading: boolean;
  error: string | null;
} {
  const [awayMinutes, setAwayMinutes] = useState(DEFAULT_AWAY_MINUTES);
  const [learningMinIntervalMinutes, setLearningMinIntervalMinutes] = useState(DEFAULT_LEARNING_MIN_INTERVAL_MINUTES);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiClient
      .get<{ success: boolean; data?: StudySessionSettings }>(SETTINGS_URL)
      .then((res) => {
        if (cancelled) return;
        const data = res.data?.data;
        if (data) {
          const min = data.session_auto_end_away_minutes;
          if (typeof min === 'number' && min >= 1 && min <= 120) {
            setAwayMinutes(min);
          }
          const learningMin = data.learning_min_interval_minutes;
          if (typeof learningMin === 'number' && learningMin >= STUDY_INTERVAL.MIN_INTERVAL_MINUTES && learningMin <= STUDY_INTERVAL.MAX_LEARNING_INTERVAL_MINUTES) {
            setLearningMinIntervalMinutes(learningMin);
          }
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAwayMinutes(DEFAULT_AWAY_MINUTES);
          setLearningMinIntervalMinutes(DEFAULT_LEARNING_MIN_INTERVAL_MINUTES);
          setError(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { awayMinutes, learningMinIntervalMinutes, loading, error };
}
