import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import DeckDetailPage from '../page';
import type { Deck } from '@/types';

const mockGet = vi.hoisted(() => vi.fn());
const mockReplace = vi.fn();

vi.mock('next/navigation', () => ({
  useParams: vi.fn(() => ({ id: 'deck-123' })),
  useRouter: vi.fn(() => ({ replace: mockReplace })),
}));

vi.mock('@/lib/api', () => ({
  default: { get: mockGet },
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

  it('shows error and back link when deck not found', async () => {
    mockGet.mockResolvedValueOnce({ data: { success: true, data: undefined } });
    render(<DeckDetailPage />);
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Deck not found');
    });
    const backLink = screen.getByRole('link', { name: 'Back to decks' });
    expect(backLink).toHaveAttribute('href', '/app');
  });

  it('shows error when GET fails', async () => {
    mockGet.mockRejectedValueOnce(new Error('Network error'));
    render(<DeckDetailPage />);
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Failed to load deck');
    });
  });
});
