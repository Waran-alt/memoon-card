import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@/test-utils';
import userEvent from '@testing-library/user-event';
import StudyPage from '../page';
import type { Deck, Card } from '@/types';
import { useConnectionSyncStore } from '@/store/connectionSync.store';

vi.mock('@memoon-card/shared', () => ({
  STUDY_INTERVAL: { MIN_INTERVAL_MINUTES: 1, MAX_LEARNING_INTERVAL_MINUTES: 120 },
  VALIDATION_LIMITS: { CARD_CONTENT_MAX: 5000, CARD_COMMENT_MAX: 2000 },
}));

const mockGet = vi.hoisted(() => vi.fn());
const mockPost = vi.hoisted(() => vi.fn());
const mockReplace = vi.fn();
const mockPush = vi.fn();
// Allow missing id in one test to verify redirect
const useParams = vi.fn<() => { id?: string }>(() => ({ id: 'deck-123' }));

vi.mock('next/navigation', () => ({
  useParams: () => useParams(),
  useRouter: vi.fn(() => ({ replace: mockReplace, push: mockPush })),
  useSearchParams: vi.fn(() => new URLSearchParams()),
}));

vi.mock('@/lib/api', () => ({
  default: { get: mockGet, post: mockPost },
  getApiErrorMessage: (_err: unknown, fallback: string) => fallback,
  isRequestCancelled: () => false,
}));

const mockDeck: Deck = {
  id: 'deck-123',
  user_id: 'user-1',
  title: 'My Deck',
  description: null,
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
};

const mockCard: Card = {
  id: 'card-1',
  user_id: 'user-1',
  deck_id: 'deck-123',
  recto: 'What is 2+2?',
  verso: '4',
  comment: null,
  recto_image: null,
  verso_image: null,
  recto_formula: false,
  verso_formula: false,
  reverse: true,
  stability: null,
  difficulty: null,
  last_review: null,
  next_review: '2025-01-01T00:00:00Z',
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
};

function defaultGetImpl(url: string) {
  if (url === '/api/user/settings') {
    return Promise.resolve({ data: { success: true, data: { learning_min_interval_minutes: 1 } } });
  }
  if (url.includes('/cards/study')) return Promise.resolve({ data: { success: true, data: [] } });
  if (url === '/api/decks/deck-123') return Promise.resolve({ data: { success: true, data: mockDeck } });
  return Promise.resolve({ data: { success: true, data: mockDeck } });
}

async function clickShowQuestion() {
  await waitFor(() => {
    expect(screen.getByRole('button', { name: /Show question/i })).toBeInTheDocument();
  });
  await userEvent.click(screen.getByRole('button', { name: /Show question/i }));
}

