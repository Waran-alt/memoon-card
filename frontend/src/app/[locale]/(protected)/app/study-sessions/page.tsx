'use client';

import { useState } from 'react';
import { useLocale } from 'i18n';
import { useApiGet } from '@/hooks/useApiGet';
import apiClient, { getApiErrorMessage } from '@/lib/api';
import { useTranslation } from '@/hooks/useTranslation';

interface StudySessionSummary {
  sessionId: string;
  startedAt: number | null;
  endedAt: number | null;
  eventCount: number;
  distinctCardCount: number;
  reviewCount: number;
  againCount: number;
  hardCount: number;
  goodCount: number;
  easyCount: number;
}

interface StudySessionDetail {
  sessionId: string;
  startedAt: number | null;
  endedAt: number | null;
  events: Array<{
    id: string;
    eventType: string;
    cardId: string | null;
    deckId: string | null;
    eventTime: number;
    sequenceInSession: number | null;
  }>;
  ratings: {
    reviewCount: number;
    againCount: number;
    hardCount: number;
    goodCount: number;
    easyCount: number;
  };
}

interface SessionHistoryResponse {
  days: number;
  limit: number;
  offset: number;
  rows: StudySessionSummary[];
}

interface JourneyConsistencyReport {
  days: number;
  totals: {
    reviewLogs: number;
    ratingJourneyEvents: number;
    duplicateRatingJourneyGroups: number;
    orderingIssues: number;
  };
  mismatches: {
    missingRatingJourneyEvents: number;
    duplicateRatingJourneyEvents: number;
    orderingIssues: number;
  };
}

function formatDateTime(ts: number | null, locale: string): string {
  if (!ts) return '-';
  return new Date(ts).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' });
}

function getConsistencyLevel(report: JourneyConsistencyReport | null): 'good' | 'warning' | 'critical' {
  if (!report) return 'warning';
  const missing = report.mismatches.missingRatingJourneyEvents;
  const duplicates = report.mismatches.duplicateRatingJourneyEvents;
  const ordering = report.mismatches.orderingIssues;
  if (missing === 0 && duplicates === 0 && ordering === 0) return 'good';
  if (missing > 5 || duplicates > 0 || ordering > 0) return 'critical';
  return 'warning';
}

