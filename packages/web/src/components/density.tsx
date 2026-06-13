// Table density toggle (§4). Compact is the default on data screens; this
// flips `data-density` on <html>, which the Table primitive reads via the
// --row-py variable. Choice persists per device. Pure presentation — no data.
import { useSyncExternalStore } from 'react';
import { cx } from './cx';

type Density = 'compact' | 'comfortable';
const KEY = 'dodo:density';
const listeners = new Set<() => void>();

function current(): Density {
  return document.documentElement.dataset.density === 'comfortable'
    ? 'comfortable'
    : 'compact';
}

function apply(d: Density) {
  if (d === 'comfortable') document.documentElement.dataset.density = 'comfortable';
  else delete document.documentElement.dataset.density;
  try {
    localStorage.setItem(KEY, d);
  } catch {
    /* private mode — non-fatal */
  }
  listeners.forEach((fn) => fn());
}

// restore the persisted choice once at module load (default stays compact)
if (typeof document !== 'undefined') {
  try {
    if (localStorage.getItem(KEY) === 'comfortable') apply('comfortable');
  } catch {
    /* ignore */
  }
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function DensityToggle({ className }: { className?: string }) {
  const density = useSyncExternalStore(subscribe, current, () => 'compact' as Density);
  return (
    <div
      role="group"
      aria-label="Table density"
      className={cx(
        'inline-flex overflow-hidden rounded-xs border border-border',
        className,
      )}
    >
      {(['compact', 'comfortable'] as const).map((d) => (
        <button
          key={d}
          type="button"
          aria-pressed={density === d}
          onClick={() => apply(d)}
          className={cx(
            'type-label px-2 py-1 transition-colors',
            density === d
              ? 'bg-primary-tint text-primary'
              : 'bg-panel text-ink-muted hover:bg-panel-raised',
          )}
        >
          {d}
        </button>
      ))}
    </div>
  );
}
