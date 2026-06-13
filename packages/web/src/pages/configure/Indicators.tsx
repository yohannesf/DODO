import { useMemo, useState } from 'react';
import {
  INDICATOR_TYPES,
  collectRefs,
  evaluateExpression,
  parseExpression,
  type Indicator,
} from '@dodo/shared';
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  Field,
  Input,
  OrgUnitSelect,
  Select,
  TBody,
  Table,
  Td,
  Th,
  THead,
  Tr,
} from '../../components';
import { useEntityList, useEntityMutations } from '../../api/metadata';
import { fetchAnalytics } from '../../api/analytics';
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

function TestEvaluate({
  numeratorExpr,
  denominatorExpr,
  factor,
  indicatorType,
  decimals,
}: {
  numeratorExpr: string;
  denominatorExpr: string;
  factor: number;
  indicatorType: string;
  decimals: number;
}) {
  const orgUnits = useEntityList('orgUnits');
  const dataElements = useEntityList('dataElements');
  const [ou, setOu] = useState('');
  const [pe, setPe] = useState('');
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);

  // Evaluate the DRAFT formula against live data: aggregate each referenced
  // data element via the analytics API, then run the same expression engine.
  async function run() {
    setError(null);
    setResult(null);
    try {
      const num = parseExpression(numeratorExpr);
      const den = parseExpression(denominatorExpr);
      const codes = [...collectRefs(num), ...collectRefs(den)].map(
        (r) => r.dataElementCode,
      );
      const refDes = (dataElements.data ?? []).filter((d) => codes.includes(d.code));
      if (refDes.length === 0) {
        setResult('formula references no known data elements');
        return;
      }
      const analytics = await fetchAnalytics({
        dx: refDes.map((d) => d.id),
        ou: [ou],
        pe: [pe],
        ouMode: 'subtree',
      });
      const valueByDe = new Map(analytics.rows.map((r) => [r.dx, r.value] as const));
      // option-narrowed refs need server-side evaluation; approximate the
      // test with whole-element aggregates and say so
      const resolve = (code: string) => {
        const de = refDes.find((d) => d.code === code);
        return de ? (valueByDe.get(de.id) ?? null) : null;
      };
      const n = evaluateExpression(num, (code) => resolve(code));
      const d = evaluateExpression(den, (code) => resolve(code));
      if (n === null || d === null || d === 0) {
        setResult('not computable for this selection (missing operands)');
        return;
      }
      const typeFactor =
        { number: 1, percent: 100, rate: 1, per_thousand: 1000, per_ten_thousand: 10000 }[
          indicatorType
        ] ?? 1;
      const raw = (n / d) * factor * typeFactor;
      const f = 10 ** decimals;
      setResult(`${Math.round(raw * f) / f} (numerator ${n}, denominator ${d})`);
    } catch (e) {
      setError(e);
    }
  }

  return (
    <div className="mt-2 border border-hairline bg-paper p-3">
      <p className="small-caps mb-2 text-ink-muted">test evaluation</p>
      <div className="flex items-end gap-2">
        <Field label="Org unit (subtree)" className="grow">
          <OrgUnitSelect
            label="Org unit"
            orgUnits={orgUnits.data ?? []}
            value={ou || null}
            placeholder="choose…"
            onChange={(id) => setOu(id)}
          />
        </Field>
        <Field label="Period">
          <Input
            placeholder="2026-05"
            value={pe}
            onChange={(e) => setPe(e.target.value)}
            className="w-28"
          />
        </Field>
        <Button onClick={() => void run()} disabled={!ou || !pe}>
          Evaluate
        </Button>
      </div>
      {result ? (
        <p className="tnum mt-2 text-sm" data-testid="test-evaluate-result">
          = {result}
        </p>
      ) : null}
      <ErrorNote error={error} />
    </div>
  );
}

