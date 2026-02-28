'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
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

interface StudySessionEvent {
  id: string;
  eventType: string;
  cardId: string | null;
  deckId: string | null;
  eventTime: number;
  sequenceInSession: number | null;
  payload?: Record<string, unknown>;
}

interface SessionReviewLogRow {
  cardId: string;
  rating: number;
  reviewTime: number;
  scheduledDays: number;
  elapsedDays: number;
  stabilityBefore: number | null;
  difficultyBefore: number | null;
  stabilityAfter: number | null;
  difficultyAfter: number | null;
}

interface StudySessionDetail {
  sessionId: string;
  startedAt: number | null;
  endedAt: number | null;
  events: StudySessionEvent[];
  ratings: {
    reviewCount: number;
    againCount: number;
    hardCount: number;
    goodCount: number;
    easyCount: number;
  };
  sessionReviewLogs?: SessionReviewLogRow[];
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

interface StudyHealthDashboard {
  days: number;
  authRefresh: {
    total: number;
    failures: number;
    failureRate: number;
    reuseDetected: number;
  };
  journeyConsistency: {
    level: 'healthy' | 'minor_issues' | 'needs_attention';
    mismatchRate: number;
  };
  studyApiLatency: {
    overall: {
      sampleCount: number;
      p50Ms: number | null;
      p95Ms: number | null;
      p99Ms: number | null;
    };
  };
  reviewThroughputByDay: Array<{ day: string; reviewCount: number }>;
}

function formatDateTime(ts: number | null, locale: string): string {
  if (!ts) return '-';
  return new Date(ts).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' });
}

function formatEventTime(ts: number, locale: string): string {
  return new Date(ts).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

/** Normalize event time to ms for timeline (API may send ms or seconds). */
function eventTimeToMs(ts: number): number {
  return ts < 1e12 ? ts * 1000 : ts;
}

const SESSION_EVENT_COLORS: Record<string, string> = {
  session_start: 'var(--mc-text-muted)',
  session_end: 'var(--mc-text-muted)',
  card_shown: 'var(--mc-accent-primary)',
  answer_revealed: 'var(--mc-accent-warning)',
  rating_submitted: 'var(--mc-accent-success)',
  tab_hidden: 'var(--mc-text-secondary)',
  tab_visible: 'var(--mc-text-secondary)',
};
function getSessionEventColor(eventType: string): string {
  return SESSION_EVENT_COLORS[eventType] ?? 'var(--mc-accent-primary)';
}

const REPLAY_LABEL_FALLBACKS: Record<string, string> = {
  session_start: 'Session started',
  session_end: 'Session ended',
  card_shown: 'Card shown',
  answer_revealed: 'Answer revealed',
  rating_submitted: 'Rating',
  tab_hidden: 'Tab hidden (paused)',
  tab_visible: 'Tab visible (resumed)',
};

const REPLAY_I18N_KEYS: Record<string, string> = {
  session_start: 'studyReplaySessionStart',
  session_end: 'studyReplaySessionEnd',
  card_shown: 'studyReplayCardShown',
  answer_revealed: 'studyReplayAnswerRevealed',
  rating_submitted: 'studyReplayRatingSubmitted',
  tab_hidden: 'studyReplayTabHidden',
  tab_visible: 'studyReplayTabVisible',
};

/** Human-readable label for session replay timeline (Phase 6). */
function getEventTypeLabel(eventType: string, payload?: Record<string, unknown>, ta?: (key: string) => string): string {
  const t = ta ?? ((k: string) => k);
  const key = REPLAY_I18N_KEYS[eventType];
  const translated = key ? t(key) : null;
  const label = (translated && translated !== key ? translated : null) ?? REPLAY_LABEL_FALLBACKS[eventType] ?? eventType;
  if (eventType === 'rating_submitted' && payload && typeof payload.rating === 'number') {
    const ratingLabels: Record<number, string> = { 1: t('again'), 2: t('hard'), 3: t('good'), 4: t('easy') };
    return `${label} (${ratingLabels[payload.rating] ?? payload.rating})`;
  }
  return label;
}

const LAST_STUDIED_KEY = (deckId: string) => `memoon_last_studied_${deckId}`;

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
  const router = useRouter();
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
  const { data: healthDashboard, loading: healthDashboardLoading } = useApiGet<StudyHealthDashboard>(
    '/api/study/health-dashboard?days=30',
    { errorFallback: ta('studyHealthDashboardLoadError') }
  );

  const rows = sessionHistory?.rows ?? [];
  const consistencyLevel = getConsistencyLevel(consistency ?? null);
  const consistencyClass =
    consistencyLevel === 'good'
      ? 'bg-(--mc-accent-success)/15 text-(--mc-accent-success)'
      : consistencyLevel === 'critical'
        ? 'bg-(--mc-accent-danger)/15 text-(--mc-accent-danger)'
        : 'bg-(--mc-accent-warning)/15 text-(--mc-accent-warning)';

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

  function handleManageCardsFromSession() {
    if (!selectedSession?.events?.length) return;
    const deckId = selectedSession.events.find((e) => e.deckId)?.deckId ?? null;
    const cardIds = [...new Set(selectedSession.events.map((e) => e.cardId).filter((id): id is string => !!id))];
    if (!deckId || cardIds.length === 0) return;
    try {
      if (typeof window !== 'undefined') {
        window.sessionStorage.setItem(LAST_STUDIED_KEY(deckId), JSON.stringify({ ids: cardIds, at: Date.now() }));
      }
      router.push(`/${locale}/app/decks/${deckId}`);
    } catch {
      // ignore
    }
  }

  return (
    <div className="mc-study-page mx-auto max-w-5xl space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-(--mc-text-primary)">{ta('studySessionsTitle')}</h2>
        <p className="mt-1 text-sm text-(--mc-text-secondary)">{ta('studySessionsIntro')}</p>
        <div className="mt-2">
          <Link
            href={`/${locale}/app/study-health`}
            className="text-sm font-medium text-(--mc-text-secondary) underline hover:no-underline"
          >
            {ta('viewStudyHealthDashboard')}
          </Link>
        </div>
      </div>

      <div className="mc-study-surface rounded-lg border p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-medium text-(--mc-text-primary)">{ta('journeyConsistencyTitle')}</h3>
          <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${consistencyClass}`}>
            {consistencyLevel === 'good'
              ? ta('journeyConsistencyHealthy')
              : consistencyLevel === 'critical'
                ? ta('journeyConsistencyNeedsAttention')
                : ta('journeyConsistencyMinorIssues')}
          </span>
        </div>
        {consistencyLoading ? (
          <p className="mt-2 text-sm text-(--mc-text-secondary)">{tc('loading')}</p>
        ) : consistency ? (
          <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <p>{ta('journeyReviewLogs', { vars: { count: String(consistency.totals.reviewLogs) } })}</p>
            <p>{ta('journeyRatingEvents', { vars: { count: String(consistency.totals.ratingJourneyEvents) } })}</p>
            <p>{ta('journeyMissing', { vars: { count: String(consistency.mismatches.missingRatingJourneyEvents) } })}</p>
            <p>{ta('journeyOrderingIssues', { vars: { count: String(consistency.mismatches.orderingIssues) } })}</p>
          </div>
        ) : (
          <p className="mt-2 text-sm text-(--mc-accent-warning)">{ta('journeyConsistencyUnavailable')}</p>
        )}
      </div>

      <div className="mc-study-surface rounded-lg border p-4 shadow-sm">
        <h3 className="text-sm font-medium text-(--mc-text-primary)">{ta('studyHealthDashboardTitle')}</h3>
        {healthDashboardLoading ? (
          <p className="mt-2 text-sm text-(--mc-text-secondary)">{tc('loading')}</p>
        ) : healthDashboard ? (
          <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <p>
              {ta('studyHealthRefreshFailures', {
                vars: {
                  failures: String(healthDashboard.authRefresh.failures),
                  total: String(healthDashboard.authRefresh.total),
                },
              })}
            </p>
            <p>
              {ta('studyHealthReuseDetected', {
                vars: { count: String(healthDashboard.authRefresh.reuseDetected) },
              })}
            </p>
            <p>
              {ta('studyHealthP95', {
                vars: {
                  ms:
                    healthDashboard.studyApiLatency.overall.p95Ms == null
                      ? '-'
                      : String(Math.round(healthDashboard.studyApiLatency.overall.p95Ms)),
                },
              })}
            </p>
            <p>
              {ta('studyHealthThroughputToday', {
                vars: {
                  count: String(healthDashboard.reviewThroughputByDay[0]?.reviewCount ?? 0),
                },
              })}
            </p>
          </div>
        ) : (
          <p className="mt-2 text-sm text-(--mc-accent-warning)">{ta('studyHealthDashboardUnavailable')}</p>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <section className="mc-study-surface rounded-lg border p-4 shadow-sm">
          <h3 className="mb-3 text-sm font-medium text-(--mc-text-primary)">{ta('studySessionsRecent')}</h3>
          {sessionHistoryLoading ? (
            <p className="text-sm text-(--mc-text-secondary)">{tc('loading')}</p>
          ) : sessionHistoryError ? (
            <p className="text-sm text-(--mc-accent-danger)" role="alert">
              {sessionHistoryError}
            </p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-(--mc-text-secondary)">{ta('studySessionsEmpty')}</p>
          ) : (
            <ul className="space-y-2">
              {rows.map((row) => (
                <li key={row.sessionId}>
                  <button
                    type="button"
                    onClick={() => handleSelectSession(row.sessionId)}
                    className={`w-full rounded border px-3 pt-1.5 pb-2 text-left text-sm transition-colors ${
                      selectedSessionId === row.sessionId
                        ? 'border-(--mc-accent-primary) bg-(--mc-accent-primary)/10'
                        : 'border-(--mc-border-subtle) hover:bg-(--mc-bg-card-back)'
                    }`}
                  >
                    <p className="font-medium text-(--mc-text-primary)">
                      {formatDateTime(row.startedAt, locale)}
                    </p>
                    <p className="text-xs text-(--mc-text-secondary)">
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
          <h3 className="mb-3 text-sm font-medium text-(--mc-text-primary)">{ta('studySessionDetails')}</h3>
          {!selectedSessionId ? (
            <p className="text-sm text-(--mc-text-secondary)">{ta('studySessionSelectPrompt')}</p>
          ) : sessionDetailLoading ? (
            <p className="text-sm text-(--mc-text-secondary)">{tc('loading')}</p>
          ) : sessionDetailError ? (
            <p className="text-sm text-(--mc-accent-danger)" role="alert">
              {sessionDetailError}
            </p>
          ) : selectedSession ? (
            <div className="space-y-3 text-sm">
              <p className="text-(--mc-text-secondary)">
                {ta('studySessionStartedAt', { vars: { at: formatDateTime(selectedSession.startedAt, locale) } })}
              </p>
              <p className="text-(--mc-text-secondary)">
                {ta('studySessionEndedAt', { vars: { at: formatDateTime(selectedSession.endedAt, locale) } })}
              </p>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded border border-(--mc-accent-danger)/30 bg-(--mc-accent-danger)/10 px-2 py-1">
                  {ta('again')}: {selectedSession.ratings.againCount}
                </div>
                <div className="rounded border border-(--mc-accent-warning)/30 bg-(--mc-accent-warning)/10 px-2 py-1">
                  {ta('hard')}: {selectedSession.ratings.hardCount}
                </div>
                <div className="rounded border border-(--mc-border-subtle) bg-(--mc-bg-card-back) px-2 py-1">
                  {ta('good')}: {selectedSession.ratings.goodCount}
                </div>
                <div className="rounded border border-(--mc-accent-success)/30 bg-(--mc-accent-success)/10 px-2 py-1">
                  {ta('easy')}: {selectedSession.ratings.easyCount}
                </div>
              </div>
              {selectedSession.events.length > 0 && (
                <>
                  {selectedSession.events.length >= 1 && (() => {
                    const sorted = [...selectedSession.events].sort(
                      (a, b) => eventTimeToMs(a.eventTime) - eventTimeToMs(b.eventTime)
                    );
                    const msList = sorted.map((e) => eventTimeToMs(e.eventTime));
                    const minMs = Math.min(...msList);
                    const maxMs = Math.max(...msList);
                    const span = maxMs - minMs || 1;
                    return (
                      <div className="space-y-2">
                        <h4 className="text-xs font-medium text-(--mc-text-secondary)">{ta('studySessionTimingGraphTitle')}</h4>
                        <p className="text-xs text-(--mc-text-muted)">{ta('studySessionTimingGraphHint')}</p>
                        <div className="relative w-full h-10 rounded bg-(--mc-bg-card-back) border border-(--mc-border-subtle)">
                          {sorted.map((ev) => {
                            const ms = eventTimeToMs(ev.eventTime);
                            const leftPct = ((ms - minMs) / span) * 100;
                            const label = getEventTypeLabel(ev.eventType ?? 'unknown', ev.payload, ta);
                            return (
                              <div
                                key={ev.id}
                                className="absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full border border-(--mc-bg-base) shadow-sm hover:z-10 hover:scale-125 transition-transform"
                                style={{ left: `calc(${leftPct}% - 4px)`, backgroundColor: getSessionEventColor(ev.eventType ?? '') }}
                                title={`${formatEventTime(ms, locale)} · ${label}`}
                              />
                            );
                          })}
                        </div>
                        <div className="flex justify-between text-[10px] text-(--mc-text-muted)">
                          <span>{formatEventTime(minMs, locale)}</span>
                          <span>{formatEventTime(maxMs, locale)}</span>
                        </div>
                        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-(--mc-text-secondary)">
                          {[...new Set(sorted.map((e) => e.eventType).filter(Boolean))].map((type) => (
                            <span key={type ?? 'unknown'} className="inline-flex items-center gap-1">
                              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: getSessionEventColor(type ?? '') }} /> {type}
                            </span>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                  <div className="space-y-1">
                  <h4 className="text-xs font-medium text-(--mc-text-secondary)">{ta('studySessionReplayTitle')}</h4>
                  <ul className="max-h-48 space-y-1 overflow-y-auto rounded border border-(--mc-border-subtle) bg-(--mc-bg-card-back) p-2 text-xs">
                    {(() => {
                      const sortedEvents = [...selectedSession.events].sort(
                        (a, b) => (a.eventTime ?? 0) - (b.eventTime ?? 0) || (a.sequenceInSession ?? 0) - (b.sequenceInSession ?? 0) || String(a.id).localeCompare(String(b.id))
                      );
                      const cardIdToNumber = new Map<string, number>();
                      let nextNum = 1;
                      for (const ev of sortedEvents) {
                        if (ev.cardId && !cardIdToNumber.has(ev.cardId)) {
                          cardIdToNumber.set(ev.cardId, nextNum++);
                        }
                      }
                      const sessionLogs = selectedSession.sessionReviewLogs ?? [];
                      let reviewLogIndex = 0;
                      return sortedEvents.map((ev) => {
                        const isRating = ev.eventType === 'rating_submitted';
                        const log = isRating ? sessionLogs[reviewLogIndex++] : null;
                        const cardNum = ev.cardId ? cardIdToNumber.get(ev.cardId) ?? '' : '';
                        const stabilityStr = log
                          ? ta('stabilityBeforeAfter', {
                              vars: {
                                before: log.stabilityBefore != null ? log.stabilityBefore.toFixed(2) : '—',
                                after: log.stabilityAfter != null ? log.stabilityAfter.toFixed(2) : '—',
                              },
                            })
                          : null;
                        const difficultyStr = log
                          ? ta('difficultyBeforeAfter', {
                              vars: {
                                before: log.difficultyBefore != null ? log.difficultyBefore.toFixed(1) : '—',
                                after: log.difficultyAfter != null ? log.difficultyAfter.toFixed(1) : '—',
                              },
                            })
                          : null;
                        return (
                          <li key={ev.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 border-b border-(--mc-border-subtle)/50 py-1 last:border-0">
                            <span className="shrink-0 text-(--mc-text-secondary)">
                              {ev.eventTime != null ? formatEventTime(ev.eventTime, locale) : '—'}
                            </span>
                            <span className="text-(--mc-text-primary)">{getEventTypeLabel(ev.eventType ?? 'unknown', ev.payload, ta)}</span>
                            {ev.cardId && (
                              <span className="text-(--mc-text-secondary)" title={ev.cardId}>
                                {ta('studySessionCardNumber', { vars: { n: String(cardNum) } })}
                              </span>
                            )}
                            {(stabilityStr ?? difficultyStr) && (
                              <span className="text-[10px] text-(--mc-text-muted)">
                                {[stabilityStr, difficultyStr].filter(Boolean).join(' · ')}
                              </span>
                            )}
                          </li>
                        );
                      });
                    })()}
                  </ul>
                </div>
                </>
              )}
              <p className="text-xs text-(--mc-text-secondary)">
                {ta('studySessionEventsShown', { vars: { count: String(selectedSession.events.length) } })}
              </p>
              <button
                type="button"
                onClick={handleManageCardsFromSession}
                className="mt-3 w-full rounded border border-(--mc-accent-primary) bg-(--mc-accent-primary)/10 px-3 pt-1.5 pb-2 text-sm font-medium text-(--mc-accent-primary) hover:bg-(--mc-accent-primary)/20"
              >
                {ta('manageCardsFromSession')}
              </button>
            </div>
          ) : (
            <p className="text-sm text-(--mc-text-secondary)">{ta('studySessionNotFound')}</p>
          )}
        </section>
      </div>
    </div>
  );
}