export default function StudySessionsPage() {
  const { locale } = useLocale();
  const { t: tc } = useTranslation('common', locale);
  const { t: ta } = useTranslation('app', locale);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [selectedSession, setSelectedSession] = useState<StudySessionDetail | null>(null);
  const [sessionDetailLoading, setSessionDetailLoading] = useState(false);
  const [sessionDetailError, setSessionDetailError] = useState('');

  const {
    data: sessionHistory,
    loading: sessionHistoryLoading,
    error: sessionHistoryError,
  } = useApiGet<SessionHistoryResponse>('/api/study/sessions?days=30&limit=50', {
    errorFallback: ta('studySessionsLoadError'),
  });

  const { data: consistency, loading: consistencyLoading } = useApiGet<JourneyConsistencyReport>(
    '/api/study/journey-consistency?days=30&sampleLimit=10',
    { errorFallback: ta('journeyConsistencyLoadError') }
  );

  const rows = sessionHistory?.rows ?? [];
  const consistencyLevel = getConsistencyLevel(consistency ?? null);
  const consistencyClass =
    consistencyLevel === 'good'
      ? 'bg-[var(--mc-accent-success)]/15 text-[var(--mc-accent-success)]'
      : consistencyLevel === 'critical'
        ? 'bg-[var(--mc-accent-danger)]/15 text-[var(--mc-accent-danger)]'
        : 'bg-[var(--mc-accent-warning)]/15 text-[var(--mc-accent-warning)]';

  async function handleSelectSession(sessionId: string) {
    if (selectedSessionId === sessionId && selectedSession) return;
    setSelectedSessionId(sessionId);
    setSessionDetailLoading(true);
    setSessionDetailError('');
    try {
      const res = await apiClient.get<{ success: boolean; data?: StudySessionDetail }>(
        `/api/study/sessions/${sessionId}?eventLimit=200`
      );
      if (res.data?.success && res.data.data) {
        setSelectedSession(res.data.data);
      } else {
        setSelectedSession(null);
        setSessionDetailError(tc('invalidResponse'));
      }
    } catch (error) {
      setSelectedSession(null);
      setSessionDetailError(getApiErrorMessage(error, ta('studySessionDetailLoadError')));
    } finally {
      setSessionDetailLoading(false);
    }
  }

  return (
    <div className="mc-study-page mx-auto max-w-5xl space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-[var(--mc-text-primary)]">{ta('studySessionsTitle')}</h2>
        <p className="mt-1 text-sm text-[var(--mc-text-secondary)]">{ta('studySessionsIntro')}</p>
      </div>

      <div className="mc-study-surface rounded-lg border p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-medium text-[var(--mc-text-primary)]">{ta('journeyConsistencyTitle')}</h3>
          <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${consistencyClass}`}>
            {consistencyLevel === 'good'
              ? ta('journeyConsistencyHealthy')
              : consistencyLevel === 'critical'
                ? ta('journeyConsistencyNeedsAttention')
                : ta('journeyConsistencyMinorIssues')}
          </span>
        </div>
        {consistencyLoading ? (
          <p className="mt-2 text-sm text-[var(--mc-text-secondary)]">{tc('loading')}</p>
        ) : consistency ? (
          <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <p>{ta('journeyReviewLogs', { vars: { count: String(consistency.totals.reviewLogs) } })}</p>
            <p>{ta('journeyRatingEvents', { vars: { count: String(consistency.totals.ratingJourneyEvents) } })}</p>
            <p>{ta('journeyMissing', { vars: { count: String(consistency.mismatches.missingRatingJourneyEvents) } })}</p>
            <p>{ta('journeyOrderingIssues', { vars: { count: String(consistency.mismatches.orderingIssues) } })}</p>
          </div>
        ) : (
          <p className="mt-2 text-sm text-[var(--mc-accent-warning)]">{ta('journeyConsistencyUnavailable')}</p>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <section className="mc-study-surface rounded-lg border p-4 shadow-sm">
          <h3 className="mb-3 text-sm font-medium text-[var(--mc-text-primary)]">{ta('studySessionsRecent')}</h3>
          {sessionHistoryLoading ? (
            <p className="text-sm text-[var(--mc-text-secondary)]">{tc('loading')}</p>
          ) : sessionHistoryError ? (
            <p className="text-sm text-[var(--mc-accent-danger)]" role="alert">
              {sessionHistoryError}
            </p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-[var(--mc-text-secondary)]">{ta('studySessionsEmpty')}</p>
          ) : (
            <ul className="space-y-2">
              {rows.map((row) => (
                <li key={row.sessionId}>
                  <button
                    type="button"
                    onClick={() => handleSelectSession(row.sessionId)}
                    className={`w-full rounded border px-3 py-2 text-left text-sm transition-colors ${
                      selectedSessionId === row.sessionId
                        ? 'border-[var(--mc-accent-primary)] bg-[var(--mc-accent-primary)]/10'
                        : 'border-[var(--mc-border-subtle)] hover:bg-[var(--mc-bg-card-back)]'
                    }`}
                  >
                    <p className="font-medium text-[var(--mc-text-primary)]">
                      {formatDateTime(row.startedAt, locale)}
                    </p>
                    <p className="text-xs text-[var(--mc-text-secondary)]">
                      {ta('studySessionSummary', {
                        vars: {
                          reviews: String(row.reviewCount),
                          cards: String(row.distinctCardCount),
                          events: String(row.eventCount),
                        },
                      })}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mc-study-surface rounded-lg border p-4 shadow-sm">
          <h3 className="mb-3 text-sm font-medium text-[var(--mc-text-primary)]">{ta('studySessionDetails')}</h3>
          {!selectedSessionId ? (
            <p className="text-sm text-[var(--mc-text-secondary)]">{ta('studySessionSelectPrompt')}</p>
          ) : sessionDetailLoading ? (
            <p className="text-sm text-[var(--mc-text-secondary)]">{tc('loading')}</p>
          ) : sessionDetailError ? (
            <p className="text-sm text-[var(--mc-accent-danger)]" role="alert">
              {sessionDetailError}
            </p>
          ) : selectedSession ? (
            <div className="space-y-3 text-sm">
              <p className="text-[var(--mc-text-secondary)]">
                {ta('studySessionStartedAt', { vars: { at: formatDateTime(selectedSession.startedAt, locale) } })}
              </p>
              <p className="text-[var(--mc-text-secondary)]">
                {ta('studySessionEndedAt', { vars: { at: formatDateTime(selectedSession.endedAt, locale) } })}
              </p>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded border border-[var(--mc-accent-danger)]/30 bg-[var(--mc-accent-danger)]/10 px-2 py-1">
                  {ta('again')}: {selectedSession.ratings.againCount}
                </div>
                <div className="rounded border border-[var(--mc-accent-warning)]/30 bg-[var(--mc-accent-warning)]/10 px-2 py-1">
                  {ta('hard')}: {selectedSession.ratings.hardCount}
                </div>
                <div className="rounded border border-[var(--mc-border-subtle)] bg-[var(--mc-bg-card-back)] px-2 py-1">
                  {ta('good')}: {selectedSession.ratings.goodCount}
                </div>
                <div className="rounded border border-[var(--mc-accent-success)]/30 bg-[var(--mc-accent-success)]/10 px-2 py-1">
                  {ta('easy')}: {selectedSession.ratings.easyCount}
                </div>
              </div>
              <p className="text-xs text-[var(--mc-text-secondary)]">
                {ta('studySessionEventsShown', { vars: { count: String(selectedSession.events.length) } })}
              </p>
            </div>
          ) : (
            <p className="text-sm text-[var(--mc-text-secondary)]">{ta('studySessionNotFound')}</p>
          )}
        </section>
      </div>
    </div>
  );
}
