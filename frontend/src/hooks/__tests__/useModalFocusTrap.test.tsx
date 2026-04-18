import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRef } from 'react';
import { useModalFocusTrap, getFocusableElements } from '../useModalFocusTrap';

afterEach(() => {
  vi.restoreAllMocks();
});

function TrapHost({ open }: { open: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useModalFocusTrap(open, ref);
  return open ? (
    <div ref={ref} data-testid="trap-root">
      <button type="button">first-in-trap</button>
      <input aria-label="mid" />
      <button type="button">last-in-trap</button>
    </div>
  ) : (
    <p>closed</p>
  );
}

describe('getFocusableElements', () => {
  it('returns visible buttons and fields in DOM order', () => {
    const root = document.createElement('div');
    root.innerHTML =
      '<button type="button" id="a">a</button><button type="button" id="b" disabled>b</button><input id="c" />';
    const list = getFocusableElements(root);
    expect(list.map((el) => el.id)).toEqual(['a', 'c']);
  });
});

describe('useModalFocusTrap', () => {
  it('focuses first focusable when opened', async () => {
    render(<TrapHost open />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'first-in-trap' })).toHaveFocus();
    });
  });

  it('wraps Tab from last to first', async () => {
    render(<TrapHost open />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'first-in-trap' })).toHaveFocus();
    });
    await userEvent.tab();
    expect(screen.getByRole('textbox', { name: 'mid' })).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'last-in-trap' })).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'first-in-trap' })).toHaveFocus();
  });

  it('wraps Shift+Tab from first to last', async () => {
    render(<TrapHost open />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'first-in-trap' })).toHaveFocus();
    });
    await userEvent.tab({ shift: true });
    expect(screen.getByRole('button', { name: 'last-in-trap' })).toHaveFocus();
  });

  it('focuses initialFocusRef target when provided', async () => {
    function InitialFocusHost() {
      const containerRef = useRef<HTMLDivElement>(null);
      const cancelRef = useRef<HTMLButtonElement>(null);
      useModalFocusTrap(true, containerRef, { initialFocusRef: cancelRef });
      return (
        <div ref={containerRef}>
          <button type="button">danger-confirm</button>
          <button ref={cancelRef} type="button">
            cancel
          </button>
        </div>
      );
    }
    render(<InitialFocusHost />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'cancel' })).toHaveFocus();
    });
  });
});