describe('StudyPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useConnectionSyncStore.setState({ hadFailure: false, pendingCount: 0 });
    useParams.mockReturnValue({ id: 'deck-123' });
    mockGet.mockImplementation(defaultGetImpl);
    mockPost.mockResolvedValue({ data: { success: true } });
  });

  it('shows loading then no cards when due and new are empty', async () => {
    render(<StudyPage />);
    expect(screen.getByText(/Loading…/)).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText(/No cards to study right now/)).toBeInTheDocument();
    });
    const backButtons = screen.getAllByRole('button', { name: /Back to deck/ });
    expect(backButtons.length).toBeGreaterThanOrEqual(1);
    await userEvent.click(backButtons[0]);
    expect(mockPush).toHaveBeenCalledWith('/en/app/decks/deck-123');
  });

  it('calls settings, deck, and cards/study endpoints', async () => {
    render(<StudyPage />);
    await waitFor(() => {
      expect(screen.getByText(/No cards to study right now/)).toBeInTheDocument();
    });
    const urls = (mockGet as ReturnType<typeof vi.fn>).mock.calls.map((c: unknown[]) => c[0]);
    expect(urls.some((u) => String(u).includes('/api/user/settings'))).toBe(true);
    expect(urls.some((u) => String(u) === '/api/decks/deck-123')).toBe(true);
    expect(urls.some((u) => String(u).includes('/api/decks/deck-123/cards/study'))).toBe(true);
  });

  it('shows deck not found when deck API returns no data', async () => {
    mockGet.mockImplementation((url: string) => {
      if (url === '/api/user/settings') return Promise.resolve({ data: { success: true, data: { learning_min_interval_minutes: 1 } } });
      if (url === '/api/decks/deck-123') return Promise.resolve({ data: { success: true, data: undefined } });
      if (url.includes('/cards/study')) return Promise.resolve({ data: { success: true, data: [] } });
      return Promise.resolve({ data: { success: true, data: null } });
    });
    render(<StudyPage />);
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Deck not found');
    });
    expect(screen.getByRole('link', { name: /Back to decks/ })).toHaveAttribute('href', '/en/app');
  });

  it('shows load error when fetch fails', async () => {
    mockGet.mockRejectedValue(new Error('Network error'));
    render(<StudyPage />);
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Failed to load cards');
    });
  });

  it('redirects to /app when id is missing', () => {
    useParams.mockReturnValue({});
    render(<StudyPage />);
    expect(mockReplace).toHaveBeenCalledWith('/en/app');
  });

  it('shows card recto and Show answer, then verso and rating buttons', async () => {
    mockGet.mockImplementation((url: string) => {
      if (url === '/api/user/settings') return Promise.resolve({ data: { success: true, data: { learning_min_interval_minutes: 1 } } });
      if (url.includes('/cards/study')) return Promise.resolve({ data: { success: true, data: [mockCard] } });
      if (url === '/api/decks/deck-123') return Promise.resolve({ data: { success: true, data: mockDeck } });
      return Promise.resolve({ data: { success: true, data: mockDeck } });
    });
    render(<StudyPage />);
    await clickShowQuestion();
    await waitFor(() => {
      expect(screen.getByText(/What is 2\+2\?/)).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /Show answer/ })).toBeInTheDocument();
    expect(screen.queryByText(/^4$/)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Show answer/ }));
    await waitFor(() => {
      expect(screen.getByText(/^4$/)).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Not satisfied' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hard but I remembered' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Normal effort' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Too easy' })).toBeInTheDocument();
  });

  it('calls POST review and shows session complete after rating last card', async () => {
    mockGet.mockImplementation((url: string) => {
      if (url === '/api/user/settings') return Promise.resolve({ data: { success: true, data: { learning_min_interval_minutes: 1 } } });
      if (url.includes('/cards/study')) return Promise.resolve({ data: { success: true, data: [mockCard] } });
      if (url === '/api/decks/deck-123') return Promise.resolve({ data: { success: true, data: mockDeck } });
      return Promise.resolve({ data: { success: true, data: mockDeck } });
    });
    render(<StudyPage />);
    await clickShowQuestion();
    await waitFor(() => {
      expect(screen.getByText(/What is 2\+2\?/)).toBeInTheDocument();
    });
    await userEvent.click(screen.getByRole('button', { name: /Show answer/ }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Normal effort' })).toBeInTheDocument();
    });
    await userEvent.click(screen.getByRole('button', { name: 'Normal effort' }));

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith(
        '/api/cards/card-1/review',
        expect.objectContaining({
          rating: 3,
        })
      );
    });
    await waitFor(() => {
      expect(screen.getByText(/Session complete/)).toBeInTheDocument();
    });
    expect(screen.getByText(/You reviewed 1 card/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Back to deck/ })).toBeInTheDocument();
  });

  it('shows Need management checkbox and Add note / Edit card now when checked after revealing answer', async () => {
    mockGet.mockImplementation((url: string) => {
      if (url === '/api/user/settings') return Promise.resolve({ data: { success: true, data: { learning_min_interval_minutes: 1 } } });
      if (url.includes('/cards/study')) return Promise.resolve({ data: { success: true, data: [mockCard] } });
      if (url === '/api/decks/deck-123') return Promise.resolve({ data: { success: true, data: mockDeck } });
      return Promise.resolve({ data: { success: true, data: mockDeck } });
    });
    render(<StudyPage />);
    await clickShowQuestion();
    await waitFor(() => {
      expect(screen.getByText(/What is 2\+2\?/)).toBeInTheDocument();
    });
    expect(screen.queryByRole('checkbox', { name: /Need management/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Wrong content' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Show answer/ }));
    await waitFor(() => {
      expect(screen.getByText(/^4$/)).toBeInTheDocument();
    });
    await userEvent.click(screen.getByRole('checkbox', { name: /Need management/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Wrong content' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Edit card now/i })).toBeInTheDocument();
    });
  });

  it('opens edit modal when Edit card now is clicked without leaving session', async () => {
    mockGet.mockImplementation((url: string) => {
      if (url === '/api/user/settings') return Promise.resolve({ data: { success: true, data: { learning_min_interval_minutes: 1 } } });
      if (url.includes('/cards/study')) return Promise.resolve({ data: { success: true, data: [mockCard] } });
      if (url === '/api/decks/deck-123') return Promise.resolve({ data: { success: true, data: mockDeck } });
      return Promise.resolve({ data: { success: true, data: mockDeck } });
    });
    render(<StudyPage />);
    await clickShowQuestion();
    await waitFor(() => {
      expect(screen.getByText(/What is 2\+2\?/)).toBeInTheDocument();
    });
    await userEvent.click(screen.getByRole('button', { name: /Show answer/ }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Normal effort' })).toBeInTheDocument();
    });
    await userEvent.click(screen.getByRole('checkbox', { name: /Need management/i }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Edit card now/i })).toBeInTheDocument();
    });
    await userEvent.click(screen.getByRole('button', { name: /Edit card now/i }));

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /Edit card/i })).toBeInTheDocument();
    });
    expect(screen.getByTestId('edit-modal-overlay')).toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('calls POST /api/cards/:id/flag when Add note reason is selected', async () => {
    mockGet.mockImplementation((url: string) => {
      if (url === '/api/user/settings') return Promise.resolve({ data: { success: true, data: { learning_min_interval_minutes: 1 } } });
      if (url.includes('/cards/study')) return Promise.resolve({ data: { success: true, data: [mockCard] } });
      if (url === '/api/decks/deck-123') return Promise.resolve({ data: { success: true, data: mockDeck } });
      return Promise.resolve({ data: { success: true, data: mockDeck } });
    });
    mockPost.mockResolvedValue({ data: { success: true, data: {} } });
    render(<StudyPage />);
    await clickShowQuestion();
    await waitFor(() => {
      expect(screen.getByText(/What is 2\+2\?/)).toBeInTheDocument();
    });
    await userEvent.click(screen.getByRole('button', { name: /Show answer/ }));
    await waitFor(() => {
      expect(screen.getByText(/^4$/)).toBeInTheDocument();
    });
    await userEvent.click(screen.getByRole('checkbox', { name: /Need management/i }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Wrong content' })).toBeInTheDocument();
    });
    await userEvent.click(screen.getByRole('button', { name: 'Wrong content' }));

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith(
        '/api/cards/card-1/flag',
        expect.objectContaining({
          reason: 'wrong_content',
        })
      );
    });
  });

  it('after correcting the previous rating, the next review POST targets the current card (fresh FSRS comes from the server)', async () => {
    const mockCard2: Card = {
      ...mockCard,
      id: 'card-2',
      recto: 'What is 3+3?',
      verso: '6',
    };

    /** Deterministic two-card queue without relying on shuffle + initial fetch race with prefetch. */
    const savedSession = {
      deckId: 'deck-123',
      reviewedCardIds: [] as string[],
      queue: [mockCard, mockCard2],
      reviewedCount: 0,
      sessionSize: 'medium' as const,
      savedAt: Date.now(),
    };
    const getItemSpy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation((key: string) => {
      if (key === 'memoon_study_session_deck-123') return JSON.stringify(savedSession);
      return null;
    });

    mockGet.mockImplementation((url: string) => {
      if (url === '/api/user/settings') {
        return Promise.resolve({ data: { success: true, data: { learning_min_interval_minutes: 1 } } });
      }
      if (url.includes('/cards/study')) {
        return Promise.resolve({ data: { success: true, data: [] } });
      }
      if (url === '/api/decks/deck-123') return Promise.resolve({ data: { success: true, data: mockDeck } });
      return Promise.resolve({ data: { success: true, data: mockDeck } });
    });
    mockPost.mockResolvedValue({ data: { success: true } });

    try {
      render(<StudyPage />);

      await clickShowQuestion();
      await waitFor(() => {
        expect(screen.getByText(/What is 2\+2\?/)).toBeInTheDocument();
      });
      await userEvent.click(screen.getByRole('button', { name: /Show answer/ }));
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Normal effort' })).toBeInTheDocument();
      });
      await userEvent.click(screen.getByRole('button', { name: 'Normal effort' }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Change previous card rating/i })).toBeInTheDocument();
      });
      await userEvent.click(screen.getByRole('button', { name: /Change previous card rating/i }));
      await waitFor(() => {
        expect(screen.getByText(/^4$/)).toBeInTheDocument();
      });

      await userEvent.click(screen.getByRole('button', { name: 'Normal effort' }));

      await waitFor(() => {
        expect(mockPost).toHaveBeenCalledWith(
          '/api/cards/card-1/review/correct',
          expect.objectContaining({ rating: 3 })
        );
      });

      await clickShowQuestion();
      await waitFor(() => {
        expect(screen.getByText(/What is 3\+3\?/)).toBeInTheDocument();
      });
      await userEvent.click(screen.getByRole('button', { name: /Show answer/ }));
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Normal effort' })).toBeInTheDocument();
      });
      await userEvent.click(screen.getByRole('button', { name: 'Normal effort' }));

      await waitFor(() => {
        expect(mockPost).toHaveBeenCalledWith(
          '/api/cards/card-2/review',
          expect.objectContaining({ rating: 3 })
        );
      });

      const reviewPosts = mockPost.mock.calls.filter((c) => String(c[0]).endsWith('/review'));
      expect(reviewPosts.map((c) => c[0])).toEqual([
        '/api/cards/card-1/review',
        '/api/cards/card-2/review',
      ]);
    } finally {
      getItemSpy.mockRestore();
    }
  });

  it('prepends the corrected card when the API schedules a short-interval repeat', async () => {
    const mockCard2: Card = {
      ...mockCard,
      id: 'card-2',
      recto: 'What is 3+3?',
      verso: '6',
    };

    const savedSession = {
      deckId: 'deck-123',
      reviewedCardIds: [] as string[],
      queue: [mockCard, mockCard2],
      reviewedCount: 0,
      sessionSize: 'medium' as const,
      savedAt: Date.now(),
    };
    const getItemSpy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation((key: string) => {
      if (key === 'memoon_study_session_deck-123') return JSON.stringify(savedSession);
      return null;
    });

    mockPost.mockImplementation((url: string) => {
      if (String(url).includes('/review/correct')) {
        return Promise.resolve({
          data: {
            success: true,
            data: {
              state: {
                stability: 0.5,
                difficulty: 5,
                lastReview: new Date().toISOString(),
                nextReview: new Date(Date.now() + 5 * 60_000).toISOString(),
              },
              interval: 0.04,
              retrievability: 0.9,
              message: 'ok',
              reviewLogId: 'log-1',
              card: {
                ...mockCard,
                next_review: new Date().toISOString(),
                category_ids: [],
                categories: [],
              },
            },
          },
        });
      }
      return Promise.resolve({ data: { success: true } });
    });

    mockGet.mockImplementation((url: string) => {
      if (url === '/api/user/settings') {
        return Promise.resolve({ data: { success: true, data: { learning_min_interval_minutes: 1 } } });
      }
      if (url.includes('/cards/study')) {
        return Promise.resolve({ data: { success: true, data: [] } });
      }
      if (url === '/api/decks/deck-123') return Promise.resolve({ data: { success: true, data: mockDeck } });
      return Promise.resolve({ data: { success: true, data: mockDeck } });
    });

    try {
      render(<StudyPage />);

      await clickShowQuestion();
      await waitFor(() => {
        expect(screen.getByText(/What is 2\+2\?/)).toBeInTheDocument();
      });
      await userEvent.click(screen.getByRole('button', { name: /Show answer/ }));
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Normal effort' })).toBeInTheDocument();
      });
      await userEvent.click(screen.getByRole('button', { name: 'Normal effort' }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Change previous card rating/i })).toBeInTheDocument();
      });
      await userEvent.click(screen.getByRole('button', { name: /Change previous card rating/i }));
      await waitFor(() => {
        expect(screen.getByText(/^4$/)).toBeInTheDocument();
      });

      await userEvent.click(screen.getByRole('button', { name: 'Normal effort' }));

      await waitFor(() => {
        const correctionPost = mockPost.mock.calls.find((c) => String(c[0]).includes('/review/correct'));
        expect(correctionPost?.[1]).toEqual(expect.objectContaining({ rating: 3 }));
      });

      await clickShowQuestion();
      await waitFor(() => {
        expect(screen.getByText(/What is 2\+2\?/)).toBeInTheDocument();
      });
    } finally {
      getItemSpy.mockRestore();
    }
  });

  it('allows a second correction when the corrected card stays at the front (snapshot ref kept)', async () => {
    const mockCard2: Card = {
      ...mockCard,
      id: 'card-2',
      recto: 'What is 3+3?',
      verso: '6',
    };

    const savedSession = {
      deckId: 'deck-123',
      reviewedCardIds: [] as string[],
      queue: [mockCard, mockCard2],
      reviewedCount: 0,
      sessionSize: 'medium' as const,
      savedAt: Date.now(),
    };
    const getItemSpy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation((key: string) => {
      if (key === 'memoon_study_session_deck-123') return JSON.stringify(savedSession);
      return null;
    });

    mockPost.mockImplementation((url: string) => {
      if (String(url).includes('/review/correct')) {
        return Promise.resolve({
          data: {
            success: true,
            data: {
              state: {
                stability: 0.5,
                difficulty: 5,
                lastReview: new Date().toISOString(),
                nextReview: new Date(Date.now() + 5 * 60_000).toISOString(),
              },
              interval: 0.04,
              retrievability: 0.9,
              message: 'ok',
              reviewLogId: 'log-1',
              card: {
                ...mockCard,
                next_review: new Date().toISOString(),
                category_ids: [],
                categories: [],
              },
            },
          },
        });
      }
      return Promise.resolve({ data: { success: true } });
    });

    mockGet.mockImplementation((url: string) => {
      if (url === '/api/user/settings') {
        return Promise.resolve({ data: { success: true, data: { learning_min_interval_minutes: 1 } } });
      }
      if (url.includes('/cards/study')) {
        return Promise.resolve({ data: { success: true, data: [] } });
      }
      if (url === '/api/decks/deck-123') return Promise.resolve({ data: { success: true, data: mockDeck } });
      return Promise.resolve({ data: { success: true, data: mockDeck } });
    });

    try {
      render(<StudyPage />);

      await clickShowQuestion();
      await waitFor(() => {
        expect(screen.getByText(/What is 2\+2\?/)).toBeInTheDocument();
      });
      await userEvent.click(screen.getByRole('button', { name: /Show answer/ }));
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Normal effort' })).toBeInTheDocument();
      });
      await userEvent.click(screen.getByRole('button', { name: 'Normal effort' }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Change previous card rating/i })).toBeInTheDocument();
      });
      await userEvent.click(screen.getByRole('button', { name: /Change previous card rating/i }));
      await waitFor(() => {
        expect(screen.getByText(/^4$/)).toBeInTheDocument();
      });

      await userEvent.click(screen.getByRole('button', { name: 'Normal effort' }));

      await waitFor(() => {
        expect(mockPost.mock.calls.filter((c) => String(c[0]).includes('/review/correct')).length).toBe(1);
      });

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Change previous card rating/i })).toBeInTheDocument();
      });
      await userEvent.click(screen.getByRole('button', { name: /Change previous card rating/i }));
      await waitFor(() => {
        expect(screen.getByText(/^4$/)).toBeInTheDocument();
      });
      await userEvent.click(screen.getByRole('button', { name: 'Hard but I remembered' }));

      await waitFor(() => {
        expect(mockPost.mock.calls.filter((c) => String(c[0]).includes('/review/correct')).length).toBe(2);
      });
      expect(
        mockPost.mock.calls.filter((c) => String(c[0]).includes('/review/correct')).map((c) => c[1])
      ).toEqual([expect.objectContaining({ rating: 3 }), expect.objectContaining({ rating: 2 })]);
    } finally {
      getItemSpy.mockRestore();
    }
  });
});
