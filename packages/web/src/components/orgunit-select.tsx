// Searchable org-unit tree picker (single select). Replaces the indented
// <select> anti-pattern: a 40-unit Country→Region→Site tree is unusable as a
// flat dropdown. Built on Radix Popover (accessible: focus trap, Esc,
// outside-click) per the design language — no pre-styled libraries.
import { useMemo, useRef, useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import type { OrgUnit } from '@dodo/shared';
import { cx } from './cx';

export interface OrgUnitSelectProps {
  orgUnits: OrgUnit[]; // path-ordered (depth-first)
  value: string | null;
  onChange: (id: string) => void;
  /** optional predicate to limit selectable units (e.g. dataset assignment) */
  filter?: (o: OrgUnit) => boolean;
  placeholder?: string;
  disabled?: boolean;
  /** accessible name for the trigger (e.g. "Org unit") */
  label?: string;
  className?: string;
}

export function OrgUnitSelect({
  orgUnits,
  value,
  onChange,
  filter,
  placeholder = 'Choose…',
  disabled,
  label,
  className,
}: OrgUnitSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  const units = useMemo(
    () => (filter ? orgUnits.filter(filter) : orgUnits),
    [orgUnits, filter],
  );
  const selected = units.find((o) => o.id === value) ?? null;

  // search matches by name; ancestors of a match stay visible so the row
  // keeps its place in the hierarchy
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return units;
    const matchIds = new Set(
      units.filter((o) => o.name.toLowerCase().includes(q)).map((o) => o.id),
    );
    const keep = new Set(matchIds);
    for (const o of units) {
      if (!matchIds.has(o.id)) continue;
      // walk ancestors via path labels (ltree-style: a.b.c)
      const labels = o.path.split('.');
      for (let i = 1; i < labels.length; i++) {
        const ancestorPath = labels.slice(0, i).join('.');
        const anc = units.find((u) => u.path === ancestorPath);
        if (anc) keep.add(anc.id);
      }
    }
    return units.filter((o) => keep.has(o.id));
  }, [units, query]);

  return (
    <Popover.Root
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setQuery('');
          queueMicrotask(() => searchRef.current?.focus());
        }
      }}
    >
      <Popover.Trigger asChild disabled={disabled}>
        <button
          type="button"
          aria-label={label}
          className={cx(
            'flex h-8 w-full items-center justify-between gap-2 rounded-xs border border-hairline bg-surface px-2.5 text-left text-sm',
            'transition-colors duration-150 ease-out hover:border-ink-muted',
            'focus:border-cobalt focus:ring-1 focus:ring-cobalt focus:outline-none',
            'disabled:cursor-default disabled:opacity-45',
            className,
          )}
        >
          <span className={cx('truncate', !selected && 'text-ink-muted')}>
            {selected ? selected.name : placeholder}
          </span>
          <span aria-hidden className="text-ink-muted">
            ▾
          </span>
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={4}
          className="z-20 w-[var(--radix-popover-trigger-width)] min-w-56 rounded-sm border border-ink bg-surface"
        >
          <div className="border-b border-hairline p-1.5">
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search org units…"
              className="h-7 w-full rounded-xs border border-hairline bg-paper px-2 text-sm focus:border-cobalt focus:ring-1 focus:ring-cobalt focus:outline-none"
            />
          </div>
          <ul role="listbox" className="max-h-64 overflow-y-auto py-1">
            {visible.length === 0 ? (
              <li className="px-3 py-2 text-[12px] text-ink-muted">no matches</li>
            ) : (
              visible.map((o) => {
                const isMatch =
                  !query.trim() ||
                  o.name.toLowerCase().includes(query.trim().toLowerCase());
                return (
                  <li key={o.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={o.id === value}
                      disabled={!isMatch}
                      onClick={() => {
                        onChange(o.id);
                        setOpen(false);
                      }}
                      style={{ paddingLeft: `${(o.level - 1) * 14 + 10}px` }}
                      className={cx(
                        'flex w-full items-center gap-2 py-1 pr-3 text-left text-sm',
                        o.id === value
                          ? 'bg-surface font-medium text-cobalt'
                          : isMatch
                            ? 'hover:bg-paper'
                            : 'text-ink-muted', // ancestor shown for context only
                      )}
                    >
                      <span className="truncate">{o.name}</span>
                      {o.id === value ? (
                        <span aria-hidden className="ml-auto">
                          ✓
                        </span>
                      ) : null}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
