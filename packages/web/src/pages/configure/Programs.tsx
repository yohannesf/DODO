import { useState } from 'react';
import {
  PROGRAM_FIELD_TYPES,
  PROGRAM_STATUSES,
  type Program,
  type ProgramFieldDef,
  type ProgramFieldType,
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

function ProgramForm({
  program,
  onDone,
}: {
  program: Program | null;
  onDone: () => void;
}) {
  const { create, update } = useEntityMutations('programs');
  const [name, setName] = useState(program?.name ?? '');
  const [code, setCode] = useState(program?.code ?? '');
  const [description, setDescription] = useState(program?.description ?? '');
  const [active, setActive] = useState(program?.active ?? true);
  const [status, setStatus] = useState(program?.status ?? 'active');
  const [currency, setCurrency] = useState(program?.currency ?? 'USD');
  const [fiscalYearStart, setFiscalYearStart] = useState(program?.fiscalYearStart ?? 1);
  const [startDate, setStartDate] = useState(program?.startDate ?? '');
  const [endDate, setEndDate] = useState(program?.endDate ?? '');
  const mutation = program ? update : create;

  function submit() {
    const input = {
      name,
      code,
      description,
      active,
      status,
      currency,
      fiscalYearStart,
      startDate: startDate || null,
      endDate: endDate || null,
    };
    const promise = program
      ? update.mutateAsync({ id: program.id, patch: input })
      : create.mutateAsync(input);
    void promise.then(onDone).catch(() => {});
  }

  return (
    <div className="mt-4 space-y-3">
      <Field label="Name">
        <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </Field>
      <Field label="Code" hint="unique, stable — used for interoperability">
        <Input value={code} onChange={(e) => setCode(e.target.value)} />
      </Field>
      <Field label="Description">
        <Input value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Status">
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value as Program['status'])}
          >
            {PROGRAM_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Currency">
          <Input
            value={currency}
            onChange={(e) => setCurrency(e.target.value.toUpperCase())}
            maxLength={8}
          />
        </Field>
        <Field label="Fiscal year start" hint="month the fiscal year begins">
          <Select
            value={String(fiscalYearStart)}
            onChange={(e) => setFiscalYearStart(Number(e.target.value))}
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>
                {new Date(2000, m - 1, 1).toLocaleString('en', { month: 'long' })}
              </option>
            ))}
          </Select>
        </Field>
        <div />
        <Field label="Start date">
          <Input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </Field>
        <Field label="End date">
          <Input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </Field>
      </div>
      <Checkbox
        label="Active"
        checked={active}
        onChange={(e) => setActive(e.target.checked)}
      />
      <ErrorNote error={mutation.error} />
      <div className="flex justify-end gap-2 pt-1">
        <DialogClose asChild>
          <Button>Cancel</Button>
        </DialogClose>
        <Button variant="primary" onClick={submit} disabled={mutation.isPending}>
          {program ? 'Save' : 'Create'}
        </Button>
      </div>
    </div>
  );
}

