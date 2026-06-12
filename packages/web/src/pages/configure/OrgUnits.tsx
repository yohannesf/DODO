import { useMemo, useState } from 'react';
import type { OrgUnit } from '@dodo/shared';
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  Field,
  Input,
  TBody,
  Table,
  Td,
  Th,
  THead,
  Tr,
  Textarea,
  cx,
} from '../../components';
import {
  importOrgUnitsCsv,
  importOrgUnitsGeoJson,
  useEntityList,
  useEntityMutations,
  type CsvImportReport,
} from '../../api/metadata';
import { EmptyHint, ErrorNote, SectionTitle } from './common';

function OrgUnitForm({
  unit,
  parent,
  onDone,
}: {
  unit: OrgUnit | null; // null = creating
  parent: OrgUnit | null;
  onDone: () => void;
}) {
  const { create, update } = useEntityMutations('orgUnits');
  const [name, setName] = useState(unit?.name ?? '');
  const [shortName, setShortName] = useState(unit?.shortName ?? '');
  const [code, setCode] = useState(unit?.code ?? '');
  const [openingDate, setOpeningDate] = useState(unit?.openingDate ?? '');
  const mutation = unit ? update : create;

  function submit() {
    const base = {
      name,
      shortName: shortName || name,
      code,
      openingDate: openingDate || null,
    };
    const promise = unit
      ? update.mutateAsync({ id: unit.id, patch: base })
      : create.mutateAsync({ ...base, parentId: parent?.id ?? null });
    void promise.then(onDone).catch(() => {});
  }

  return (
    <div className="mt-4 space-y-3">
      {parent ? (
        <p className="text-[12px] text-ink-muted">
          Parent: <span className="font-medium text-ink">{parent.name}</span>
        </p>
      ) : null}
      <Field label="Name">
        <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Short name">
          <Input value={shortName} onChange={(e) => setShortName(e.target.value)} />
        </Field>
        <Field label="Code">
          <Input value={code} onChange={(e) => setCode(e.target.value)} />
        </Field>
      </div>
      <Field label="Opening date">
        <Input
          type="date"
          value={openingDate ?? ''}
          onChange={(e) => setOpeningDate(e.target.value)}
        />
      </Field>
      <ErrorNote error={mutation.error} />
      <div className="flex justify-end gap-2 pt-1">
        <DialogClose asChild>
          <Button>Cancel</Button>
        </DialogClose>
        <Button variant="primary" onClick={submit} disabled={mutation.isPending}>
          {unit ? 'Save' : 'Create'}
        </Button>
      </div>
    </div>
  );
}

