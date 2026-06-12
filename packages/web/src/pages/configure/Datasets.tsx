import { useMemo, useState } from 'react';
import { FREQUENCIES, type Dataset, type OrgUnit } from '@dodo/shared';
import {
  Button,
  Checkbox,
  Field,
  Input,
  Select,
  TBody,
  Table,
  Td,
  Th,
  THead,
  Tr,
} from '../../components';
import { useEntityList, useEntityMutations } from '../../api/metadata';
import { EmptyHint, ErrorNote, SectionTitle } from './common';

interface ElementRow {
  dataElementId: string;
  section: string;
  required: boolean;
}

function OrgUnitPicker({
  selected,
  onChange,
}: {
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  const orgUnits = useEntityList('orgUnits');
  const units = orgUnits.data ?? [];

  const subtreeOf = (root: OrgUnit) =>
    units.filter((u) => u.path === root.path || u.path.startsWith(`${root.path}.`));

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  };
  const selectSubtree = (root: OrgUnit) => {
    const next = new Set(selected);
    const ids = subtreeOf(root).map((u) => u.id);
    const allIn = ids.every((id) => next.has(id));
    for (const id of ids) {
      if (allIn) next.delete(id);
      else next.add(id);
    }
    onChange(next);
  };

  if (units.length === 0) {
    return (
      <p className="text-[12px] text-ochre">
        ▲ no org units exist yet — create them under Org units first
      </p>
    );
  }
  return (
    <ul className="max-h-64 overflow-y-auto border border-hairline bg-surface py-1">
      {units.map((u) => (
        <li
          key={u.id}
          className="flex items-center justify-between pr-2"
          style={{ paddingLeft: `${(u.level - 1) * 16 + 8}px` }}
        >
          <Checkbox
            label={u.name}
            checked={selected.has(u.id)}
            onChange={() => toggle(u.id)}
          />
          <button
            type="button"
            className="small-caps text-ink-muted hover:text-cobalt"
            onClick={() => selectSubtree(u)}
          >
            subtree
          </button>
        </li>
      ))}
    </ul>
  );
}

