// Panel — the core structural frame (design language §5). Every chart, map,
// table, KPI, and form section sits in a Panel: a 36px header strip
// (--panel-raised) with a label-caps title and a right-aligned toolbar, a
// --panel body, and an optional footer (meta / source stamp). Nothing floats
// on empty canvas. Toolbar icon buttons are ghost, revealed on hover/focus,
// and always keyboard reachable.
import { useRef, type ReactNode, type HTMLAttributes } from 'react';
import { cx } from './cx';

export interface PanelProps {
  title?: ReactNode;
  /** header-right actions (icon buttons); a fullscreen toggle is added too */
  toolbar?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  /** spread onto the header strip (e.g. drag handlers for dashboard tiles) */
  headerProps?: HTMLAttributes<HTMLDivElement>;
  /** hide the built-in fullscreen control (e.g. inside the styleguide) */
  noFullscreen?: boolean;
}

export function PanelIconButton({
  label,
  onClick,
  children,
  className,
}: {
  label: string;
  onClick?: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cx(
        'inline-flex h-6 min-w-6 items-center justify-center rounded-xs px-1 text-ink-muted',
        'opacity-0 transition-colors duration-150 group-hover:opacity-100 group-focus-within:opacity-100',
        'hover:bg-sunken hover:text-ink focus-visible:opacity-100',
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Panel({
  title,
  toolbar,
  footer,
  children,
  className,
  bodyClassName,
  headerProps,
  noFullscreen,
}: PanelProps) {
  const ref = useRef<HTMLElement>(null);

  function toggleFullscreen() {
    const el = ref.current;
    if (!el) return;
    if (document.fullscreenElement === el) void document.exitFullscreen();
    else void el.requestFullscreen?.();
  }

  const hasHeader = title !== undefined || toolbar !== undefined || !noFullscreen;

  return (
    <section
      ref={ref}
      className={cx(
        'group flex min-h-0 flex-col overflow-hidden rounded-sm border border-border-strong bg-panel',
        className,
      )}
    >
      {hasHeader ? (
        <div
          {...headerProps}
          className={cx(
            'flex h-9 shrink-0 items-center justify-between gap-2 border-b border-border bg-panel-raised px-3',
            headerProps?.className,
          )}
        >
          <span className="type-label truncate text-ink-muted">{title}</span>
          <div className="flex items-center gap-0.5">
            {toolbar}
            {!noFullscreen ? (
              <PanelIconButton label="Fullscreen" onClick={toggleFullscreen}>
                <span aria-hidden>⤢</span>
              </PanelIconButton>
            ) : null}
          </div>
        </div>
      ) : null}
      <div className={cx('min-h-0 grow p-3', bodyClassName)}>{children}</div>
      {footer !== undefined ? (
        <div className="type-label flex h-7 shrink-0 items-center border-t border-border px-3 text-ink-faint">
          {footer}
        </div>
      ) : null}
    </section>
  );
}
