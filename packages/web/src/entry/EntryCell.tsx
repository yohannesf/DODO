// One grid cell (spec §8.3): instant local save, Esc revert, right-click
// comment, states: ● saved-local (pending sync), no mark (synced), ochre
// underline (warning), red underline (error), ▲ (conflict → resolver).
import { useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { uuidv7, validateValue, type DataElement, type ValueType } from '@dodo/shared';
import { cx } from '../components';
import { getDb, type ConflictRow } from '../db/db';
import { enqueueDataValue } from '../sync/engine';

export interface CellFlags {
  warnings: string[];
  errors: string[];
}

export interface EntryCellProps {
  dataElement: DataElement;
  cocId: string;
  cocName: string | null;
  orgUnitId: string;
  period: string;
  row: number;
  col: number;
  flags: CellFlags;
  conflict: ConflictRow | null;
  onConflictClick: (conflict: ConflictRow, label: string) => void;
  onCommentClick: (args: {
    label: string;
    existingId: string | null;
    save: (comment: string) => Promise<void>;
    current: string;
  }) => void;
}

export function EntryCell({
  dataElement,
  cocId,
  cocName,
  orgUnitId,
  period,
  row,
  col,
  flags,
  conflict,
  onConflictClick,
  onCommentClick,
}: EntryCellProps) {
  const existing = useLiveQuery(
    () =>
      getDb()
        .dataValues.where('[dataElementId+orgUnitId+period+categoryOptionComboId]')
        .equals([dataElement.id, orgUnitId, period, cocId])
        .first()
        .then((r) => r ?? null),
    [dataElement.id, orgUnitId, period, cocId],
  );
  const pending = useLiveQuery(async () => {
    if (!existing) return false;
    const ops = await getDb()
      .outbox.where('state')
      .anyOf('pending', 'inflight')
      .toArray();
    return ops.some((o) => (o.payload as { id?: string }).id === existing.id);
  }, [existing?.id]);

  const [draft, setDraft] = useState<string | null>(null);
  const [typeError, setTypeError] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const saving = useRef(false);
  const value = draft ?? existing?.value ?? '';
  const label = cocName ? `${dataElement.name} — ${cocName}` : dataElement.name;

  async function save() {
    if (saving.current || existing === undefined) return;
    if (draft === null || draft === (existing?.value ?? '')) return;
    if (draft === '') {
      setTypeError(null);
      return;
    }
    const problem = validateValue(dataElement.valueType as ValueType, draft);
    setTypeError(problem);
    if (problem) return;
    saving.current = true;
    try {
      await enqueueDataValue(
        {
          id: existing?.id ?? uuidv7(),
          dataElementId: dataElement.id,
          orgUnitId,
          period,
          categoryOptionComboId: cocId,
          value: draft,
          comment: existing?.comment ?? '',
        },
        existing?.version,
      );
      setDraft(null);
    } finally {
      saving.current = false;
    }
  }

  const message =
    typeError ?? flags.errors[0] ?? (focused ? flags.warnings[0] : undefined);

  return (
    <div className="relative">
      <input
        aria-label={label}
        value={value}
        disabled={existing === undefined}
        data-row={row}
        data-col={col}
        data-entry-cell
        inputMode={dataElement.valueType.startsWith('INTEGER') ? 'numeric' : 'text'}
        className={cx(
          'tnum h-7 w-full min-w-20 border bg-transparent px-1.5 text-right text-sm',
          'focus:outline-none',
          typeError || flags.errors.length > 0
            ? 'border-transparent border-b-offtrack focus:border-offtrack'
            : flags.warnings.length > 0
              ? 'border-transparent border-b-ochre focus:border-ochre'
              : 'border-transparent focus:border-cobalt',
        )}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          void save();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            // Esc reverts the cell (spec §8.3)
            setDraft(null);
            setTypeError(null);
            e.stopPropagation();
          }
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          onCommentClick({
            label,
            existingId: existing?.id ?? null,
            current: existing?.comment ?? '',
            save: async (comment: string) => {
              if (!existing) return;
              await enqueueDataValue({ ...existing, comment }, existing.version);
            },
          });
        }}
      />
      <span className="pointer-events-none absolute top-1/2 -left-3 -translate-y-1/2 text-[10px]">
        {conflict ? (
          <button
            type="button"
            className="pointer-events-auto cursor-pointer text-offtrack"
            title="conflict — click to resolve"
            onClick={() => onConflictClick(conflict, label)}
          >
            ▲
          </button>
        ) : pending ? (
          <span className="text-cobalt" title="saved on this device, not yet synced">
            ●
          </span>
        ) : existing?.comment ? (
          <span className="text-ink-muted" title={existing.comment}>
            ◦
          </span>
        ) : null}
      </span>
      {message && focused ? (
        <p
          className={cx(
            'absolute top-full left-0 z-10 mt-0.5 border bg-surface px-1.5 py-0.5 text-[11px] whitespace-nowrap',
            typeError || flags.errors.length > 0
              ? 'border-offtrack text-offtrack'
              : 'border-ochre text-ochre',
          )}
        >
          ▲ {message}
        </p>
      ) : null}
    </div>
  );
}
