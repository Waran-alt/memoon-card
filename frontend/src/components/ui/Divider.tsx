/**
 * Thin divider that uses the same subtle border token used everywhere in the shell.
 * Use `orientation="vertical"` inside flex toolbars; consumer must give the parent a height.
 */
export type DividerProps = {
  orientation?: 'horizontal' | 'vertical';
  className?: string;
};

export function Divider({ orientation = 'horizontal', className = '' }: DividerProps) {
  if (orientation === 'vertical') {
    return (
      <div
        role="separator"
        aria-orientation="vertical"
        className={`mx-1 w-px self-stretch bg-(--mc-border-subtle) ${className}`.trim()}
      />
    );
  }
  return <hr className={`my-3 border-0 border-t border-(--mc-border-subtle) ${className}`.trim()} />;
}
