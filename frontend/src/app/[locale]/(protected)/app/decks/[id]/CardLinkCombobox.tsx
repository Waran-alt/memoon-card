'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { Card } from '@/types';
import { previewCardRecto } from './deckDetailHelpers';
import { IconXMark } from './DeckUiIcons';

function cardFilterBlob(card: Card): string {
  const r = card.recto.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
  const v = card.verso.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
  return `${r} ${v}`;
}

export type CardLinkComboboxProps = {
  inputId: string;
  label: React.ReactNode;
  filterPlaceholder: string;
  noMatchesMessage: string;
  rectoLabel: string;
  versoLabel: string;
  clearSelectionLabel: string;
  candidates: Card[];
  selectedId: string;
  onSelect: (cardId: string) => void;
  disabled?: boolean;
};

export function CardLinkCombobox({
  inputId,
  label,
  filterPlaceholder,
  noMatchesMessage,
  rectoLabel,
  versoLabel,
  clearSelectionLabel,
  candidates,
  selectedId,
  onSelect,
  disabled = false,
}: CardLinkComboboxProps) {
  const listId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter((c) => cardFilterBlob(c).includes(q));
  }, [candidates, query]);

  const selectedCard = useMemo(
    () => candidates.find((c) => c.id === selectedId) ?? null,
    [candidates, selectedId]
  );

  const closeList = useCallback(() => {
    setOpen(false);
  }, []);

  const choose = useCallback(
    (id: string) => {
      onSelect(id);
      setQuery('');
      setOpen(false);
      setActiveIndex(0);
    },
    [onSelect]
  );

  const clearSelection = useCallback(() => {
    onSelect('');
    setQuery('');
    setOpen(false);
    inputRef.current?.focus();
  }, [onSelect]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const el = wrapRef.current;
      if (el && !el.contains(e.target as Node)) closeList();
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open, closeList]);

  const safeActive = filtered.length === 0 ? -1 : Math.min(activeIndex, filtered.length - 1);

  const onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (disabled || candidates.length === 0) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      closeList();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActiveIndex((i) => {
        const next = open ? i + 1 : 0;
        return filtered.length === 0 ? 0 : Math.min(next, filtered.length - 1);
      });
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setOpen(true);
      setActiveIndex((i) => {
        const next = open ? i - 1 : filtered.length - 1;
        return filtered.length === 0 ? 0 : Math.max(next, 0);
      });
      return;
    }
    if (e.key === 'Enter' && open && safeActive >= 0) {
      e.preventDefault();
      choose(filtered[safeActive]!.id);
    }
  };

  const listItemPreviewLen = 200;

  return (
    <div ref={wrapRef} className="relative">
      <label htmlFor={inputId} className="block text-sm font-medium text-(--mc-text-secondary)">
        {label}
      </label>
      <input
        ref={inputRef}
        id={inputId}
        type="search"
        autoComplete="off"
        spellCheck={false}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && safeActive >= 0 ? `${inputId}-opt-${filtered[safeActive]!.id}` : undefined}
        disabled={disabled || candidates.length === 0}
        value={query}
        placeholder={filterPlaceholder}
        onChange={(e) => {
          setQuery(e.target.value);
          setActiveIndex(0);
          setOpen(true);
        }}
        onFocus={() => {
          if (candidates.length > 0) setOpen(true);
        }}
        onKeyDown={onInputKeyDown}
        className="mt-1 w-full cursor-text rounded-lg border border-(--mc-border-subtle) bg-(--mc-bg-surface) px-3 py-2 text-sm leading-5 text-(--mc-text-primary) transition-[border-color,box-shadow] placeholder:text-(--mc-text-muted) hover:border-(--mc-text-muted) focus:border-(--mc-accent-primary) focus:outline-none focus:shadow-[0_0_0_3px_rgb(99_102_241_/_0.2)] disabled:cursor-not-allowed disabled:opacity-60"
      />

      {selectedCard && (
        <div className="mt-2 flex gap-2 rounded-lg border border-(--mc-border-subtle) bg-(--mc-bg-page) p-2">
          <div className="min-w-0 flex-1 space-y-1.5">
            <div>
              <p className="text-[0.625rem] font-medium leading-tight tracking-wide text-(--mc-text-muted)">
                {rectoLabel}
              </p>
              <p className="whitespace-pre-wrap wrap-break-word text-sm text-(--mc-text-primary)">
                {previewCardRecto(selectedCard.recto, listItemPreviewLen)}
              </p>
            </div>
            <hr className="border-0 border-t border-(--mc-border-subtle) opacity-60" aria-hidden="true" />
            <div>
              <p className="text-[0.625rem] font-medium leading-tight tracking-wide text-(--mc-text-muted)">
                {versoLabel}
              </p>
              <p className="whitespace-pre-wrap wrap-break-word text-sm text-(--mc-text-primary)">
                {previewCardRecto(selectedCard.verso, listItemPreviewLen)}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={clearSelection}
            className="shrink-0 self-start rounded border border-(--mc-border-subtle) px-1 py-1 text-xs font-medium text-(--mc-text-secondary) hover:bg-(--mc-bg-card-back)"
            aria-label={clearSelectionLabel}
          >
            <IconXMark className="h-4 w-4" />
          </button>
        </div>
      )}

      {open && !disabled && candidates.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-[60] mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-(--mc-border-subtle) bg-(--mc-bg-surface) py-1 shadow-xl"
        >
          {filtered.length === 0 ? (
            <li className="px-3 py-2 text-sm text-(--mc-text-secondary)" role="presentation">
              {noMatchesMessage}
            </li>
          ) : (
            filtered.map((c, index) => {
              const highlighted = index === safeActive;
              return (
                <li
                  key={c.id}
                  id={`${inputId}-opt-${c.id}`}
                  role="option"
                  aria-selected={c.id === selectedId}
                  className={`cursor-pointer border-b border-(--mc-border-subtle) px-3 py-2 text-left last:border-b-0 ${
                    highlighted ? 'bg-(--mc-accent-primary)/15' : 'hover:bg-(--mc-bg-card-back)'
                  }`}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => choose(c.id)}
                >
                  <p className="text-[0.625rem] font-medium leading-tight tracking-wide text-(--mc-text-muted)">
                    {rectoLabel}
                  </p>
                  <p className="whitespace-pre-wrap wrap-break-word text-sm text-(--mc-text-primary)">
                    {previewCardRecto(c.recto, listItemPreviewLen)}
                  </p>
                  <hr className="my-1.5 border-0 border-t border-(--mc-border-subtle) opacity-60" aria-hidden="true" />
                  <p className="text-[0.625rem] font-medium leading-tight tracking-wide text-(--mc-text-muted)">
                    {versoLabel}
                  </p>
                  <p className="whitespace-pre-wrap wrap-break-word text-sm text-(--mc-text-secondary)">
                    {previewCardRecto(c.verso, listItemPreviewLen)}
                  </p>
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
}
