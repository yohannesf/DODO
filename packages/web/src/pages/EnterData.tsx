// Data entry (spec §8.3): spreadsheet-like grid over Dexie, full keyboard
// model, instant local saves, validation at entry time, Mark complete with a
// completeness summary. No Save button for values — by design.
import { useCallback, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  DEFAULT_CATEGORY_OPTION_COMBO_ID,
  collectRefs,
  evaluateRules,
  isValidPeriod,
  parseExpression,
  rulesForDataset,
  uuidv7,
  type CategoryOptionCombo,
  type DataElement,
  type Dataset,
  type OrgUnit,
  type RuleResult,
  type ValidationRule,
} from '@dodo/shared';
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  Field,
  Input,
  Select,
  Textarea,
  cx,
} from '../components';
import { getDb, hasDb, type ConflictRow, type LocalDataValue } from '../db/db';
import { enqueueSubmissionComplete } from '../sync/engine';
import { EntryCell, type CellFlags } from '../entry/EntryCell';
import { ConflictDialog } from '../entry/ConflictDialog';
import { Page } from './Page';

interface CommentTarget {
  label: string;
  existingId: string | null;
  current: string;
  save: (comment: string) => Promise<void>;
}

interface GridGroup {
  comboId: string | null;
  cocs: CategoryOptionCombo[];
  elements: Array<{ de: DataElement; required: boolean }>;
}

interface GridSection {
  name: string;
  groups: GridGroup[];
}

function useEntryModel(datasetId: string, orgUnitId: string, period: string) {
  const datasets = useLiveQuery(
    () => (hasDb() ? (getDb().datasets.toArray() as unknown as Promise<Dataset[]>) : []),
    [],
  );
  const orgUnits = useLiveQuery(
    () => (hasDb() ? getDb().orgUnits.orderBy('path').toArray() : []),
    [],
  );
  const dataElements = useLiveQuery(
    () =>
      hasDb()
        ? (getDb().dataElements.toArray() as unknown as Promise<DataElement[]>)
        : [],
    [],
  );
  const cocs = useLiveQuery(
    () => (hasDb() ? getDb().categoryOptionCombos.toArray() : []),
    [],
  );
  const categoryOptions = useLiveQuery(
    () => (hasDb() ? getDb().categoryOptions.toArray() : []),
    [],
  );
  const rules = useLiveQuery(
    () =>
      hasDb()
        ? (getDb().validationRules.toArray() as unknown as Promise<ValidationRule[]>)
        : [],
    [],
  );
  const values = useLiveQuery(
    () =>
      hasDb() && orgUnitId && period
        ? getDb()
            .dataValues.where('orgUnitId')
            .equals(orgUnitId)
            .filter((v) => v.period === period)
            .toArray()
        : [],
    [orgUnitId, period],
  );
  const conflicts = useLiveQuery(
    () =>
      hasDb()
        ? getDb()
            .conflicts.filter((c) => c.resolvedAt === null)
            .toArray()
        : [],
    [],
  );
  const submission = useLiveQuery(
    () =>
      hasDb() && datasetId && orgUnitId && period
        ? getDb()
            .submissions.where('[datasetId+orgUnitId+period]')
            .equals([datasetId, orgUnitId, period])
            .first()
        : undefined,
    [datasetId, orgUnitId, period],
  );

  return {
    datasets,
    orgUnits,
    dataElements,
    cocs,
    categoryOptions,
    rules,
    values,
    conflicts,
    submission,
  };
}

