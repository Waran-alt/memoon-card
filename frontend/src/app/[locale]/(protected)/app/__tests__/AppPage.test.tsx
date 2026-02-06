import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AppPage from '../page';
import type { Deck } from '@/types';

const mockGet = vi.hoisted(() => vi.fn());
const mockPost = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api', () => ({
  default: {
    get: mockGet,
    post: mockPost,
  },
  getApiErrorMessage: (err: unknown, fallback: string) =>
    err && typeof err === 'object' && 'response' in err
      ? (err as { response?: { data?: { error?: string } } }).response?.data?.error ?? fallback
      : fallback,
}));

describe('AppPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockResolvedValue({
      data: { success: true, data: [] },
    });
  });

  it('shows loading then empty state when no decks', async () => {
    render(<AppPage />);
    expect(screen.getByText(/Loading decks/)).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText(/No decks yet/)).toBeInTheDocument();
    });
    expect(mockGet).toHaveBeenCalledWith('/api/decks');
  });

  it('shows deck list when GET returns decks', async () => {
    const decks: Deck[] = [
      {
        id: 'deck-1',
        user_id: 'user-1',
        title: 'Spanish',
        description: 'Spanish verbs',
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
      },
    ];
    mockGet.mockResolvedValueOnce({ data: { success: true, data: decks } });
    render(<AppPage />);
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Spanish' })).toBeInTheDocument();
    });
    expect(screen.getByText('Spanish verbs')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Spanish/ })).toHaveAttribute('href', '/app/decks/deck-1');
  });

  it('opens create form when New deck is clicked', async () => {
    render(<AppPage />);
    await waitFor(() => {
      expect(screen.getByText(/No decks yet/)).toBeInTheDocument();
    });
    const newDeckButtons = screen.getAllByRole('button', { name: /New deck/ });
    await userEvent.click(newDeckButtons[0]);
    expect(screen.getByRole('heading', { name: 'Create deck' })).toBeInTheDocument();
    expect(screen.getByLabelText(/Title/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Description \(optional\)/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  it('calls POST /api/decks and adds deck to list on create submit', async () => {
    const newDeck: Deck = {
      id: 'deck-new',
      user_id: 'user-1',
      title: 'French',
      description: null,
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-01T00:00:00Z',
    };
    mockGet.mockResolvedValueOnce({ data: { success: true, data: [] } });
    mockPost.mockResolvedValueOnce({ data: { success: true, data: newDeck } });
    mockGet.mockResolvedValue({ data: { success: true, data: [] } });

    render(<AppPage />);
    await waitFor(() => {
      expect(screen.getByText(/No decks yet/)).toBeInTheDocument();
    });
    const newDeckButtons = screen.getAllByRole('button', { name: /New deck/ });
    await userEvent.click(newDeckButtons[0]);
    await userEvent.type(screen.getByLabelText(/Title/), 'French');
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith('/api/decks', {
        title: 'French',
        description: undefined,
      });
    });
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'French' })).toBeInTheDocument();
    });
  });

  it('Create button is disabled when title is empty', async () => {
    render(<AppPage />);
    await waitFor(() => {
      expect(screen.getByText(/No decks yet/)).toBeInTheDocument();
    });
    const newDeckButtons = screen.getAllByRole('button', { name: /New deck/ });
    await userEvent.click(newDeckButtons[0]);
    const createBtn = screen.getByRole('button', { name: 'Create' });
    expect(createBtn).toBeDisabled();
    await userEvent.type(screen.getByLabelText(/Title/), '  ');
    expect(createBtn).toBeDisabled();
  });

  it('shows load error when GET fails', async () => {
    mockGet.mockRejectedValueOnce(new Error('Network error'));
    render(<AppPage />);
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Failed to load decks');
    });
  });

  it('shows create error when POST returns error', async () => {
    mockGet.mockResolvedValue({ data: { success: true, data: [] } });
    mockPost.mockRejectedValue({ response: { data: { error: 'Title already exists' } } });
    render(<AppPage />);
    await waitFor(() => {
      expect(screen.getByText(/No decks yet/)).toBeInTheDocument();
    });
    const newDeckButtons = screen.getAllByRole('button', { name: /New deck/ });
    await userEvent.click(newDeckButtons[0]);
    await userEvent.type(screen.getByLabelText(/Title/), 'French');
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Title already exists');
    });
  });

  it('Cancel closes create form without calling POST', async () => {
    render(<AppPage />);
    await waitFor(() => {
      expect(screen.getByText(/No decks yet/)).toBeInTheDocument();
    });
    const newDeckButtons = screen.getAllByRole('button', { name: /New deck/ });
    await userEvent.click(newDeckButtons[0]);
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Create deck' })).toBeInTheDocument();
    });
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: 'Create deck' })).not.toBeInTheDocument();
    });
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('shows multiple decks when GET returns several', async () => {
    const decks: Deck[] = [
      {
        id: 'd1',
        user_id: 'user-1',
        title: 'Spanish',
        description: 'Verbs',
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
      },
      {
        id: 'd2',
        user_id: 'user-1',
        title: 'French',
        description: null,
        created_at: '2025-01-02T00:00:00Z',
        updated_at: '2025-01-02T00:00:00Z',
      },
    ];
    mockGet.mockResolvedValueOnce({ data: { success: true, data: decks } });
    render(<AppPage />);
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Spanish' })).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'French' })).toBeInTheDocument();
    });
    expect(screen.getByRole('link', { name: /Spanish/ })).toHaveAttribute('href', '/app/decks/d1');
    expect(screen.getByRole('link', { name: /French/ })).toHaveAttribute('href', '/app/decks/d2');
  });
});
