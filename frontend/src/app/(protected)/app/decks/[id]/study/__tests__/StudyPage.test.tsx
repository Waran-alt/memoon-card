import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import StudyPage from '../page';
import type { Deck, Card } from '@/types';

const mockGet = vi.hoisted(() => vi.fn());
const mockPost = vi.hoisted(() => vi.fn());
const mockReplace = vi.fn();
// Allow missing id in one test to verify redirect
const useParams = vi.fn<() => { id?: string }>(() => ({ id: 'deck-123' }));

vi.mock('next/navigation', () => ({
  useParams: () => useParams(),
  useRouter: vi.fn(() => ({ replace: mockReplace })),
}));

vi.mock('@/lib/api', () => ({
  default: { get: mockGet, post: mockPost },
  getApiErrorMessage: (_err: unknown, fallback: string) => fallback,
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
  if (url.includes('/cards/due')) return Promise.resolve({ data: { success: true, data: [] } });
  if (url.includes('/cards/new')) return Promise.resolve({ data: { success: true, data: [] } });
  return Promise.resolve({ data: { success: true, data: mockDeck } });
}

describe('StudyPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useParams.mockReturnValue({ id: 'deck-123' });
    mockGet.mockImplementation(defaultGetImpl);
  });

  it('shows loading then no cards when due and new are empty', async () => {
    render(<StudyPage />);
    expect(screen.getByText(/Loading…/)).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText(/No cards to study right now/)).toBeInTheDocument();
    });
    const backLinks = screen.getAllByRole('link', { name: /Back to deck/ });
    expect(backLinks.some((el) => el.getAttribute('href') === '/app/decks/deck-123')).toBe(true);
  });

  it('calls deck, due, and new endpoints', async () => {
    render(<StudyPage />);
    await waitFor(() => {
      expect(screen.getByText(/No cards to study right now/)).toBeInTheDocument();
    });
    expect(mockGet).toHaveBeenCalledWith('/api/decks/deck-123');
    expect(mockGet).toHaveBeenCalledWith('/api/decks/deck-123/cards/due');
    expect(mockGet).toHaveBeenCalledWith(expect.stringContaining('/api/decks/deck-123/cards/new'));
  });

  it('shows deck not found when deck API returns no data', async () => {
    mockGet.mockImplementation((url: string) => {
      if (url === '/api/decks/deck-123') return Promise.resolve({ data: { success: true, data: undefined } });
      if (url.includes('/cards/due')) return Promise.resolve({ data: { success: true, data: [] } });
      if (url.includes('/cards/new')) return Promise.resolve({ data: { success: true, data: [] } });
      return Promise.resolve({ data: { success: true, data: null } });
    });
    render(<StudyPage />);
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Deck not found');
    });
    expect(screen.getByRole('link', { name: /Back to decks/ })).toHaveAttribute('href', '/app');
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
    expect(mockReplace).toHaveBeenCalledWith('/app');
  });

  it('shows card recto and Show answer, then verso and rating buttons', async () => {
    mockGet.mockImplementation((url: string) => {
      if (url.includes('/cards/due')) return Promise.resolve({ data: { success: true, data: [mockCard] } });
      if (url.includes('/cards/new')) return Promise.resolve({ data: { success: true, data: [] } });
      return Promise.resolve({ data: { success: true, data: mockDeck } });
    });
    render(<StudyPage />);
    await waitFor(() => {
      expect(screen.getByText('What is 2+2?')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /Show answer/ })).toBeInTheDocument();
    expect(screen.queryByText('4')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Show answer/ }));
    await waitFor(() => {
      expect(screen.getByText('4')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Again' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hard' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Good' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Easy' })).toBeInTheDocument();
  });

  it('calls POST review and shows session complete after rating last card', async () => {
    mockGet.mockImplementation((url: string) => {
      if (url.includes('/cards/due')) return Promise.resolve({ data: { success: true, data: [mockCard] } });
      if (url.includes('/cards/new')) return Promise.resolve({ data: { success: true, data: [] } });
      return Promise.resolve({ data: { success: true, data: mockDeck } });
    });
    mockPost.mockResolvedValue({ data: { success: true } });
    render(<StudyPage />);
    await waitFor(() => {
      expect(screen.getByText('What is 2+2?')).toBeInTheDocument();
    });
    await userEvent.click(screen.getByRole('button', { name: /Show answer/ }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Good' })).toBeInTheDocument();
    });
    await userEvent.click(screen.getByRole('button', { name: 'Good' }));

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith('/api/cards/card-1/review', {
        rating: 3,
      });
    });
    await waitFor(() => {
      expect(screen.getByText(/Session complete/)).toBeInTheDocument();
    });
    expect(screen.getByText(/You reviewed 1 card/)).toBeInTheDocument();
  });
});