function DatasetEditor({
  dataset,
  onDone,
}: {
  dataset: Dataset | null;
  onDone: () => void;
}) {
  const dataElements = useEntityList('dataElements');
  const programs = useEntityList('programs');
  const { create, update } = useEntityMutations('datasets');

  const [form, setForm] = useState({
    name: dataset?.name ?? '',
    code: dataset?.code ?? '',
    description: dataset?.description ?? '',
    frequency: dataset?.frequency ?? 'MONTHLY',
    openFuturePeriods: dataset?.openFuturePeriods ?? 0,
    expiryDays: dataset?.expiryDays ?? 0,
    requiresApproval: dataset?.requiresApproval ?? false,
    programId: dataset?.programId ?? null,
  });
  const [elements, setElements] = useState<ElementRow[]>(
    dataset?.elements.map((e) => ({
      dataElementId: e.dataElementId,
      section: e.section,
      required: e.required,
    })) ?? [],
  );
  const [orgUnitIds, setOrgUnitIds] = useState<Set<string>>(
    new Set(dataset?.orgUnitIds ?? []),
  );
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));
  const mutation = dataset ? update : create;

  const available = useMemo(
    () =>
      (dataElements.data ?? []).filter(
        (de) => !elements.some((e) => e.dataElementId === de.id),
      ),
    [dataElements.data, elements],
  );

  function submit() {
    const input = {
      ...form,
      elements: elements.map((e, idx) => ({ ...e, sortOrder: idx })),
      orgUnitIds: [...orgUnitIds],
    };
    const promise = dataset
      ? update.mutateAsync({ id: dataset.id, patch: input })
      : create.mutateAsync(input);
    void promise.then(onDone).catch(() => {});
  }

  const deName = (id: string) => dataElements.data?.find((d) => d.id === id)?.name ?? '…';

  return (
    <div className="max-w-3xl space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Name">
          <Input
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            autoFocus
          />
        </Field>
        <Field label="Code">
          <Input value={form.code} onChange={(e) => set('code', e.target.value)} />
        </Field>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Frequency">
          <Select
            value={form.frequency}
            onChange={(e) => set('frequency', e.target.value as typeof form.frequency)}
          >
            {FREQUENCIES.map((f) => (
              <option key={f} value={f}>
                {f.toLowerCase()}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Open future periods">
          <Input
            type="number"
            min={0}
            value={form.openFuturePeriods}
            onChange={(e) => set('openFuturePeriods', Number(e.target.value))}
          />
        </Field>
        <Field label="Program">
          <Select
            value={form.programId ?? ''}
            onChange={(e) => set('programId', e.target.value || null)}
          >
            <option value="">none</option>
            {programs.data?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Checkbox
        label="Submissions require approval"
        checked={form.requiresApproval}
        onChange={(e) => set('requiresApproval', e.target.checked)}
      />

      <div>
        <p className="small-caps mb-1 font-medium text-ink-muted">form contents</p>
        {elements.length === 0 ? (
          <p className="mb-2 text-[12px] text-ink-muted">
            Add data elements; group them with section names.
          </p>
        ) : (
          <Table className="mb-2">
            <THead>
              <Tr>
                <Th>Data element</Th>
                <Th>Section</Th>
                <Th>Required</Th>
                <Th />
              </Tr>
            </THead>
            <TBody>
              {elements.map((e, idx) => (
                <Tr key={e.dataElementId}>
                  <Td>{deName(e.dataElementId)}</Td>
                  <Td>
                    <Input
                      className="h-7 text-[13px]"
                      value={e.section}
                      placeholder="e.g. Water"
                      onChange={(ev) =>
                        setElements((rows) =>
                          rows.map((r, i) =>
                            i === idx ? { ...r, section: ev.target.value } : r,
                          ),
                        )
                      }
                    />
                  </Td>
                  <Td>
                    <Checkbox
                      label=""
                      checked={e.required}
                      onChange={(ev) =>
                        setElements((rows) =>
                          rows.map((r, i) =>
                            i === idx ? { ...r, required: ev.target.checked } : r,
                          ),
                        )
                      }
                    />
                  </Td>
                  <Td className="text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        setElements((rows) => rows.filter((_, i) => i !== idx))
                      }
                    >
                      Remove
                    </Button>
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
        {available.length > 0 ? (
          <Select
            value=""
            aria-label="Add data element"
            onChange={(e) => {
              const id = e.target.value;
              if (id)
                setElements((rows) => [
                  ...rows,
                  { dataElementId: id, section: '', required: false },
                ]);
            }}
            className="w-72"
          >
            <option value="">Add data element…</option>
            {available.map((de) => (
              <option key={de.id} value={de.id}>
                {de.name}
              </option>
            ))}
          </Select>
        ) : dataElements.data?.length === 0 ? (
          <p className="text-[12px] text-ochre">
            ▲ no data elements exist yet — create them first
          </p>
        ) : null}
      </div>

      <div>
        <p className="small-caps mb-1 font-medium text-ink-muted">
          assigned org units ({orgUnitIds.size})
        </p>
        <OrgUnitPicker selected={orgUnitIds} onChange={setOrgUnitIds} />
      </div>

      <ErrorNote error={mutation.error} />
      <div className="flex justify-end gap-2 border-t border-hairline pt-3">
        <Button onClick={onDone}>Cancel</Button>
        <Button
          variant="primary"
          onClick={submit}
          disabled={mutation.isPending || !form.name || !form.code}
        >
          {dataset ? 'Save dataset' : 'Create dataset'}
        </Button>
      </div>
    </div>
  );
}

export function DatasetsPage() {
  const list = useEntityList('datasets');
  const { remove } = useEntityMutations('datasets');
  const [editing, setEditing] = useState<Dataset | null>(null);
  const [creating, setCreating] = useState(false);

  if (creating || editing) {
    return (
      <section>
        <SectionTitle title={editing ? `Edit ${editing.name}` : 'New dataset'} />
        <DatasetEditor
          dataset={editing}
          onDone={() => {
            setEditing(null);
            setCreating(false);
          }}
        />
      </section>
    );
  }

  return (
    <section className="max-w-3xl">
      <SectionTitle
        title="Datasets"
        actions={
          <Button variant="primary" onClick={() => setCreating(true)}>
            New dataset
          </Button>
        }
      />
      {list.data?.length === 0 ? (
        <EmptyHint>
          A dataset is a collection form: data elements + a reporting frequency + assigned
          org units. Field users see one entry grid per dataset.
        </EmptyHint>
      ) : (
        <Table>
          <THead>
            <Tr>
              <Th>Name</Th>
              <Th>Code</Th>
              <Th>Frequency</Th>
              <Th numeric>Elements</Th>
              <Th numeric>Org units</Th>
              <Th />
            </Tr>
          </THead>
          <TBody>
            {list.data?.map((d) => (
              <Tr key={d.id} className="hover:bg-surface">
                <Td className="font-medium">{d.name}</Td>
                <Td className="font-mono text-[12px]">{d.code}</Td>
                <Td className="text-ink-muted">{d.frequency.toLowerCase()}</Td>
                <Td numeric>{d.elements.length}</Td>
                <Td numeric>{d.orgUnitIds.length}</Td>
                <Td className="text-right">
                  <Button size="sm" variant="ghost" onClick={() => setEditing(d)}>
                    Edit
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => remove.mutate(d.id)}>
                    Delete
                  </Button>
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      )}
      <ErrorNote error={remove.error} />
    </section>
  );
}
