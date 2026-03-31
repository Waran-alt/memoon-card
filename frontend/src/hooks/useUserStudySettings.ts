'use client';

import { useState, useEffect } from 'react';
import apiClient from '@/lib/api';
import { STUDY_INTERVAL } from '@memoon-card/shared';

export interface StudySessionSettings {
  learning_min_interval_minutes?: number;
}

const DEFAULT_LEARNING_MIN_INTERVAL_MINUTES = STUDY_INTERVAL.MIN_INTERVAL_MINUTES;
const SETTINGS_URL = '/api/user/settings';

/**
 * GET /api/user/settings (credentials). Clamps learning_min_interval to STUDY_INTERVAL from shared; ignores out-of-range values.
 */
export function useUserStudySettings(): {
  learningMinIntervalMinutes: number;
  loading: boolean;
  error: string | null;
} {
  const [learningMinIntervalMinutes, setLearningMinIntervalMinutes] = useState<number>(
    DEFAULT_LEARNING_MIN_INTERVAL_MINUTES
  );
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
          const learningMin = data.learning_min_interval_minutes;
          if (
            typeof learningMin === 'number' &&
            learningMin >= STUDY_INTERVAL.MIN_INTERVAL_MINUTES &&
            learningMin <= STUDY_INTERVAL.MAX_LEARNING_INTERVAL_MINUTES
          ) {
            setLearningMinIntervalMinutes(learningMin);
          }
        }
      })
      .catch(() => {
        if (!cancelled) {
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

  return { learningMinIntervalMinutes, loading, error };
}
