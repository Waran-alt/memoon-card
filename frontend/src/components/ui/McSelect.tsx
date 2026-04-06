'use client';

import { ChevronDown } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';

export type McSelectOption = { value: string; label: string };

type McSelectProps = {
  /** Sets `id` on the trigger (pair with `<label htmlFor>`). */
  id?: string;
  value: string;
  onChange: (value: string) => void;
  options: McSelectOption[];
  ariaLabel?: string;
  disabled?: boolean;
  /** Outer wrapper: width / margin (e.g. `w-auto min-w-32`, `w-full mt-1`). */
  className?: string;
};

/**
 * Custom listbox matching card/category picker styling (not a native `<select>`).
 */
export function McSelect({
  id: idProp,
  value,
  onChange,
  options,
  ariaLabel,
  disabled,
  className = '',
}: McSelectProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const uid = useId();
  const listboxId = `${uid}-listbox`;
  const triggerId = idProp ?? `mc-select-trigger-${uid}`;

  const selected = options.find((o) => o.value === value);
  const displayLabel = selected?.label ?? (value === '' ? '—' : value);

  useEffect(() => {
    if (!open) return;
    const onDocMouseDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocMouseDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={containerRef} className={`relative ${className}`.trim()}>
      <button
        type="button"
        id={triggerId}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-label={ariaLabel}
        onClick={() => !disabled && setOpen((o) => !o)}
        className="relative flex w-full min-h-10 items-center justify-between gap-2 rounded-lg border border-(--mc-border-subtle) bg-(--mc-bg-surface) px-3 py-2 pr-9 text-left text-sm text-(--mc-text-primary) transition-[border-color,box-shadow] hover:border-(--mc-text-muted) focus:border-(--mc-accent-primary) focus:outline-none focus:shadow-[0_0_0_3px_rgb(99_102_241/0.2)] disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span className="min-w-0 flex-1 truncate">{displayLabel}</span>
        <ChevronDown
          className={`pointer-events-none absolute right-2 top-1/2 h-4 w-4 shrink-0 -translate-y-1/2 text-(--mc-text-muted) transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden
          strokeWidth={2}
        />
      </button>
      {open && (
        <ul
          id={listboxId}
          role="listbox"
          tabIndex={-1}
          className="absolute left-0 right-0 z-[200] mt-1 max-h-60 min-w-full overflow-auto rounded-lg border border-(--mc-border-subtle) bg-(--mc-bg-page) p-1 shadow-md"
        >
          {options.map((opt) => (
            <li key={opt.value} role="presentation" className="list-none">
              <button
                type="button"
                role="option"
                aria-selected={value === opt.value}
                tabIndex={-1}
                className={`w-full rounded px-2 py-1.5 text-left text-sm transition-colors ${
                  value === opt.value
                    ? 'bg-(--mc-bg-card-back) font-medium text-(--mc-text-primary)'
                    : 'text-(--mc-text-primary) hover:bg-(--mc-bg-card-back)'
                }`}
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
              >
                {opt.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
