import { useMemo, useState } from 'react';
import {
  parseExpression,
  SEVERITIES,
  VALIDATION_OPS,
  type ValidationRule,
} from '@dodo/shared';
import {
  Button,
  Checkbox,
  Dialog,
  DialogClose,
  DialogContent,
  Field,
  FieldGroup,
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

function exprProblem(src: string): string | null {
  if (!src.trim()) return null;
  try {
    parseExpression(src);
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : 'invalid expression';
  }
}

function RuleForm({ rule, onDone }: { rule: ValidationRule | null; onDone: () => void }) {
  const datasets = useEntityList('datasets');
  const dataElements = useEntityList('dataElements');
  const { create, update } = useEntityMutations('validationRules');
  const [form, setForm] = useState({
    name: rule?.name ?? '',
    code: rule?.code ?? '',
    leftExpr: rule?.leftExpr ?? '',
    op: rule?.op ?? '<=',
    rightExpr: rule?.rightExpr ?? '',
    severity: rule?.severity ?? 'warning',
    instruction: rule?.instruction ?? '',
  });
  const [datasetIds, setDatasetIds] = useState<string[]>(rule?.datasetIds ?? []);
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));
  const mutation = rule ? update : create;

  // live parse feedback (spec §8.5) using the exact engine the entry grid runs
  const leftProblem = useMemo(() => exprProblem(form.leftExpr), [form.leftExpr]);
  const rightProblem = useMemo(() => exprProblem(form.rightExpr), [form.rightExpr]);

  function submit() {
    const input = { ...form, datasetIds };
    const promise = rule
      ? update.mutateAsync({ id: rule.id, patch: input })
      : create.mutateAsync(input);
    void promise.then(onDone).catch(() => {});
  }

  return (
    <div className="mt-4 space-y-3">
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
      <Field
        label="Left side"
        hint="reference data elements as #{CODE} or #{CODE.COC_CODE}"
        error={leftProblem ?? undefined}
      >
        <Input
          value={form.leftExpr}
          onChange={(e) => set('leftExpr', e.target.value)}
          placeholder="#{DE-PEOPLE.SEX-F} + #{DE-PEOPLE.SEX-M}"
          className="font-mono text-[13px]"
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Comparison">
          <Select
            value={form.op}
            onChange={(e) => set('op', e.target.value as (typeof VALIDATION_OPS)[number])}
          >
            {VALIDATION_OPS.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Severity">
          <Select
            value={form.severity}
            onChange={(e) =>
              set('severity', e.target.value as (typeof SEVERITIES)[number])
            }
          >
            {SEVERITIES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Right side" error={rightProblem ?? undefined}>
        <Input
          value={form.rightExpr}
          onChange={(e) => set('rightExpr', e.target.value)}
          placeholder="#{DE-PEOPLE}"
          className="font-mono text-[13px]"
        />
      </Field>
      <Field label="Instruction" hint="shown to the data entry user when the rule fires">
        <Input
          value={form.instruction}
          onChange={(e) => set('instruction', e.target.value)}
        />
      </Field>
      <FieldGroup label="Applies to datasets (none = all)">
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {datasets.data?.map((d) => (
            <Checkbox
              key={d.id}
              label={d.name}
              checked={datasetIds.includes(d.id)}
              onChange={() =>
                setDatasetIds((ids) =>
                  ids.includes(d.id) ? ids.filter((x) => x !== d.id) : [...ids, d.id],
                )
              }
            />
          ))}
        </div>
      </FieldGroup>
      <p className="text-[12px] text-ink-muted">
        {dataElements.data?.length ?? 0} data element codes available for references.
      </p>
      <ErrorNote error={mutation.error} />
      <div className="flex justify-end gap-2 pt-1">
        <DialogClose asChild>
          <Button>Cancel</Button>
        </DialogClose>
        <Button
          variant="primary"
          onClick={submit}
          disabled={
            mutation.isPending ||
            !form.name ||
            !form.code ||
            !form.leftExpr ||
            !form.rightExpr ||
            leftProblem !== null ||
            rightProblem !== null
          }
        >
          {rule ? 'Save' : 'Create rule'}
        </Button>
      </div>
    </div>
  );
}

export function ValidationPage() {
  const rules = useEntityList('validationRules');
  const { remove } = useEntityMutations('validationRules');
  const [editing, setEditing] = useState<ValidationRule | null>(null);
  const [open, setOpen] = useState(false);

  return (
    <section className="max-w-4xl">
      <SectionTitle
        title="Validation rules"
        actions={
          <Button
            variant="primary"
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
          >
            New rule
          </Button>
        }
      />
      {rules.data?.length === 0 ? (
        <EmptyHint>
          Validation rules compare expressions over entered values — e.g. “people served,
          female + male ≤ total”. They run during entry (offline) and again on the server.
        </EmptyHint>
      ) : (
        <Table>
          <THead>
            <Tr>
              <Th>Name</Th>
              <Th>Rule</Th>
              <Th>Severity</Th>
              <Th />
            </Tr>
          </THead>
          <TBody>
            {rules.data?.map((r) => (
              <Tr key={r.id} className="hover:bg-surface">
                <Td className="font-medium">{r.name}</Td>
                <Td className="font-mono text-[12px]">
                  {r.leftExpr} {r.op} {r.rightExpr}
                </Td>
                <Td>
                  <span
                    className={
                      r.severity === 'error'
                        ? 'small-caps text-offtrack'
                        : 'small-caps text-ochre'
                    }
                  >
                    {r.severity === 'error' ? '▲ error' : '▲ warning'}
                  </span>
                </Td>
                <Td className="text-right">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setEditing(r);
                      setOpen(true);
                    }}
                  >
                    Edit
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => remove.mutate(r.id)}>
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
          title={editing ? `Edit ${editing.name}` : 'New validation rule'}
          className="w-[min(620px,calc(100vw-2rem))]"
        >
          <RuleForm rule={editing} onDone={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
    </section>
  );
}
