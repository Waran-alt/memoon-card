import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DeckDetailPage from '../page';
import type { Deck, Card } from '@/types';

const mockGet = vi.hoisted(() => vi.fn());
const mockPost = vi.hoisted(() => vi.fn());
const mockReplace = vi.fn();

vi.mock('next/navigation', () => ({
  useParams: vi.fn(() => ({ id: 'deck-123' })),
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
  description: 'A test deck',
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
};

const mockCard: Card = {
  id: 'card-1',
  user_id: 'user-1',
  deck_id: 'deck-123',
  recto: 'Front text',
  verso: 'Back text',
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

describe('DeckDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockImplementation((url: string) => {
      if (url.includes('/cards')) {
        return Promise.resolve({ data: { success: true, data: [] } });
      }
      return Promise.resolve({ data: { success: true, data: mockDeck } });
    });
  });

  it('shows loading then deck title and description', async () => {
    render(<DeckDetailPage />);
    expect(screen.getByText('Loading…')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'My Deck' })).toBeInTheDocument();
    });
    expect(screen.getByText('A test deck')).toBeInTheDocument();
    const backLink = screen.getByRole('link', { name: '← Back to decks' });
    expect(backLink).toHaveAttribute('href', '/app');
    expect(mockGet).toHaveBeenCalledWith('/api/decks/deck-123');
    expect(mockGet).toHaveBeenCalledWith('/api/decks/deck-123/cards');
  });

  it('shows Study link with correct href', async () => {
    render(<DeckDetailPage />);
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'My Deck' })).toBeInTheDocument();
    });
    const studyLink = screen.getByRole('link', { name: 'Study' });
    expect(studyLink).toHaveAttribute('href', '/app/decks/deck-123/study');
  });

  it('shows empty cards state and New card button', async () => {
    render(<DeckDetailPage />);
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'My Deck' })).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByText(/No cards yet/)).toBeInTheDocument();
    });
    const newCardButtons = screen.getAllByRole('button', { name: /New card/ });
    expect(newCardButtons.length).toBeGreaterThanOrEqual(1);
  });

  it('opens create card form and submits, then shows card in list', async () => {
    mockPost.mockResolvedValue({ data: { success: true, data: mockCard } });
    render(<DeckDetailPage />);
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'My Deck' })).toBeInTheDocument();
    });
    const newCardButtons = screen.getAllByRole('button', { name: /New card/ });
    await userEvent.click(newCardButtons[0]);
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Create card' })).toBeInTheDocument();
    });
    await userEvent.type(screen.getByLabelText(/Front \(recto\)/), 'Front text');
    await userEvent.type(screen.getByLabelText(/Back \(verso\)/), 'Back text');
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith('/api/decks/deck-123/cards', {
        recto: 'Front text',
        verso: 'Back text',
        comment: undefined,
      });
    });
    await waitFor(() => {
      expect(screen.getByText('Front text')).toBeInTheDocument();
      expect(screen.getByText('Back text')).toBeInTheDocument();
    });
  });

  it('disables Create button when front or back is empty', async () => {
    render(<DeckDetailPage />);
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'My Deck' })).toBeInTheDocument();
    });
    const newCardButtons = screen.getAllByRole('button', { name: /New card/ });
    await userEvent.click(newCardButtons[0]);
    await waitFor(() => {
      const createBtn = screen.getByRole('button', { name: 'Create' });
      expect(createBtn).toBeDisabled();
    });
    await userEvent.type(screen.getByLabelText(/Front \(recto\)/), 'Q');
    expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled();
    await userEvent.type(screen.getByLabelText(/Back \(verso\)/), 'A');
    expect(screen.getByRole('button', { name: 'Create' })).not.toBeDisabled();
  });

  it('shows create error when POST fails', async () => {
    mockPost.mockRejectedValue(new Error('Server error'));
    render(<DeckDetailPage />);
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'My Deck' })).toBeInTheDocument();
    });
    const newCardButtons = screen.getAllByRole('button', { name: /New card/ });
    await userEvent.click(newCardButtons[0]);
    await userEvent.type(screen.getByLabelText(/Front \(recto\)/), 'Q');
    await userEvent.type(screen.getByLabelText(/Back \(verso\)/), 'A');
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Failed to create card');
    });
  });

  it('Cancel closes create form without submitting', async () => {
    render(<DeckDetailPage />);
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'My Deck' })).toBeInTheDocument();
    });
    const newCardButtons = screen.getAllByRole('button', { name: /New card/ });
    await userEvent.click(newCardButtons[0]);
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Create card' })).toBeInTheDocument();
    });
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: 'Create card' })).not.toBeInTheDocument();
    });
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('displays multiple cards when GET cards returns list', async () => {
    const cards: Card[] = [
      { ...mockCard, id: 'c1', recto: 'One', verso: '1' },
      { ...mockCard, id: 'c2', recto: 'Two', verso: '2' },
    ];
    mockGet.mockImplementation((url: string) => {
      if (url.includes('/cards')) return Promise.resolve({ data: { success: true, data: cards } });
      return Promise.resolve({ data: { success: true, data: mockDeck } });
    });
    render(<DeckDetailPage />);
    await waitFor(() => {
      expect(screen.getByText('One')).toBeInTheDocument();
      expect(screen.getByText('Two')).toBeInTheDocument();
    });
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('shows cards load error when GET cards fails', async () => {
    mockGet.mockImplementation((url: string) => {
      if (url.includes('/cards')) return Promise.reject(new Error('Network error'));
      return Promise.resolve({ data: { success: true, data: mockDeck } });
    });
    render(<DeckDetailPage />);
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'My Deck' })).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Failed to load cards');
    });
  });

  it('shows error and back link when deck not found', async () => {
    mockGet.mockResolvedValueOnce({ data: { success: true, data: undefined } });
    render(<DeckDetailPage />);
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Deck not found');
    });
    const backLink = screen.getByRole('link', { name: 'Back to decks' });
    expect(backLink).toHaveAttribute('href', '/app');
  });

  it('shows error when GET deck fails', async () => {
    mockGet.mockRejectedValueOnce(new Error('Network error'));
    render(<DeckDetailPage />);
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Failed to load deck');
    });
  });
});