export function EnterData() {
  const [datasetId, setDatasetId] = useState(
    () => localStorage.getItem('dodo:entry:dataset') ?? '',
  );
  const [orgUnitId, setOrgUnitId] = useState(
    () => localStorage.getItem('dodo:entry:orgUnit') ?? '',
  );
  const [period, setPeriod] = useState(
    () => localStorage.getItem('dodo:entry:period') ?? '',
  );
  const persist = (k: string, v: string) => localStorage.setItem(`dodo:entry:${k}`, v);

  const model = useEntryModel(datasetId, orgUnitId, period);
  const dataset = model.datasets?.find((d) => d.id === datasetId) ?? null;
  const periodOk = period !== '' && isValidPeriod(period);
  const ready = dataset && orgUnitId && periodOk;

  const [conflictTarget, setConflictTarget] = useState<{
    conflict: ConflictRow;
    label: string;
  } | null>(null);
  const [commentTarget, setCommentTarget] = useState<CommentTarget | null>(null);
  const [completeOpen, setCompleteOpen] = useState(false);

  // --- grid model -------------------------------------------------------------

  const sections: GridSection[] = useMemo(() => {
    if (!dataset || !model.dataElements || !model.cocs) return [];
    const bySection = new Map<string, GridGroup[]>();
    for (const el of [...dataset.elements].sort((a, b) => a.sortOrder - b.sortOrder)) {
      const de = model.dataElements.find((d) => d.id === el.dataElementId);
      if (!de) continue;
      const groups = bySection.get(el.section) ?? [];
      const comboId = de.categoryComboId;
      let group = groups.length > 0 ? groups[groups.length - 1]! : null;
      if (!group || group.comboId !== comboId) {
        group = {
          comboId,
          cocs: comboId
            ? model.cocs
                .filter((c) => c.comboId === comboId)
                .sort((a, b) => a.name.localeCompare(b.name))
            : [],
          elements: [],
        };
        groups.push(group);
      }
      group.elements.push({ de, required: el.required });
      bySection.set(el.section, groups);
    }
    return [...bySection.entries()].map(([name, groups]) => ({ name, groups }));
  }, [dataset, model.dataElements, model.cocs]);

  // --- validation (spec §8.3: run at entry time, offline) ---------------------

  const ruleResults: RuleResult[] = useMemo(() => {
    if (!ready || !model.rules || !model.values) return [];
    return evaluateRules(rulesForDataset(model.rules, dataset.id), {
      values: model.values,
      dataElements: model.dataElements ?? [],
      categoryOptionCombos: model.cocs ?? [],
      categoryOptions: (model.categoryOptions ?? []) as Array<{
        id: string;
        code: string;
      }>,
    });
  }, [ready, dataset, model]);

  const failing = ruleResults.filter((r) => r.ok === false);

  // failing rule refs → cell flags (by data element, optionally narrowed)
  const cellFlags = useMemo(() => {
    const byDe = new Map<string, CellFlags>();
    if (!model.dataElements || !model.rules) return byDe;
    const deByCode = new Map(model.dataElements.map((d) => [d.code, d.id]));
    for (const result of failing) {
      const rule = model.rules.find((r) => r.id === result.ruleId);
      if (!rule) continue;
      const message = rule.instruction || `${result.display}`;
      for (const expr of [rule.leftExpr, rule.rightExpr]) {
        try {
          for (const ref of collectRefs(parseExpression(expr))) {
            const deId = deByCode.get(ref.dataElementCode);
            if (!deId) continue;
            const flags = byDe.get(deId) ?? { warnings: [], errors: [] };
            (result.severity === 'error' ? flags.errors : flags.warnings).push(message);
            byDe.set(deId, flags);
          }
        } catch {
          /* rule exprs are validated at save time */
        }
      }
    }
    return byDe;
  }, [failing, model.dataElements, model.rules]);

  const conflictsByValueId = useMemo(() => {
    const map = new Map<string, ConflictRow>();
    for (const c of model.conflicts ?? []) {
      const payload = c.localPayload as LocalDataValue;
      map.set(payload.id, c);
    }
    return map;
  }, [model.conflicts]);

  const valueByCell = useMemo(() => {
    const map = new Map<string, LocalDataValue>();
    for (const v of model.values ?? []) {
      map.set(`${v.dataElementId}:${v.categoryOptionComboId}`, v);
    }
    return map;
  }, [model.values]);

  // --- keyboard model (spec §8.3) ----------------------------------------------

  const gridRef = useRef<HTMLDivElement>(null);
  const onGridKeyDown = useCallback((e: React.KeyboardEvent) => {
    const target = e.target as HTMLElement;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      setCompleteOpen(true);
      return;
    }
    if (!target.matches('input[data-entry-cell]')) return;
    const row = Number(target.dataset.row);
    const col = Number(target.dataset.col);
    let next: { row: number; col: number } | null = null;
    if (e.key === 'ArrowDown' || e.key === 'Enter') next = { row: row + 1, col };
    else if (e.key === 'ArrowUp') next = { row: row - 1, col };
    else if (e.key === 'ArrowLeft' && e.altKey) next = { row, col: col - 1 };
    else if (e.key === 'ArrowRight' && e.altKey) next = { row, col: col + 1 };
    if (!next) return;
    e.preventDefault();
    const rowInputs = [
      ...(gridRef.current?.querySelectorAll<HTMLInputElement>(
        `input[data-row="${next.row}"]`,
      ) ?? []),
    ];
    if (rowInputs.length === 0) return;
    const clamped = Math.max(0, Math.min(next.col, rowInputs.length - 1));
    rowInputs.find((i) => Number(i.dataset.col) === clamped)?.focus();
  }, []);

  // --- completeness ------------------------------------------------------------

  const completeness = useMemo(() => {
    let requiredCells = 0;
    let requiredFilled = 0;
    let totalCells = 0;
    let filled = 0;
    for (const section of sections) {
      for (const group of section.groups) {
        const cocIds =
          group.cocs.length > 0
            ? group.cocs.map((c) => c.id)
            : [DEFAULT_CATEGORY_OPTION_COMBO_ID];
        for (const { de, required } of group.elements) {
          for (const cocId of cocIds) {
            totalCells++;
            const has = valueByCell.has(`${de.id}:${cocId}`);
            if (has) filled++;
            if (required) {
              requiredCells++;
              if (has) requiredFilled++;
            }
          }
        }
      }
    }
    return { totalCells, filled, requiredCells, requiredFilled };
  }, [sections, valueByCell]);

  const errors = failing.filter((r) => r.severity === 'error');
  const warnings = failing.filter((r) => r.severity === 'warning');

  // --- render -------------------------------------------------------------------

  if (!model.datasets || model.datasets.length === 0) {
    return (
      <Page number="01" title="Enter Data">
        <p data-testid="enter-data-empty">
          Nothing to enter yet. Either no datasets are assigned to your org units, or the
          first sync has not completed — check the sync chip above.
        </p>
      </Page>
    );
  }

  let rowCounter = -1;

  return (
    <Page number="01" title="Enter Data">
      <div className="grid max-w-4xl grid-cols-3 gap-3">
        <Field label="Dataset">
          <Select
            value={datasetId}
            onChange={(e) => {
              setDatasetId(e.target.value);
              persist('dataset', e.target.value);
            }}
          >
            <option value="">choose…</option>
            {model.datasets.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Org unit">
          <Select
            value={orgUnitId}
            onChange={(e) => {
              setOrgUnitId(e.target.value);
              persist('orgUnit', e.target.value);
            }}
            disabled={!dataset}
          >
            <option value="">choose…</option>
            {(model.orgUnits ?? [])
              .filter((o: OrgUnit) => dataset?.orgUnitIds.includes(o.id))
              .map((o) => (
                <option key={o.id} value={o.id}>
                  {' '.repeat((o.level - 1) * 2)}
                  {o.name}
                </option>
              ))}
          </Select>
        </Field>
        <Field
          label={`Period (${dataset?.frequency.toLowerCase() ?? '—'})`}
          error={period !== '' && !periodOk ? 'not a valid period' : undefined}
        >
          {dataset?.frequency === 'MONTHLY' ? (
            <Input
              type="month"
              value={period}
              onChange={(e) => {
                setPeriod(e.target.value);
                persist('period', e.target.value);
              }}
            />
          ) : (
            <Input
              placeholder={
                dataset?.frequency === 'QUARTERLY'
                  ? '2026-Q2'
                  : dataset?.frequency === 'YEARLY'
                    ? '2026'
                    : '2026-05-14'
              }
              value={period}
              onChange={(e) => {
                setPeriod(e.target.value);
                persist('period', e.target.value);
              }}
            />
          )}
        </Field>
      </div>

      {ready ? (
        <div className="mt-6 grid max-w-5xl grid-cols-[1fr_190px] gap-8">
          <div ref={gridRef} data-testid="entry-form" onKeyDown={onGridKeyDown}>
            {sections.map((section) => (
              <section
                key={section.name || '_'}
                id={`section-${section.name}`}
                className="mb-6"
              >
                {section.name ? (
                  <h2 className="small-caps mb-1.5 font-medium text-ink-muted">
                    {section.name}
                  </h2>
                ) : null}
                {section.groups.map((group, gi) => (
                  <table key={gi} className="mb-3 w-full border-collapse">
                    <thead>
                      {group.cocs.length > 0 ? (
                        <tr>
                          <th className="w-2/5" />
                          {group.cocs.map((coc) => (
                            <th
                              key={coc.id}
                              className="small-caps border-b border-ink px-2 pb-1 text-right font-medium text-ink-muted"
                            >
                              {coc.name}
                            </th>
                          ))}
                        </tr>
                      ) : (
                        <tr>
                          <th className="w-2/5" />
                          <th className="border-b border-ink" />
                        </tr>
                      )}
                    </thead>
                    <tbody>
                      {group.elements.map(({ de, required }) => {
                        rowCounter++;
                        const row = rowCounter;
                        const cocsForRow =
                          group.cocs.length > 0
                            ? group.cocs
                            : [
                                {
                                  id: DEFAULT_CATEGORY_OPTION_COMBO_ID,
                                  name: null as string | null,
                                },
                              ];
                        const flags = cellFlags.get(de.id) ?? {
                          warnings: [],
                          errors: [],
                        };
                        return (
                          <tr key={de.id} className="border-b border-hairline">
                            <td className="py-1 pr-3 text-sm">
                              {de.name}
                              {required ? (
                                <span className="ml-1 text-offtrack">*</span>
                              ) : null}
                              {de.unitOfMeasure ? (
                                <span className="small-caps ml-2 text-ink-muted">
                                  {de.unitOfMeasure}
                                </span>
                              ) : null}
                            </td>
                            {cocsForRow.map((coc, ci) => {
                              const existing = valueByCell.get(`${de.id}:${coc.id}`);
                              return (
                                <td key={coc.id} className="py-0.5 pl-6">
                                  <EntryCell
                                    dataElement={de}
                                    cocId={coc.id}
                                    cocName={'name' in coc ? coc.name : null}
                                    orgUnitId={orgUnitId}
                                    period={period}
                                    row={row}
                                    col={ci}
                                    flags={flags}
                                    conflict={
                                      existing
                                        ? (conflictsByValueId.get(existing.id) ?? null)
                                        : null
                                    }
                                    onConflictClick={(conflict, label) =>
                                      setConflictTarget({ conflict, label })
                                    }
                                    onCommentClick={setCommentTarget}
                                  />
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                ))}
              </section>
            ))}
          </div>

          <aside className="text-sm">
            <div className="sticky top-4 space-y-4">
              <div className="border border-hairline bg-surface p-3">
                <p className="small-caps mb-1 text-ink-muted">completeness</p>
                <p className="tnum text-2xl font-semibold">
                  {completeness.filled}
                  <span className="text-ink-muted">/{completeness.totalCells}</span>
                </p>
                <p className="text-[12px] text-ink-muted">
                  required {completeness.requiredFilled}/{completeness.requiredCells}
                </p>
                {model.submission ? (
                  <p
                    className="small-caps mt-2 text-ontrack"
                    data-testid="submission-status"
                  >
                    ● {String((model.submission as { status?: string }).status)}
                  </p>
                ) : null}
              </div>
              {failing.length > 0 ? (
                <div className="border border-hairline bg-surface p-3">
                  <p className="small-caps mb-1 text-ink-muted">checks</p>
                  <ul className="space-y-1">
                    {failing.map((r) => (
                      <li
                        key={r.ruleId}
                        className={cx(
                          'text-[12px]',
                          r.severity === 'error' ? 'text-offtrack' : 'text-ochre',
                        )}
                      >
                        ▲ {r.name}
                        {r.instruction ? ` — ${r.instruction}` : ''}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <Button
                variant="primary"
                className="w-full justify-center"
                onClick={() => setCompleteOpen(true)}
              >
                Mark complete…
              </Button>
              <p className="text-[11px] text-ink-muted">
                Values save to this device instantly; there is no save button. Ctrl+S
                opens completion.
              </p>
            </div>
          </aside>
        </div>
      ) : (
        <p className="mt-6 text-sm text-ink-muted">
          Choose a dataset, org unit, and period — entry works fully offline.
        </p>
      )}

      <ConflictDialog
        conflict={conflictTarget?.conflict ?? null}
        cellLabel={conflictTarget?.label}
        onClose={() => setConflictTarget(null)}
      />
      <CommentDialog target={commentTarget} onClose={() => setCommentTarget(null)} />
      {ready ? (
        <CompleteDialog
          open={completeOpen}
          onClose={() => setCompleteOpen(false)}
          dataset={dataset}
          orgUnitId={orgUnitId}
          period={period}
          completeness={completeness}
          errors={errors}
          warnings={warnings}
          existingSubmissionId={
            (model.submission as { id?: string } | undefined)?.id ?? null
          }
        />
      ) : null}
    </Page>
  );
}

function CommentDialog({
  target,
  onClose,
}: {
  target: CommentTarget | null;
  onClose: () => void;
}) {
  const [comment, setComment] = useState('');
  return (
    <Dialog
      open={target !== null}
      onOpenChange={(o) => {
        if (!o) onClose();
        else setComment(target?.current ?? '');
      }}
    >
      <DialogContent title="Cell comment" description={target?.label}>
        <div className="mt-3 space-y-3">
          {target?.existingId === null ? (
            <p className="text-[12px] text-ochre">
              ▲ enter a value first, then attach the comment
            </p>
          ) : (
            <>
              <Textarea
                rows={3}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="why this value is unusual, data source, …"
              />
              <div className="flex justify-end gap-2">
                <DialogClose asChild>
                  <Button>Cancel</Button>
                </DialogClose>
                <Button
                  variant="primary"
                  onClick={() => void target?.save(comment).then(onClose)}
                >
                  Save comment
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CompleteDialog({
  open,
  onClose,
  dataset,
  orgUnitId,
  period,
  completeness,
  errors,
  warnings,
  existingSubmissionId,
}: {
  open: boolean;
  onClose: () => void;
  dataset: Dataset;
  orgUnitId: string;
  period: string;
  completeness: {
    totalCells: number;
    filled: number;
    requiredCells: number;
    requiredFilled: number;
  };
  errors: RuleResult[];
  warnings: RuleResult[];
  existingSubmissionId: string | null;
}) {
  const [note, setNote] = useState('');
  const requiredMissing = completeness.requiredCells - completeness.requiredFilled;
  const blocked = errors.length > 0 || requiredMissing > 0;
  const needsNote = warnings.length > 0 && note.trim() === '';

  async function confirm() {
    await enqueueSubmissionComplete({
      id: existingSubmissionId ?? uuidv7(),
      datasetId: dataset.id,
      orgUnitId,
      period,
      note,
    });
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title={`Mark ${dataset.name} complete`}
        description={`${period} — runs all validation rules before confirming.`}
        className="w-[min(520px,calc(100vw-2rem))]"
      >
        <div className="mt-4 space-y-3 text-sm" data-testid="complete-summary">
          <dl className="space-y-1">
            <div className="flex justify-between border-b border-hairline py-1">
              <dt className="text-ink-muted">Cells filled</dt>
              <dd className="tnum">
                {completeness.filled}/{completeness.totalCells}
              </dd>
            </div>
            <div className="flex justify-between border-b border-hairline py-1">
              <dt className="text-ink-muted">Required</dt>
              <dd className={cx('tnum', requiredMissing > 0 && 'text-offtrack')}>
                {completeness.requiredFilled}/{completeness.requiredCells}
              </dd>
            </div>
          </dl>
          {errors.length > 0 ? (
            <div>
              <p className="small-caps text-offtrack">errors — block completion</p>
              <ul className="mt-1 space-y-0.5 text-[12px] text-offtrack">
                {errors.map((r) => (
                  <li key={r.ruleId}>
                    ▲ {r.name} ({r.display})
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {warnings.length > 0 ? (
            <div>
              <p className="small-caps text-ochre">warnings — explain to continue</p>
              <ul className="mt-1 space-y-0.5 text-[12px] text-ochre">
                {warnings.map((r) => (
                  <li key={r.ruleId}>
                    ▲ {r.name} ({r.display})
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <Field
            label={warnings.length > 0 ? 'Note (required — warnings overridden)' : 'Note'}
          >
            <Input value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <div className="flex justify-end gap-2 pt-1">
            <DialogClose asChild>
              <Button>Cancel</Button>
            </DialogClose>
            <Button
              variant="primary"
              disabled={blocked || needsNote}
              onClick={() => void confirm()}
            >
              {blocked
                ? requiredMissing > 0
                  ? `${requiredMissing} required missing`
                  : 'errors block completion'
                : 'Complete submission'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
