// Minimal offline-first entry form (ADR 002): reads and writes go to Dexie
// only; sync replicates in the background. The full keyboard grid (spec
// §8.3) replaces this in M3.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  DEFAULT_CATEGORY_OPTION_COMBO_ID,
  isValidPeriod,
  uuidv7,
  validateValue,
  type CategoryOptionCombo,
  type Dataset,
  type DataElement,
  type OrgUnit,
  type ValueType,
} from '@dodo/shared';
import { Field, Input, Select, cx } from '../components';
import { getDb, hasDb } from '../db/db';
import { enqueueDataValue } from '../sync/engine';
import { Page } from './Page';

interface CellProps {
  dataElement: DataElement;
  cocId: string;
  cocName: string | null;
  orgUnitId: string;
  period: string;
}

function Cell({ dataElement, cocId, cocName, orgUnitId, period }: CellProps) {
  // resolves to the row or null — undefined means "still loading", during
  // which the input stays disabled so a save can never use a stale base
  const existing = useLiveQuery(
    () =>
      getDb()
        .dataValues.where('[dataElementId+orgUnitId+period+categoryOptionComboId]')
        .equals([dataElement.id, orgUnitId, period, cocId])
        .first()
        .then((row) => row ?? null),
    [dataElement.id, orgUnitId, period, cocId],
  );
  const pending = useLiveQuery(async () => {
    if (!existing) return false;
    const ops = await getDb().outbox.toArray();
    return ops.some((o) => (o.payload as { id?: string }).id === existing.id);
  }, [existing?.id]);

  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const saving = useRef(false);
  const value = draft ?? existing?.value ?? '';

  async function save() {
    // Enter saves; the following blur must not double-enqueue the cell
    if (saving.current || existing === undefined) return;
    if (draft === null || draft === (existing?.value ?? '')) return;
    if (draft === '') {
      setError(null);
      return; // value deletion ships with the M3 grid
    }
    const problem = validateValue(dataElement.valueType as ValueType, draft);
    setError(problem);
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

  return (
    <div className="flex items-center justify-between gap-3 border-b border-hairline py-1.5">
      <span className="text-sm">
        {dataElement.name}
        {cocName ? <span className="text-ink-muted"> — {cocName}</span> : null}
        {dataElement.unitOfMeasure ? (
          <span className="small-caps ml-2 text-ink-muted">
            {dataElement.unitOfMeasure}
          </span>
        ) : null}
      </span>
      <span className="flex items-center gap-2">
        {error ? <span className="text-[12px] text-offtrack">▲ {error}</span> : null}
        {pending ? (
          <span className="text-cobalt" title="saved locally, not yet synced">
            ●
          </span>
        ) : null}
        <Input
          aria-label={`${dataElement.name}${cocName ? ` ${cocName}` : ''}`}
          value={value}
          disabled={existing === undefined}
          inputMode={dataElement.valueType.startsWith('INTEGER') ? 'numeric' : 'text'}
          className={cx('tnum w-32 text-right', error && 'border-offtrack')}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => void save()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void save();
          }}
        />
      </span>
    </div>
  );
}

export function EnterData() {
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

  const [datasetId, setDatasetId] = useState(
    () => localStorage.getItem('dodo:entry:dataset') ?? '',
  );
  const [orgUnitId, setOrgUnitId] = useState(
    () => localStorage.getItem('dodo:entry:orgUnit') ?? '',
  );
  const [period, setPeriod] = useState(
    () => localStorage.getItem('dodo:entry:period') ?? '',
  );

  useEffect(() => {
    localStorage.setItem('dodo:entry:dataset', datasetId);
    localStorage.setItem('dodo:entry:orgUnit', orgUnitId);
    localStorage.setItem('dodo:entry:period', period);
  }, [datasetId, orgUnitId, period]);

  const dataset = datasets?.find((d) => d.id === datasetId) ?? null;
  const assignedOrgUnits = useMemo(
    () => (orgUnits ?? []).filter((o: OrgUnit) => dataset?.orgUnitIds.includes(o.id)),
    [orgUnits, dataset],
  );
  const periodOk = period !== '' && isValidPeriod(period);

  const rows = useMemo(() => {
    if (!dataset || !dataElements || !cocs) return [];
    const bySection = new Map<
      string,
      Array<{ de: DataElement; coc: CategoryOptionCombo | null }>
    >();
    for (const el of [...dataset.elements].sort((a, b) => a.sortOrder - b.sortOrder)) {
      const de = dataElements.find((d) => d.id === el.dataElementId);
      if (!de) continue;
      const list = bySection.get(el.section) ?? [];
      if (de.categoryComboId) {
        for (const coc of cocs
          .filter((c) => c.comboId === de.categoryComboId)
          .sort((a, b) => a.name.localeCompare(b.name))) {
          list.push({ de, coc });
        }
      } else {
        list.push({ de, coc: null });
      }
      bySection.set(el.section, list);
    }
    return [...bySection.entries()];
  }, [dataset, dataElements, cocs]);

  if (!datasets || datasets.length === 0) {
    return (
      <Page number="01" title="Enter Data">
        <p data-testid="enter-data-empty">
          Nothing to enter yet. Either no datasets are assigned to your org units, or the
          first sync has not completed — check the sync chip above.
        </p>
      </Page>
    );
  }

  return (
    <Page number="01" title="Enter Data">
      <div className="grid max-w-3xl grid-cols-3 gap-3">
        <Field label="Dataset">
          <Select value={datasetId} onChange={(e) => setDatasetId(e.target.value)}>
            <option value="">choose…</option>
            {datasets.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Org unit">
          <Select
            value={orgUnitId}
            onChange={(e) => setOrgUnitId(e.target.value)}
            disabled={!dataset}
          >
            <option value="">choose…</option>
            {assignedOrgUnits.map((o) => (
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
              onChange={(e) => setPeriod(e.target.value)}
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
              onChange={(e) => setPeriod(e.target.value)}
            />
          )}
        </Field>
      </div>

      {dataset && orgUnitId && periodOk ? (
        <div data-testid="entry-form" className="mt-6 max-w-3xl">
          {rows.map(([section, cells]) => (
            <section key={section} className="mb-5">
              {section ? (
                <h2 className="small-caps mb-1 font-medium text-ink-muted">{section}</h2>
              ) : null}
              {cells.map(({ de, coc }) => (
                <Cell
                  key={`${de.id}:${coc?.id ?? 'default'}:${orgUnitId}:${period}`}
                  dataElement={de}
                  cocId={coc?.id ?? DEFAULT_CATEGORY_OPTION_COMBO_ID}
                  cocName={coc?.name ?? null}
                  orgUnitId={orgUnitId}
                  period={period}
                />
              ))}
            </section>
          ))}
        </div>
      ) : (
        <p className="mt-6 text-sm text-ink-muted">
          Choose a dataset, org unit, and period — entry works fully offline.
        </p>
      )}
    </Page>
  );
}
