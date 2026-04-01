import { describe, it, expect } from 'vitest';
import {
  cardMatchesSearch,
  previewCardRecto,
  previewCardRectoVerso,
  formatCardNumber,
} from '../deckDetailHelpers';
import type { Card } from '@/types';

const base: Card = {
  id: '1',
  user_id: 'u',
  deck_id: 'd',
  recto: 'Hello',
  verso: 'World',
  comment: 'Note',
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

describe('deckDetailHelpers', () => {
  it('cardMatchesSearch matches recto, verso, comment', () => {
    expect(cardMatchesSearch(base, 'hello')).toBe(true);
    expect(cardMatchesSearch(base, 'world')).toBe(true);
    expect(cardMatchesSearch(base, 'note')).toBe(true);
    expect(cardMatchesSearch(base, '  world  ')).toBe(true);
    expect(cardMatchesSearch(base, 'nope')).toBe(false);
  });

  it('previewCardRecto strips HTML', () => {
    expect(previewCardRecto('<b>Hi</b> there', 10)).toBe('Hi there');
  });

  it('previewCardRectoVerso joins recto and verso', () => {
    expect(previewCardRectoVerso('Front', 'Back')).toBe('Front · Back');
    expect(previewCardRectoVerso('<p>A</p>', '<p>B</p>')).toBe('A · B');
  });

  it('formatCardNumber handles invalid', () => {
    expect(formatCardNumber(null)).toBe('—');
    expect(formatCardNumber(1.2345)).toBe('1.23');
  });
});
