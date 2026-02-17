import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@/test-utils';
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
  isRequestCancelled: () => false,
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
    expect(backLink).toHaveAttribute('href', '/en/app');
    expect(mockGet).toHaveBeenCalledWith('/api/decks/deck-123', expect.objectContaining({ signal: expect.any(AbortSignal) }));
    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith('/api/decks/deck-123/cards', expect.objectContaining({ signal: expect.any(AbortSignal) }));
    });
  });

  it('shows Study link with correct href', async () => {
    render(<DeckDetailPage />);
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'My Deck' })).toBeInTheDocument();
    });
    const studyLink = screen.getByRole('link', { name: 'Study' });
    expect(studyLink).toHaveAttribute('href', '/en/app/decks/deck-123/study');
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
      expect(screen.getByText('Card 1')).toBeInTheDocument();
    });
    expect(screen.queryByText('Front text')).not.toBeInTheDocument();
    expect(screen.queryByText('Back text')).not.toBeInTheDocument();
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

  it('displays multiple cards as placeholders without showing content', async () => {
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
      expect(screen.getByText('Card 1')).toBeInTheDocument();
      expect(screen.getByText('Card 2')).toBeInTheDocument();
    });
    expect(screen.queryByText('One')).not.toBeInTheDocument();
    expect(screen.queryByText('Two')).not.toBeInTheDocument();
    expect(screen.queryByText('1')).not.toBeInTheDocument();
    expect(screen.queryByText('2')).not.toBeInTheDocument();
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
    expect(backLink).toHaveAttribute('href', '/en/app');
  });

  it('shows error when GET deck fails', async () => {
    mockGet.mockImplementation((url: string) => {
      if (url === '/api/decks/deck-123') return Promise.reject(new Error('Network error'));
      return Promise.resolve({ data: { success: true, data: [] } });
    });
    render(<DeckDetailPage />);
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Failed to load deck');
    });
  });

  it('filters cards by search only after clicking Search button and reveals matching card content', async () => {
    const cards: Card[] = [
      { ...mockCard, id: 'c1', recto: 'Apple', verso: 'Fruit', comment: null },
      { ...mockCard, id: 'c2', recto: 'Banana', verso: 'Yellow', comment: null },
    ];
    mockGet.mockImplementation((url: string) => {
      if (url.includes('/cards')) return Promise.resolve({ data: { success: true, data: cards } });
      return Promise.resolve({ data: { success: true, data: mockDeck } });
    });
    render(<DeckDetailPage />);
    await waitFor(() => {
      expect(screen.getByText('Card 1')).toBeInTheDocument();
      expect(screen.getByText('Card 2')).toBeInTheDocument();
    });
    const searchInput = screen.getByRole('searchbox', { name: /Search cards/ });
    await userEvent.type(searchInput, 'Apple');
    expect(screen.queryByText(/Apple/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Search' }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    });
    expect(screen.getByText(/Apple/)).toBeInTheDocument();
    expect(screen.getByText(/Fruit/)).toBeInTheDocument();
    expect(screen.queryByText(/Banana/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Yellow/)).not.toBeInTheDocument();
  });

  it('shows no match message when search matches no cards after applying search', async () => {
    const cards: Card[] = [
      { ...mockCard, id: 'c1', recto: 'Alpha', verso: 'First', comment: null },
    ];
    mockGet.mockImplementation((url: string) => {
      if (url.includes('/cards')) return Promise.resolve({ data: { success: true, data: cards } });
      return Promise.resolve({ data: { success: true, data: mockDeck } });
    });
    render(<DeckDetailPage />);
    await waitFor(() => {
      expect(screen.getByText('Card 1')).toBeInTheDocument();
    });
    const searchInput = screen.getByRole('searchbox', { name: /Search cards/ });
    await userEvent.type(searchInput, 'xyz-nonexistent');
    await userEvent.click(screen.getByRole('button', { name: 'Search' }));
    await waitFor(() => {
      expect(screen.getByText(/No cards match your search/)).toBeInTheDocument();
    });
    expect(screen.queryByText('Alpha')).not.toBeInTheDocument();
  });

  it('shows reviewed banner and Show only reviewed filter when returning from study', async () => {
    const cards: Card[] = [
      { ...mockCard, id: 'c1', recto: 'Reviewed', verso: 'Back', comment: null },
      { ...mockCard, id: 'c2', recto: 'Other', verso: 'Card', comment: null },
    ];
    mockGet.mockImplementation((url: string) => {
      if (url.includes('/cards')) return Promise.resolve({ data: { success: true, data: cards } });
      return Promise.resolve({ data: { success: true, data: mockDeck } });
    });
    if (typeof window !== 'undefined' && window.sessionStorage) {
      window.sessionStorage.setItem('memoon_last_studied_deck-123', JSON.stringify(['c1']));
    }
    render(<DeckDetailPage />);
    await waitFor(() => {
      expect(screen.getByText(/You just reviewed 1 cards/)).toBeInTheDocument();
    });
    expect(screen.getByRole('link', { name: 'View study sessions' })).toHaveAttribute('href', '/en/app/study-sessions');
    expect(screen.getByRole('button', { name: 'Show only reviewed' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeInTheDocument();
    // Reviewed card (c1) is revealed (content + Edit); other (c2) is still placeholder
    await waitFor(() => {
      expect(screen.getByText(/Reviewed/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    });
    expect(screen.getByText('Card 2')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Show only reviewed' }));
    await waitFor(() => {
      expect(screen.getByText(/Reviewed/)).toBeInTheDocument();
      expect(screen.queryByText(/Other/)).not.toBeInTheDocument();
      expect(screen.queryByText('Card 2')).not.toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Show all cards' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    await waitFor(() => {
      expect(screen.queryByText(/You just reviewed/)).not.toBeInTheDocument();
    });
  });

  it('closes create modal when clicking outside the modal box', async () => {
    mockGet.mockImplementation((url: string) => {
      if (url.includes('/cards')) return Promise.resolve({ data: { success: true, data: [] } });
      return Promise.resolve({ data: { success: true, data: mockDeck } });
    });
    render(<DeckDetailPage />);
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'My Deck' })).toBeInTheDocument();
    });
    const newCardButtons = screen.getAllByRole('button', { name: /New card/ });
    await userEvent.click(newCardButtons[0]);
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Create card' })).toBeInTheDocument();
    });
    const overlay = screen.getByTestId('create-modal-overlay');
    await userEvent.click(overlay);
    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: 'Create card' })).not.toBeInTheDocument();
    });
  });

  it('keeps create modal open when clicking inside the modal box', async () => {
    mockGet.mockImplementation((url: string) => {
      if (url.includes('/cards')) return Promise.resolve({ data: { success: true, data: [] } });
      return Promise.resolve({ data: { success: true, data: mockDeck } });
    });
    render(<DeckDetailPage />);
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'My Deck' })).toBeInTheDocument();
    });
    const newCardButtons = screen.getAllByRole('button', { name: /New card/ });
    await userEvent.click(newCardButtons[0]);
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Create card' })).toBeInTheDocument();
    });
    await userEvent.click(screen.getByRole('heading', { name: 'Create card' }));
    expect(screen.getByRole('heading', { name: 'Create card' })).toBeInTheDocument();
  });

  it('closes edit modal when clicking outside the modal box', async () => {
    const cards: Card[] = [
      { ...mockCard, id: 'c1', recto: 'Q', verso: 'A', comment: null },
    ];
    mockGet.mockImplementation((url: string) => {
      if (url.includes('/cards')) return Promise.resolve({ data: { success: true, data: cards } });
      return Promise.resolve({ data: { success: true, data: mockDeck } });
    });
    if (typeof window !== 'undefined' && window.sessionStorage) {
      window.sessionStorage.setItem('memoon_last_studied_deck-123', JSON.stringify(['c1']));
    }
    render(<DeckDetailPage />);
    await waitFor(() => {
      expect(screen.getByText(/Q/)).toBeInTheDocument();
    });
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Edit card' })).toBeInTheDocument();
    });
    const overlay = screen.getByTestId('edit-modal-overlay');
    await userEvent.click(overlay);
    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: 'Edit card' })).not.toBeInTheDocument();
    });
  });
});