function CsvImportDialog({ onDone }: { onDone: () => void }) {
  const [csv, setCsv] = useState('');
  const [report, setReport] = useState<CsvImportReport | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  async function run(dryRun: boolean) {
    setBusy(true);
    setError(null);
    try {
      const r = await importOrgUnitsCsv(csv, dryRun);
      setReport(r);
      if (!dryRun && r.errors === 0) onDone();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 space-y-3">
      <Field
        label="CSV"
        hint="columns: code,name,short_name,parent_code,opening_date,latitude,longitude"
      >
        <Textarea
          rows={8}
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
          placeholder={
            'code,name,short_name,parent_code,opening_date,latitude,longitude\nTL,Testland,TL,,,,'
          }
        />
      </Field>
      <div className="flex justify-end gap-2">
        <Button onClick={() => run(true)} disabled={busy || !csv.trim()}>
          Dry run
        </Button>
        <Button
          variant="primary"
          onClick={() => run(false)}
          disabled={busy || !csv.trim() || !report || report.errors > 0}
        >
          Apply
        </Button>
      </div>
      <ErrorNote error={error} />
      {report ? (
        <div data-testid="csv-report">
          <p className="text-sm">
            {report.dryRun ? 'Dry run: ' : 'Applied: '}
            <span className="tnum">{report.created}</span> to create,{' '}
            <span className="tnum">{report.updated}</span> to update,{' '}
            <span className={cx('tnum', report.errors > 0 && 'text-offtrack')}>
              {report.errors}
            </span>{' '}
            errors
          </p>
          {report.rows.filter((r) => r.action === 'error').length > 0 ? (
            <Table className="mt-2">
              <THead>
                <Tr>
                  <Th numeric>Line</Th>
                  <Th>Code</Th>
                  <Th>Problem</Th>
                </Tr>
              </THead>
              <TBody>
                {report.rows
                  .filter((r) => r.action === 'error')
                  .map((r) => (
                    <Tr key={r.line}>
                      <Td numeric>{r.line}</Td>
                      <Td className="font-mono text-[12px]">{r.code}</Td>
                      <Td className="text-offtrack">{r.message}</Td>
                    </Tr>
                  ))}
              </TBody>
            </Table>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function GeoJsonImportDialog({ onDone }: { onDone: () => void }) {
  const [text, setText] = useState('');
  const [result, setResult] = useState<{ matched: number; unmatched: string[] } | null>(
    null,
  );
  const [error, setError] = useState<unknown>(null);

  async function run() {
    setError(null);
    try {
      const r = await importOrgUnitsGeoJson(JSON.parse(text));
      setResult(r);
      if (r.unmatched.length === 0) onDone();
    } catch (e) {
      setError(e);
    }
  }

  return (
    <div className="mt-4 space-y-3">
      <Field
        label="GeoJSON FeatureCollection"
        hint="features are matched to org units by properties.code"
      >
        <Textarea rows={8} value={text} onChange={(e) => setText(e.target.value)} />
      </Field>
      <div className="flex justify-end">
        <Button variant="primary" onClick={run} disabled={!text.trim()}>
          Import geometry
        </Button>
      </div>
      <ErrorNote error={error} />
      {result ? (
        <p className="text-sm">
          <span className="tnum">{result.matched}</span> matched
          {result.unmatched.length > 0
            ? `; unmatched: ${result.unmatched.join(', ')}`
            : ''}
        </p>
      ) : null}
    </div>
  );
}

function LevelsEditor() {
  const levels = useEntityList('orgUnitLevels');
  const { create, remove } = useEntityMutations('orgUnitLevels');
  const [name, setName] = useState('');
  const nextLevel = (levels.data?.length ?? 0) + 1;

  return (
    <div className="mt-8 max-w-md">
      <SectionTitle title="Level names" />
      <ul className="space-y-1">
        {levels.data
          ?.slice()
          .sort((a, b) => a.level - b.level)
          .map((l) => (
            <li key={l.id} className="flex items-center justify-between text-sm">
              <span>
                <span className="tnum mr-2 text-ink-muted">{l.level}</span>
                {l.name}
              </span>
              <Button size="sm" variant="ghost" onClick={() => remove.mutate(l.id)}>
                Remove
              </Button>
            </li>
          ))}
      </ul>
      <div className="mt-2 flex gap-2">
        <Input
          placeholder={`Name for level ${nextLevel} (e.g. Region)`}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Button
          onClick={() =>
            create.mutate({ level: nextLevel, name }, { onSuccess: () => setName('') })
          }
          disabled={!name.trim()}
        >
          Add
        </Button>
      </div>
      <ErrorNote error={create.error ?? remove.error} />
    </div>
  );
}

export function OrgUnitsPage() {
  const list = useEntityList('orgUnits');
  const levels = useEntityList('orgUnitLevels');
  const { remove } = useEntityMutations('orgUnits');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<'create' | 'edit' | 'csv' | 'geojson' | null>(
    null,
  );
  const [createUnderSelected, setCreateUnderSelected] = useState(false);

  // list is path-ordered from the API → already depth-first
  const units = useMemo(() => list.data ?? [], [list.data]);
  const selected = units.find((u) => u.id === selectedId) ?? null;
  const levelName = (n: number) =>
    levels.data?.find((l) => l.level === n)?.name ?? `Level ${n}`;

  return (
    <section className="max-w-4xl">
      <SectionTitle
        title="Org units"
        actions={
          <div className="flex gap-2">
            <Button onClick={() => setDialog('csv')}>Import CSV…</Button>
            <Button onClick={() => setDialog('geojson')}>Import GeoJSON…</Button>
            <Button
              variant="primary"
              onClick={() => {
                setCreateUnderSelected(false);
                setDialog('create');
              }}
            >
              New root unit
            </Button>
          </div>
        }
      />

      {units.length === 0 ? (
        <EmptyHint>
          No org units yet. Create the top of your hierarchy (usually the country or
          organisation), then add regions, districts, and facilities beneath it — or paste
          a CSV.
        </EmptyHint>
      ) : (
        <div className="grid grid-cols-[1fr_280px] gap-6">
          <ul data-testid="org-unit-tree" className="border-t border-hairline">
            {units.map((u) => (
              <li key={u.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(u.id === selectedId ? null : u.id)}
                  className={cx(
                    'flex w-full items-baseline gap-2 border-b border-hairline px-2 py-1.5 text-left text-sm',
                    u.id === selectedId ? 'bg-surface text-cobalt' : 'hover:bg-surface',
                  )}
                  style={{ paddingLeft: `${(u.level - 1) * 18 + 8}px` }}
                >
                  <span className={u.id === selectedId ? 'font-medium' : ''}>
                    {u.name}
                  </span>
                  <span className="font-mono text-[11px] text-ink-muted">{u.code}</span>
                  {u.geometry ? (
                    <span className="small-caps ml-auto text-ink-muted">geo</span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>

          <aside>
            {selected ? (
              <div className="space-y-2 border border-hairline bg-surface p-3 text-sm">
                <p className="font-medium">{selected.name}</p>
                <p className="text-ink-muted">
                  {levelName(selected.level)} · code{' '}
                  <span className="font-mono text-[12px]">{selected.code}</span>
                </p>
                <div className="flex flex-wrap gap-2 pt-2">
                  <Button
                    size="sm"
                    onClick={() => {
                      setCreateUnderSelected(true);
                      setDialog('create');
                    }}
                  >
                    Add child
                  </Button>
                  <Button size="sm" onClick={() => setDialog('edit')}>
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      remove.mutate(selected.id, { onSuccess: () => setSelectedId(null) })
                    }
                  >
                    Delete
                  </Button>
                </div>
                <ErrorNote error={remove.error} />
              </div>
            ) : (
              <p className="text-[12px] text-ink-muted">
                Select an org unit to edit it or add children.
              </p>
            )}
          </aside>
        </div>
      )}

      <LevelsEditor />

      <Dialog
        open={dialog === 'create' || dialog === 'edit'}
        onOpenChange={(o) => !o && setDialog(null)}
      >
        <DialogContent
          title={
            dialog === 'edit'
              ? `Edit ${selected?.name ?? ''}`
              : createUnderSelected && selected
                ? `New org unit under ${selected.name}`
                : 'New root org unit'
          }
        >
          <OrgUnitForm
            unit={dialog === 'edit' ? selected : null}
            parent={dialog === 'create' && createUnderSelected ? selected : null}
            onDone={() => setDialog(null)}
          />
        </DialogContent>
      </Dialog>
      <Dialog open={dialog === 'csv'} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent
          title="Import org units from CSV"
          description="Dry-run first; nothing is written until you apply a clean run."
          className="w-[min(640px,calc(100vw-2rem))]"
        >
          <CsvImportDialog onDone={() => setDialog(null)} />
        </DialogContent>
      </Dialog>
      <Dialog open={dialog === 'geojson'} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent
          title="Import boundaries / points from GeoJSON"
          className="w-[min(640px,calc(100vw-2rem))]"
        >
          <GeoJsonImportDialog onDone={() => setDialog(null)} />
        </DialogContent>
      </Dialog>
    </section>
  );
}
