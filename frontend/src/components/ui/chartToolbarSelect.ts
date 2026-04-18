/**
 * Native `<select>` styling for dense chart toolbars (D3 overlays, history chart).
 * Keeps compact typography; radius and focus match app controls (see McSelect).
 */
export const chartToolbarSelectClassName =
  'min-w-0 w-full rounded-lg border border-(--mc-border-subtle) bg-(--mc-bg-surface) px-2 py-1 text-[11px] font-medium text-(--mc-text-primary) shadow-sm transition-[border-color,box-shadow] hover:border-(--mc-text-muted) md:w-auto md:max-w-[min(100%,12.5rem)] md:shrink md:text-xs focus:border-(--mc-accent-primary) focus:outline-none focus:shadow-[0_0_0_3px_rgb(99_102_241/0.2)]';
