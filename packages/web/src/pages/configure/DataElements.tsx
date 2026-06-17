import { useState } from 'react';
import {
  AGGREGATION_OPS,
  DEFAULT_CATEGORY_COMBO_ID,
  EVIDENCE_TYPES,
  VALUE_TYPES,
  type DataElement,
  type EvidenceType,
} from '@dodo/shared';
import {
  Button,
  Checkbox,
  Dialog,
  DialogClose,
  DialogContent,
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

function DataElementForm({
  element,
  onDone,
}: {
  element: DataElement | null;
  onDone: () => void;
}) {
  const combos = useEntityList('categoryCombos');
  const optionSets = useEntityList('optionSets');
  const { create, update } = useEntityMutations('dataElements');
  const [form, setForm] = useState({
    name: element?.name ?? '',
    shortName: element?.shortName ?? '',
    code: element?.code ?? '',
    description: element?.description ?? '',
    valueType: element?.valueType ?? 'INTEGER_ZERO_OR_POSITIVE',
    categoryComboId: element?.categoryComboId ?? null,
    unitOfMeasure: element?.unitOfMeasure ?? '',
    aggregationOp: element?.aggregationOp ?? 'sum',
    optionSetId: element?.optionSetId ?? null,
  });
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));
  const mutation = element ? update : create;

  function submit() {
    const promise = element
      ? update.mutateAsync({ id: element.id, patch: form })
      : create.mutateAsync(form);
    void promise.then(onDone).catch(() => {});
  }

  return (
    <div className="mt-4 space-y-3">
      <Field label="Name">
        <Input
          value={form.name}
          onChange={(e) => set('name', e.target.value)}
          autoFocus
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Short name">
          <Input
            value={form.shortName}
            onChange={(e) => set('shortName', e.target.value)}
          />
        </Field>
        <Field label="Code">
          <Input value={form.code} onChange={(e) => set('code', e.target.value)} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Value type">
          <Select
            value={form.valueType}
            onChange={(e) => set('valueType', e.target.value as typeof form.valueType)}
          >
            {VALUE_TYPES.map((v) => (
              <option key={v} value={v}>
                {v.toLowerCase().replaceAll('_', ' ')}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Aggregation">
          <Select
            value={form.aggregationOp}
            onChange={(e) =>
              set('aggregationOp', e.target.value as typeof form.aggregationOp)
            }
          >
            {AGGREGATION_OPS.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Disaggregation" hint="category combo; none = default">
          <Select
            value={form.categoryComboId ?? ''}
            onChange={(e) => set('categoryComboId', e.target.value || null)}
          >
            <option value="">none (default)</option>
            {combos.data
              ?.filter((c) => c.id !== DEFAULT_CATEGORY_COMBO_ID)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </Select>
        </Field>
        <Field label="Unit of measure">
          <Input
            value={form.unitOfMeasure}
            onChange={(e) => set('unitOfMeasure', e.target.value)}
            placeholder="households, litres…"
          />
        </Field>
      </div>
      {form.valueType === 'OPTION' ? (
        <Field label="Option set">
          <Select
            value={form.optionSetId ?? ''}
            onChange={(e) => set('optionSetId', e.target.value || null)}
          >
            <option value="">choose…</option>
            {optionSets.data?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}
      <ErrorNote error={mutation.error} />
      <div className="flex justify-end gap-2 pt-1">
        <DialogClose asChild>
          <Button>Cancel</Button>
        </DialogClose>
        <Button variant="primary" onClick={submit} disabled={mutation.isPending}>
          {element ? 'Save' : 'Create'}
        </Button>
      </div>
    </div>
  );
}

/** Evidence requirements attached to a data element (spec §16.3). */
function EvidenceManager({ element }: { element: DataElement }) {
  const list = useEntityList('evidenceRequirements');
  const { create, remove } = useEntityMutations('evidenceRequirements');
  const reqs = (list.data ?? []).filter((r) => r.dataElementId === element.id);

  const [evidenceType, setEvidenceType] = useState<EvidenceType>('photo');
  const [isRequired, setIsRequired] = useState(false);
  const [instructions, setInstructions] = useState('');

  function add() {
    void create
      .mutateAsync({
        dataElementId: element.id,
        evidenceType,
        isRequired,
        instructions: instructions || null,
      })
      .then(() => {
        setInstructions('');
        setIsRequired(false);
      })
      .catch(() => {});
  }

  return (
    <div className="mt-4 space-y-4">
      {reqs.length === 0 ? (
        <EmptyHint>
          No evidence required. Add a requirement (photo, GPS, document…) and field
          workers will be prompted to capture it during data entry.
        </EmptyHint>
      ) : (
        <Table>
          <THead>
            <Tr>
              <Th>Type</Th>
              <Th>Required</Th>
              <Th>Instructions</Th>
              <Th />
            </Tr>
          </THead>
          <TBody>
            {reqs.map((r) => (
              <Tr key={r.id}>
                <Td className="small-caps">{r.evidenceType}</Td>
                <Td className="text-ink-muted">{r.isRequired ? 'yes' : 'no'}</Td>
                <Td className="text-ink-muted">{r.instructions ?? '—'}</Td>
                <Td className="text-right">
                  <Button size="sm" variant="ghost" onClick={() => remove.mutate(r.id)}>
                    Delete
                  </Button>
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      )}
      <div className="space-y-2 border-t border-hairline pt-3">
        <div className="grid grid-cols-2 gap-2">
          <Field label="Type">
            <Select
              value={evidenceType}
              onChange={(e) => setEvidenceType(e.target.value as EvidenceType)}
            >
              {EVIDENCE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Instructions">
            <Input
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="e.g. photograph the completed work"
            />
          </Field>
        </div>
        <div className="flex items-center justify-between">
          <Checkbox
            label="Required to mark complete"
            checked={isRequired}
            onChange={(e) => setIsRequired(e.target.checked)}
          />
          <Button variant="primary" size="sm" onClick={add} disabled={create.isPending}>
            Add requirement
          </Button>
        </div>
        <ErrorNote error={create.error ?? remove.error} />
      </div>
    </div>
  );
}

export function DataElementsPage() {
  const list = useEntityList('dataElements');
  const combos = useEntityList('categoryCombos');
  const { remove } = useEntityMutations('dataElements');
  const [editing, setEditing] = useState<DataElement | null>(null);
  const [open, setOpen] = useState(false);
  const [evidenceFor, setEvidenceFor] = useState<DataElement | null>(null);

  const comboName = (id: string | null) =>
    id ? (combos.data?.find((c) => c.id === id)?.name ?? '…') : '—';

  return (
    <section className="max-w-4xl">
      <SectionTitle
        title="Data elements"
        actions={
          <Button
            variant="primary"
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
          >
            New data element
          </Button>
        }
      />
      {list.data?.length === 0 ? (
        <EmptyHint>
          Data elements are the atomic things you collect — “Number of boreholes
          rehabilitated”. Define disaggregation first if values split by Sex, Age, or
          similar.
        </EmptyHint>
      ) : (
        <Table>
          <THead>
            <Tr>
              <Th>Name</Th>
              <Th>Code</Th>
              <Th>Value type</Th>
              <Th>Disaggregation</Th>
              <Th>Unit</Th>
              <Th />
            </Tr>
          </THead>
          <TBody>
            {list.data?.map((de) => (
              <Tr key={de.id} className="hover:bg-surface">
                <Td className="font-medium">{de.name}</Td>
                <Td className="font-mono text-[12px]">{de.code}</Td>
                <Td className="text-ink-muted">
                  {de.valueType.toLowerCase().replaceAll('_', ' ')}
                </Td>
                <Td className="text-ink-muted">{comboName(de.categoryComboId)}</Td>
                <Td className="text-ink-muted">{de.unitOfMeasure}</Td>
                <Td className="text-right">
                  <Button size="sm" variant="ghost" onClick={() => setEvidenceFor(de)}>
                    Evidence
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setEditing(de);
                      setOpen(true);
                    }}
                  >
                    Edit
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => remove.mutate(de.id)}>
                    Delete
                  </Button>
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      )}
      <ErrorNote error={remove.error} />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          title={editing ? `Edit ${editing.name}` : 'New data element'}
          className="w-[min(560px,calc(100vw-2rem))]"
        >
          <DataElementForm element={editing} onDone={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
      <Dialog
        open={evidenceFor !== null}
        onOpenChange={(o) => !o && setEvidenceFor(null)}
      >
        <DialogContent
          title={evidenceFor ? `${evidenceFor.name} — evidence` : ''}
          className="w-[min(560px,calc(100vw-2rem))]"
        >
          {evidenceFor ? <EvidenceManager element={evidenceFor} /> : null}
        </DialogContent>
      </Dialog>
    </section>
  );
}
