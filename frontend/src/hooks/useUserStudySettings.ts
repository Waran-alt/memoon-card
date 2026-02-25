'use client';

import { useState, useEffect } from 'react';
import apiClient from '@/lib/api';

export interface StudySessionSettings {
  session_auto_end_away_minutes: number;
}

const DEFAULT_AWAY_MINUTES = 5;
const SETTINGS_URL = '/api/user/settings';

/**
 * Fetches user study settings (e.g. session_auto_end_away_minutes).
 * Falls back to default if API is missing or fails.
 */
export function useUserStudySettings(): {
  awayMinutes: number;
  loading: boolean;
  error: string | null;
} {
  const [awayMinutes, setAwayMinutes] = useState(DEFAULT_AWAY_MINUTES);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    apiClient
      .get<{ success: boolean; data?: StudySessionSettings }>(SETTINGS_URL)
      .then((res) => {
        if (cancelled) return;
        const min = res.data?.data?.session_auto_end_away_minutes;
        if (typeof min === 'number' && min >= 1 && min <= 120) {
          setAwayMinutes(min);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAwayMinutes(DEFAULT_AWAY_MINUTES);
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

  return { awayMinutes, loading, error };
}
