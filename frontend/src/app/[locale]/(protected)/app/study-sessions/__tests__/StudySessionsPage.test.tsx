import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@/test-utils';
import userEvent from '@testing-library/user-event';
import StudySessionsPage from '../page';

const mockApiGet = vi.hoisted(() => vi.fn());
const mockRawGet = vi.hoisted(() => vi.fn());

vi.mock('i18n', async (importOriginal) => {
  const actual = await importOriginal<typeof import('i18n')>();
  return { ...actual, useLocale: () => ({ locale: 'en' }) };
});

vi.mock('@/hooks/useApiGet', () => ({
  useApiGet: mockApiGet,
}));

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { vars?: Record<string, string> }) => {
      const v = opts?.vars ?? {};
      const map: Record<string, string> = {
        loading: 'Loading…',
        invalidResponse: 'Invalid response',
        studySessionsTitle: 'Study sessions',
        studySessionsIntro: 'Review your recent session history and data consistency health.',
        journeyConsistencyTitle: 'Journey consistency',
        journeyConsistencyHealthy: 'Healthy',
        journeyConsistencyMinorIssues: 'Minor issues',
        journeyConsistencyNeedsAttention: 'Needs attention',
        journeyConsistencyUnavailable: 'Consistency report unavailable.',
        journeyReviewLogs: `Review logs: ${v.count ?? ''}`,
        journeyRatingEvents: `Journey ratings: ${v.count ?? ''}`,
        journeyMissing: `Missing links: ${v.count ?? ''}`,
        journeyOrderingIssues: `Ordering issues: ${v.count ?? ''}`,
        studySessionsRecent: 'Recent sessions',
        studySessionsEmpty: 'No recent sessions yet.',
        studySessionsLoadError: 'Failed to load study sessions.',
        studySessionSummary: `${v.reviews ?? '?'} reviews · ${v.cards ?? '?'} cards · ${v.events ?? '?'} events`,
        studySessionDetails: 'Session details',
        studySessionSelectPrompt: 'Select a session to inspect details.',
        studySessionDetailLoadError: 'Failed to load session details.',
        studySessionNotFound: 'Session details unavailable.',
        studySessionStartedAt: `Started: ${v.at ?? ''}`,
        studySessionEndedAt: `Ended: ${v.at ?? ''}`,
        studySessionEventsShown: `Showing ${v.count ?? ''} events from this session.`,
        again: 'Again',
        hard: 'Hard',
        good: 'Good',
        easy: 'Easy',
      };
      return map[key] ?? key;
    },
  }),
}));

vi.mock('@/lib/api', () => ({
  default: { get: mockRawGet },
  getApiErrorMessage: (_err: unknown, fallback: string) => fallback,
  isRequestCancelled: () => false,
}));

describe('StudySessionsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiGet.mockImplementation((url: string) => {
      if (url.startsWith('/api/study/sessions')) {
        return {
          data: {
            days: 30,
            limit: 50,
            offset: 0,
            rows: [
              {
                sessionId: '22222222-2222-4222-8222-222222222222',
                startedAt: 1700000000000,
                endedAt: 1700000300000,
                eventCount: 12,
                distinctCardCount: 4,
                reviewCount: 6,
                againCount: 1,
                hardCount: 1,
                goodCount: 3,
                easyCount: 1,
              },
            ],
          },
          loading: false,
          error: '',
          refetch: vi.fn(),
        };
      }
      return {
        data: {
          days: 30,
          totals: {
            reviewLogs: 20,
            ratingJourneyEvents: 20,
            duplicateRatingJourneyGroups: 0,
            orderingIssues: 0,
          },
          mismatches: {
            missingRatingJourneyEvents: 0,
            duplicateRatingJourneyEvents: 0,
            orderingIssues: 0,
          },
        },
        loading: false,
        error: '',
        refetch: vi.fn(),
      };
    });
  });

  it('renders sessions and consistency section', async () => {
    render(<StudySessionsPage />);
    expect(screen.getByRole('heading', { name: 'Study sessions' })).toBeInTheDocument();
    expect(screen.getByText('Journey consistency')).toBeInTheDocument();
    expect(screen.getByText('Healthy')).toBeInTheDocument();
    expect(screen.getByText('Recent sessions')).toBeInTheDocument();
    expect(screen.getByText('6 reviews · 4 cards · 12 events')).toBeInTheDocument();
  });

  it('loads and shows selected session details', async () => {
    mockRawGet.mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          sessionId: '22222222-2222-4222-8222-222222222222',
          startedAt: 1700000000000,
          endedAt: 1700000300000,
          events: [{ id: 'e1' }],
          ratings: {
            reviewCount: 6,
            againCount: 1,
            hardCount: 1,
            goodCount: 3,
            easyCount: 1,
          },
        },
      },
    });

    render(<StudySessionsPage />);
    await userEvent.click(screen.getByRole('button', { name: /6 reviews · 4 cards · 12 events/i }));
    await waitFor(() => {
      expect(mockRawGet).toHaveBeenCalledWith(
        '/api/study/sessions/22222222-2222-4222-8222-222222222222?eventLimit=200'
      );
    });
    await waitFor(() => {
      expect(screen.getByText('Showing 1 events from this session.')).toBeInTheDocument();
    });
  });
});
