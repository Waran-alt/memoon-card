import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@/test-utils';
import userEvent from '@testing-library/user-event';
import OptimizerPage from '../page';

const mockPost = vi.hoisted(() => vi.fn());
const mockRefetch = vi.hoisted(() => vi.fn());

vi.mock('i18n', async (importOriginal) => {
  const actual = await importOriginal<typeof import('i18n')>();
  return { ...actual, useLocale: () => ({ locale: 'en' }) };
});

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { vars?: Record<string, string> }) => {
      const v = opts?.vars ?? {};
      const map: Record<string, string> = {
        invalidResponse: 'Invalid response',
        loading: 'Loading…',
        optimizerStatus: 'Optimizer status',
        optimizerIntro: 'Personalize FSRS weights.',
        optimizerStatusNotReady: 'Not enough data yet',
        optimizerStatusOptimized: 'Up to date',
        optimizerStatusReadyToUpgrade: 'Ready to upgrade',
        optimizerAvailable: 'Optimizer available',
        optimizerNotAvailable: 'Optimizer not available',
        optimizerInstallHint: 'Install with: pipx install fsrs-optimizer',
        reviewsCount: `${v.count ?? '{{count}}'} reviews`,
        optimizerFirstRunHint: `First run needs ${v.min ?? '{{min}}'} total reviews.`,
        optimizerSubsequentHint: `Next run: ${v.min ?? '{{min}}'} new reviews or ${v.days ?? '{{days}}'} days.`,
        lastOptimizedAt: `Last run: ${v.date ?? '{{date}}'}`,
        neverOptimized: 'Never run',
        since: 'since',
        runOptimizer: 'Run optimizer',
        runningOptimizer: 'Running…',
        optimizerSuccess: 'Weights updated successfully.',
        optimizerError: 'Optimization failed.',
        notEnoughReviews: `Need ${v.min ?? '{{min}}'}, have ${v.count ?? '{{count}}'}.`,
      };
      return map[key] ?? key;
    },
  }),
}));

vi.mock('@/hooks/useApiGet', () => ({
  useApiGet: vi.fn(() => ({
    data: null,
    loading: true,
    error: '',
    refetch: mockRefetch,
  })),
}));

vi.mock('@/lib/api', () => ({
  default: { get: vi.fn(), post: mockPost },
  getApiErrorMessage: (_err: unknown, fallback: string) => fallback,
  isRequestCancelled: () => false,
}));

import { useApiGet } from '@/hooks/useApiGet';

const statusData = {
  optimizerAvailable: true,
  canOptimize: false,
  reviewCount: 100,
  minRequired: 400,
  status: 'NOT_READY' as const,
  newReviewsSinceLast: 100,
  daysSinceLast: 0,
  minRequiredFirst: 400,
  minRequiredSubsequent: 200,
  minDaysSinceLast: 14,
  lastOptimizedAt: null as string | null,
  reviewCountSinceOptimization: 100,
};

describe('OptimizerPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useApiGet).mockReturnValue({
      data: null,
      loading: true,
      error: '',
      refetch: mockRefetch,
    });
  });

  it('shows loading state while status is loading', () => {
    render(<OptimizerPage />);
    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });

  it('shows error when status fails', () => {
    vi.mocked(useApiGet).mockReturnValue({
      data: null,
      loading: false,
      error: 'Network error',
      refetch: mockRefetch,
    });
    render(<OptimizerPage />);
    expect(screen.getByRole('alert')).toHaveTextContent('Network error');
  });

  it('renders status and disables run when canOptimize is false', async () => {
    vi.mocked(useApiGet).mockReturnValue({
      data: statusData,
      loading: false,
      error: '',
      refetch: mockRefetch,
    });
    render(<OptimizerPage />);
    await waitFor(() => {
      expect(screen.getByText('Optimizer status')).toBeInTheDocument();
    });
    expect(screen.getAllByText('Not enough data yet').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/First run needs 400 total reviews\./)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Run optimizer' })).toBeDisabled();
  });

  it('enables run when canOptimize and shows success on POST success', async () => {
    vi.mocked(useApiGet).mockReturnValue({
      data: { ...statusData, canOptimize: true, status: 'READY_TO_UPGRADE' },
      loading: false,
      error: '',
      refetch: mockRefetch,
    });
    mockPost.mockResolvedValueOnce({ data: { success: true, data: { message: 'OK' } } });
    render(<OptimizerPage />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Run optimizer' })).not.toBeDisabled();
    });
    await userEvent.click(screen.getByRole('button', { name: 'Run optimizer' }));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Weights updated successfully.');
    });
    expect(mockRefetch).toHaveBeenCalled();
  });

  it('shows error message when optimize POST fails', async () => {
    vi.mocked(useApiGet).mockReturnValue({
      data: { ...statusData, canOptimize: true, status: 'READY_TO_UPGRADE' },
      loading: false,
      error: '',
      refetch: mockRefetch,
    });
    mockPost.mockRejectedValueOnce({ response: { data: { error: 'Optimizer crashed' } } });
    render(<OptimizerPage />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Run optimizer' })).not.toBeDisabled();
    });
    await userEvent.click(screen.getByRole('button', { name: 'Run optimizer' }));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Optimizer crashed');
    });
  });
});