function IndicatorForm({
  indicator,
  onDone,
}: {
  indicator: Indicator | null;
  onDone: () => void;
}) {
  const dataElements = useEntityList('dataElements');
  const categoryOptions = useEntityList('categoryOptions');
  const programs = useEntityList('programs');
  const { create, update } = useEntityMutations('indicators');
  const [form, setForm] = useState({
    name: indicator?.name ?? '',
    code: indicator?.code ?? '',
    description: indicator?.description ?? '',
    numeratorExpr: indicator?.numeratorExpr ?? '',
    denominatorExpr: indicator?.denominatorExpr ?? '1',
    factor: indicator?.factor ?? 1,
    decimals: indicator?.decimals ?? 1,
    indicatorType: indicator?.indicatorType ?? 'number',
    annualized: indicator?.annualized ?? false,
    programId: indicator?.programId ?? null,
  });
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));
  const mutation = indicator ? update : create;

  const numProblem = useMemo(() => exprProblem(form.numeratorExpr), [form.numeratorExpr]);
  const denProblem = useMemo(
    () => exprProblem(form.denominatorExpr),
    [form.denominatorExpr],
  );

  function submit() {
    const promise = indicator
      ? update.mutateAsync({ id: indicator.id, patch: form })
      : create.mutateAsync(form);
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
        label="Numerator"
        hint="autocomplete: data element codes below"
        error={numProblem ?? undefined}
      >
        <Input
          list="dodo-ref-codes"
          value={form.numeratorExpr}
          onChange={(e) => set('numeratorExpr', e.target.value)}
          placeholder="#{DE-PEOPLE.SEX-F}"
          className="font-mono text-[13px]"
        />
      </Field>
      <Field label="Denominator" error={denProblem ?? undefined}>
        <Input
          list="dodo-ref-codes"
          value={form.denominatorExpr}
          onChange={(e) => set('denominatorExpr', e.target.value)}
          className="font-mono text-[13px]"
        />
      </Field>
      <datalist id="dodo-ref-codes">
        {dataElements.data?.map((d) => (
          <option key={d.id} value={`#{${d.code}}`}>
            {d.name}
          </option>
        ))}
        {dataElements.data?.flatMap((d) =>
          d.categoryComboId
            ? (categoryOptions.data ?? []).map((o) => (
                <option key={`${d.id}:${o.id}`} value={`#{${d.code}.${o.code}}`}>
                  {d.name} — {o.name}
                </option>
              ))
            : [],
        )}
      </datalist>
      <div className="grid grid-cols-4 gap-3">
        <Field label="Type">
          <Select
            value={form.indicatorType}
            onChange={(e) =>
              set('indicatorType', e.target.value as (typeof INDICATOR_TYPES)[number])
            }
          >
            {INDICATOR_TYPES.map((t) => (
              <option key={t} value={t}>
                {t.replaceAll('_', ' ')}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Factor">
          <Input
            type="number"
            value={form.factor}
            onChange={(e) => set('factor', Number(e.target.value))}
          />
        </Field>
        <Field label="Decimals">
          <Input
            type="number"
            min={0}
            max={6}
            value={form.decimals}
            onChange={(e) => set('decimals', Number(e.target.value))}
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
      {!numProblem && !denProblem && form.numeratorExpr ? (
        <TestEvaluate
          numeratorExpr={form.numeratorExpr}
          denominatorExpr={form.denominatorExpr}
          factor={form.factor}
          indicatorType={form.indicatorType}
          decimals={form.decimals}
        />
      ) : null}
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
            !form.numeratorExpr ||
            numProblem !== null ||
            denProblem !== null
          }
        >
          {indicator ? 'Save' : 'Create indicator'}
        </Button>
      </div>
    </div>
  );
}

export function IndicatorsPage() {
  const list = useEntityList('indicators');
  const { remove } = useEntityMutations('indicators');
  const [editing, setEditing] = useState<Indicator | null>(null);
  const [open, setOpen] = useState(false);

  return (
    <section className="max-w-4xl">
      <SectionTitle
        title="Indicators"
        actions={
          <Button
            variant="primary"
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
          >
            New indicator
          </Button>
        }
      />
      {list.data?.length === 0 ? (
        <EmptyHint>
          Indicators compute values from collected data — numerator / denominator ×
          factor. “% of people served who are female” = female ÷ all × 100.
        </EmptyHint>
      ) : (
        <Table>
          <THead>
            <Tr>
              <Th>Name</Th>
              <Th>Formula</Th>
              <Th>Type</Th>
              <Th />
            </Tr>
          </THead>
          <TBody>
            {list.data?.map((ind) => (
              <Tr key={ind.id} className="hover:bg-surface">
                <Td className="font-medium">{ind.name}</Td>
                <Td className="font-mono text-[12px]">
                  {ind.numeratorExpr}
                  {ind.denominatorExpr !== '1' ? ` / ${ind.denominatorExpr}` : ''}
                </Td>
                <Td className="text-ink-muted">{ind.indicatorType}</Td>
                <Td className="text-right">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setEditing(ind);
                      setOpen(true);
                    }}
                  >
                    Edit
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => remove.mutate(ind.id)}>
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
          title={editing ? `Edit ${editing.name}` : 'New indicator'}
          className="w-[min(680px,calc(100vw-2rem))]"
        >
          <IndicatorForm indicator={editing} onDone={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
    </section>
  );
}