/** Per-field value editor — renders the right control for the field type. */
function FieldValueInput({
  def,
  value,
  onSave,
}: {
  def: ProgramFieldDef;
  value: string | null;
  onSave: (value: string) => void;
}) {
  if (def.fieldType === 'boolean') {
    return (
      <Checkbox
        label=""
        checked={value === 'true'}
        onChange={(e) => onSave(String(e.target.checked))}
      />
    );
  }
  if (def.fieldType === 'dropdown') {
    return (
      <Select value={value ?? ''} onChange={(e) => onSave(e.target.value)}>
        <option value="">—</option>
        {(def.options ?? []).map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </Select>
    );
  }
  const type =
    def.fieldType === 'number' ? 'number' : def.fieldType === 'date' ? 'date' : 'text';
  return (
    <Input
      type={type}
      defaultValue={value ?? ''}
      onBlur={(e) => {
        if (e.target.value !== (value ?? '')) onSave(e.target.value);
      }}
    />
  );
}

/** Custom field definitions + their values for one program (spec §16.2). */
function CustomFieldsManager({ program }: { program: Program }) {
  const defsList = useEntityList('programFields');
  const valuesList = useEntityList('programFieldValues');
  const defMut = useEntityMutations('programFields');
  const valMut = useEntityMutations('programFieldValues');

  const defs = (defsList.data ?? [])
    .filter((d) => d.programId === program.id)
    .sort((a, b) => a.displayOrder - b.displayOrder);
  const valueByDef = new Map(
    (valuesList.data ?? [])
      .filter((v) => v.programId === program.id)
      .map((v) => [v.fieldDefId, v]),
  );

  const [fieldName, setFieldName] = useState('');
  const [fieldType, setFieldType] = useState<ProgramFieldType>('text');
  const [isRequired, setIsRequired] = useState(false);
  const [optionsText, setOptionsText] = useState('');

  function addDef() {
    if (!fieldName.trim()) return;
    const options =
      fieldType === 'dropdown'
        ? optionsText
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : null;
    void defMut.create
      .mutateAsync({
        programId: program.id,
        fieldName: fieldName.trim(),
        fieldType,
        isRequired,
        options,
        displayOrder: defs.length,
      })
      .then(() => {
        setFieldName('');
        setOptionsText('');
        setIsRequired(false);
        setFieldType('text');
      })
      .catch(() => {});
  }

  function saveValue(def: ProgramFieldDef, value: string) {
    const existing = valueByDef.get(def.id);
    const promise = existing
      ? valMut.update.mutateAsync({ id: existing.id, patch: { value } })
      : valMut.create.mutateAsync({
          programId: program.id,
          fieldDefId: def.id,
          value,
        });
    void promise.catch(() => {});
  }

  return (
    <div className="mt-4 space-y-4">
      {defs.length === 0 ? (
        <EmptyHint>
          No custom fields yet. Define project attributes (donor, grant code, region…)
          below; their values sync to the field offline.
        </EmptyHint>
      ) : (
        <Table>
          <THead>
            <Tr>
              <Th>Field</Th>
              <Th>Type</Th>
              <Th>Value</Th>
              <Th />
            </Tr>
          </THead>
          <TBody>
            {defs.map((def) => (
              <Tr key={def.id}>
                <Td className="font-medium">
                  {def.fieldName}
                  {def.isRequired ? <span className="ml-1 text-offtrack">*</span> : null}
                </Td>
                <Td className="small-caps text-ink-muted">{def.fieldType}</Td>
                <Td>
                  <FieldValueInput
                    def={def}
                    value={valueByDef.get(def.id)?.value ?? null}
                    onSave={(v) => saveValue(def, v)}
                  />
                </Td>
                <Td className="text-right">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => defMut.remove.mutate(def.id)}
                  >
                    Delete
                  </Button>
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      )}

      <div className="space-y-2 border-t border-hairline pt-3">
        <h3 className="small-caps font-medium text-ink-muted">Add field</h3>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Name">
            <Input value={fieldName} onChange={(e) => setFieldName(e.target.value)} />
          </Field>
          <Field label="Type">
            <Select
              value={fieldType}
              onChange={(e) => setFieldType(e.target.value as ProgramFieldType)}
            >
              {PROGRAM_FIELD_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        {fieldType === 'dropdown' ? (
          <Field label="Options" hint="comma-separated">
            <Input value={optionsText} onChange={(e) => setOptionsText(e.target.value)} />
          </Field>
        ) : null}
        <div className="flex items-center justify-between">
          <Checkbox
            label="Required"
            checked={isRequired}
            onChange={(e) => setIsRequired(e.target.checked)}
          />
          <Button
            variant="primary"
            size="sm"
            onClick={addDef}
            disabled={defMut.create.isPending}
          >
            Add field
          </Button>
        </div>
        <ErrorNote error={defMut.create.error ?? valMut.create.error} />
      </div>
    </div>
  );
}

export function ProgramsPage() {
  const list = useEntityList('programs');
  const { remove } = useEntityMutations('programs');
  const [editing, setEditing] = useState<Program | null>(null);
  const [open, setOpen] = useState(false);
  const [fieldsFor, setFieldsFor] = useState<Program | null>(null);

  return (
    <section className="max-w-3xl">
      <SectionTitle
        title="Programs"
        actions={
          <Button
            variant="primary"
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
          >
            New program
          </Button>
        }
      />
      {list.data?.length === 0 ? (
        <EmptyHint>
          No programs yet. A program groups datasets, indicators, and results frameworks —
          create one per intervention (e.g. WASH).
        </EmptyHint>
      ) : (
        <Table>
          <THead>
            <Tr>
              <Th>Name</Th>
              <Th>Code</Th>
              <Th>Status</Th>
              <Th>Currency</Th>
              <Th />
            </Tr>
          </THead>
          <TBody>
            {list.data?.map((p) => (
              <Tr key={p.id} className="hover:bg-surface">
                <Td className="font-medium">{p.name}</Td>
                <Td className="font-mono text-[12px]">{p.code}</Td>
                <Td>
                  <span className="small-caps text-ink-muted">
                    {p.active ? `● ${p.status}` : '◌ inactive'}
                  </span>
                </Td>
                <Td className="text-ink-muted">{p.currency}</Td>
                <Td className="text-right">
                  <Button size="sm" variant="ghost" onClick={() => setFieldsFor(p)}>
                    Fields
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setEditing(p);
                      setOpen(true);
                    }}
                  >
                    Edit
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => remove.mutate(p.id)}>
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
        <DialogContent title={editing ? `Edit ${editing.name}` : 'New program'}>
          <ProgramForm program={editing} onDone={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
      <Dialog open={fieldsFor !== null} onOpenChange={(o) => !o && setFieldsFor(null)}>
        <DialogContent title={fieldsFor ? `${fieldsFor.name} — custom fields` : ''}>
          {fieldsFor ? <CustomFieldsManager program={fieldsFor} /> : null}
        </DialogContent>
      </Dialog>
    </section>
  );
}
