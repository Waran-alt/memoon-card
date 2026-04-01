import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Card } from '@/types';
import { CardLinkCombobox } from '../CardLinkCombobox';

const base = (over: Partial<Card>): Card => ({
  id: 'x',
  user_id: 'u',
  deck_id: 'd',
  recto: 'R',
  verso: 'V',
  comment: null,
  recto_image: null,
  verso_image: null,
  recto_formula: false,
  verso_formula: false,
  reverse: false,
  stability: null,
  difficulty: null,
  last_review: null,
  next_review: '2025-01-01T00:00:00Z',
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
  ...over,
});

describe('CardLinkCombobox', () => {
  it('filters options by query and selects on click', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const cards = [
      base({ id: 'a', recto: 'Apple', verso: 'Pomme' }),
      base({ id: 'b', recto: 'Banana', verso: 'Banane' }),
    ];
    render(
      <CardLinkCombobox
        inputId="cb-test"
        label="Pick"
        filterPlaceholder="Filter…"
        noMatchesMessage="None"
        rectoLabel="Front"
        versoLabel="Back"
        clearSelectionLabel="Clear"
        candidates={cards}
        selectedId=""
        onSelect={onSelect}
      />
    );
    const input = screen.getByRole('combobox', { name: 'Pick' });
    await user.click(input);
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    await user.type(input, 'Ban');
    const list = screen.getByRole('listbox');
    expect(within(list).queryByText('Apple')).not.toBeInTheDocument();
    expect(within(list).getByText('Banana')).toBeInTheDocument();
    await user.click(within(list).getByText('Banana'));
    expect(onSelect).toHaveBeenCalledWith('b');
  });

  it('clears selection from summary', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const cards = [base({ id: 'a', recto: 'Only', verso: 'One' })];
    render(
      <CardLinkCombobox
        inputId="cb-clear"
        label="Pick"
        filterPlaceholder="Filter…"
        noMatchesMessage="None"
        rectoLabel="Front"
        versoLabel="Back"
        clearSelectionLabel="Clear selection"
        candidates={cards}
        selectedId="a"
        onSelect={onSelect}
      />
    );
    await user.click(screen.getByRole('button', { name: 'Clear selection' }));
    expect(onSelect).toHaveBeenCalledWith('');
  });
});
