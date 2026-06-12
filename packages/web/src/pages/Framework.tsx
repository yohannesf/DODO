// Results framework + targets view (spec §8.2): Goal → Outcome → Output →
// Activity tree, indicators per node, baselines and targets per org unit.
import { useMemo, useState } from 'react';
import { RF_NODE_KINDS, type Indicator, type RfNode, type Target } from '@dodo/shared';
import {
  Button,
  Checkbox,
  Dialog,
  DialogClose,
  DialogContent,
  Field,
  Input,
  Select,
  cx,
} from '../components';
import { useEntityList, useEntityMutations } from '../api/metadata';
import { EmptyHint, ErrorNote, SectionTitle } from './configure/common';
import { Page } from './Page';

const CHILD_KIND: Record<string, (typeof RF_NODE_KINDS)[number]> = {
  goal: 'outcome',
  outcome: 'output',
  output: 'activity',
  activity: 'activity',
};

function NodeForm({
  frameworkId,
  parent,
  node,
  onDone,
}: {
  frameworkId: string;
  parent: RfNode | null;
  node: RfNode | null;
  onDone: () => void;
}) {
  const indicators = useEntityList('indicators');
  const { create, update } = useEntityMutations('rfNodes');
  const [title, setTitle] = useState(node?.title ?? '');
  const [kind, setKind] = useState<(typeof RF_NODE_KINDS)[number]>(
    node?.kind ?? (parent ? CHILD_KIND[parent.kind]! : 'goal'),
  );
  const [indicatorIds, setIndicatorIds] = useState<string[]>(node?.indicatorIds ?? []);
  const mutation = node ? update : create;

  function submit() {
    const input = {
      frameworkId,
      parentId: parent?.id ?? node?.parentId ?? null,
      kind,
      title,
      indicatorIds,
      sortOrder: node?.sortOrder ?? 0,
    };
    const promise = node
      ? update.mutateAsync({ id: node.id, patch: input })
      : create.mutateAsync(input);
    void promise.then(onDone).catch(() => {});
  }

  return (
    <div className="mt-4 space-y-3">
      <div className="grid grid-cols-[1fr_140px] gap-3">
        <Field label="Title">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        </Field>
        <Field label="Kind">
          <Select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
            {RF_NODE_KINDS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Linked indicators">
        <div className="max-h-40 space-y-0.5 overflow-y-auto border border-hairline bg-surface p-2">
          {indicators.data?.length === 0 ? (
            <p className="text-[12px] text-ink-muted">
              no indicators yet — create them under Configure → Indicators
            </p>
          ) : null}
          {indicators.data?.map((i) => (
            <Checkbox
              key={i.id}
              label={i.name}
              checked={indicatorIds.includes(i.id)}
              onChange={() =>
                setIndicatorIds((ids) =>
                  ids.includes(i.id) ? ids.filter((x) => x !== i.id) : [...ids, i.id],
                )
              }
              className="block"
            />
          ))}
        </div>
      </Field>
      <ErrorNote error={mutation.error} />
      <div className="flex justify-end gap-2">
        <DialogClose asChild>
          <Button>Cancel</Button>
        </DialogClose>
        <Button
          variant="primary"
          onClick={submit}
          disabled={!title || mutation.isPending}
        >
          {node ? 'Save' : 'Add node'}
        </Button>
      </div>
    </div>
  );
}

function TargetsEditor({ indicator }: { indicator: Indicator }) {
  const orgUnits = useEntityList('orgUnits');
  const targets = useEntityList('targets');
  const { create, remove } = useEntityMutations('targets');
  const [form, setForm] = useState({
    orgUnitId: '',
    period: '2026',
    value: '',
    kind: 'target' as Target['kind'],
  });

  const mine = (targets.data ?? []).filter((t) => t.indicatorId === indicator.id);
  const ouName = (id: string) =>
    orgUnits.data?.find((o) => o.id === id)?.name ?? id.slice(0, 8);

  return (
    <div className="mt-2 ml-6 border-l border-hairline pl-4">
      <p className="small-caps mb-1 text-ink-muted">baselines & targets</p>
      <ul className="space-y-0.5 text-[13px]">
        {mine.map((t) => (
          <li key={t.id} className="flex items-center justify-between">
            <span>
              <span className={t.kind === 'baseline' ? 'text-ink-muted' : ''}>
                {t.kind === 'baseline' ? '◌' : '●'} {t.kind}
              </span>{' '}
              {ouName(t.orgUnitId)} · {t.period} ·{' '}
              <span className="tnum font-medium">{t.value}</span>
            </span>
            <Button size="sm" variant="ghost" onClick={() => remove.mutate(t.id)}>
              ×
            </Button>
          </li>
        ))}
      </ul>
      <div className="mt-1 flex items-center gap-1">
        <Select
          value={form.kind}
          className="w-26"
          onChange={(e) => setForm({ ...form, kind: e.target.value as Target['kind'] })}
        >
          <option value="target">target</option>
          <option value="baseline">baseline</option>
        </Select>
        <Select
          value={form.orgUnitId}
          onChange={(e) => setForm({ ...form, orgUnitId: e.target.value })}
        >
          <option value="">org unit…</option>
          {orgUnits.data?.map((o) => (
            <option key={o.id} value={o.id}>
              {' '.repeat((o.level - 1) * 2)}
              {o.name}
            </option>
          ))}
        </Select>
        <Input
          placeholder="2026"
          value={form.period}
          onChange={(e) => setForm({ ...form, period: e.target.value })}
          className="h-8 w-24"
        />
        <Input
          placeholder="value"
          value={form.value}
          onChange={(e) => setForm({ ...form, value: e.target.value })}
          className="tnum h-8 w-24 text-right"
        />
        <Button
          size="sm"
          disabled={!form.orgUnitId || !form.period || form.value === ''}
          onClick={() =>
            create.mutate(
              {
                indicatorId: indicator.id,
                orgUnitId: form.orgUnitId,
                period: form.period,
                value: Number(form.value),
                kind: form.kind,
              },
              { onSuccess: () => setForm({ ...form, value: '' }) },
            )
          }
        >
          Add
        </Button>
      </div>
      <ErrorNote error={create.error} />
    </div>
  );
}

export function Framework() {
  const frameworks = useEntityList('resultsFrameworks');
  const nodes = useEntityList('rfNodes');
  const indicators = useEntityList('indicators');
  const fwMut = useEntityMutations('resultsFrameworks');
  const nodeMut = useEntityMutations('rfNodes');

  const [frameworkId, setFrameworkId] = useState('');
  const [newFw, setNewFw] = useState({ name: '', code: '' });
  const [dialog, setDialog] = useState<{
    parent: RfNode | null;
    node: RfNode | null;
  } | null>(null);
  const [expandedIndicator, setExpandedIndicator] = useState<string | null>(null);

  const framework =
    frameworks.data?.find((f) => f.id === frameworkId) ?? frameworks.data?.[0] ?? null;

  const tree = useMemo(() => {
    const mine = (nodes.data ?? []).filter((n) => n.frameworkId === framework?.id);
    const childrenOf = (parentId: string | null): RfNode[] =>
      mine
        .filter((n) => n.parentId === parentId)
        .sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title));
    const flat: Array<{ node: RfNode; depth: number }> = [];
    const walk = (parentId: string | null, depth: number) => {
      for (const n of childrenOf(parentId)) {
        flat.push({ node: n, depth });
        walk(n.id, depth + 1);
      }
    };
    walk(null, 0);
    return flat;
  }, [nodes.data, framework]);

  const indicatorById = (id: string) => indicators.data?.find((i) => i.id === id);

  return (
    <Page number="06" title="Framework">
      <div className="mb-4 flex items-end gap-3">
        <Field label="Results framework">
          <Select
            value={framework?.id ?? ''}
            onChange={(e) => setFrameworkId(e.target.value)}
            className="w-64"
          >
            {frameworks.data?.length === 0 ? <option value="">none yet</option> : null}
            {frameworks.data?.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </Select>
        </Field>
        <Input
          placeholder="New framework name"
          value={newFw.name}
          onChange={(e) => setNewFw({ ...newFw, name: e.target.value })}
          className="w-48"
        />
        <Input
          placeholder="Code"
          value={newFw.code}
          onChange={(e) => setNewFw({ ...newFw, code: e.target.value })}
          className="w-28"
        />
        <Button
          disabled={!newFw.name || !newFw.code}
          onClick={() =>
            fwMut.create.mutate(newFw, {
              onSuccess: () => setNewFw({ name: '', code: '' }),
            })
          }
        >
          Create
        </Button>
        {framework ? (
          <Button
            variant="primary"
            onClick={() => setDialog({ parent: null, node: null })}
          >
            Add goal
          </Button>
        ) : null}
      </div>
      <ErrorNote error={fwMut.create.error} />

      {!framework ? (
        <EmptyHint>
          A results framework is the Goal → Outcome → Output → Activity tree your
          indicators hang from. Create one to start.
        </EmptyHint>
      ) : (
        <div className="max-w-3xl">
          <SectionTitle title={framework.name} />
          {tree.length === 0 ? (
            <EmptyHint>No nodes yet — add the goal first.</EmptyHint>
          ) : (
            <ul data-testid="framework-tree">
              {tree.map(({ node, depth }) => (
                <li
                  key={node.id}
                  className="border-b border-hairline py-1.5"
                  style={{ paddingLeft: `${depth * 22}px` }}
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-sm">
                      <span className="small-caps mr-2 text-ink-muted">{node.kind}</span>
                      <span className="font-medium">{node.title}</span>
                    </span>
                    <span className="flex shrink-0 gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setDialog({ parent: node, node: null })}
                      >
                        Add child
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setDialog({ parent: null, node })}
                      >
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => nodeMut.remove.mutate(node.id)}
                      >
                        Delete
                      </Button>
                    </span>
                  </div>
                  {node.indicatorIds.length > 0 ? (
                    <ul className="mt-1 space-y-0.5">
                      {node.indicatorIds.map((id) => {
                        const ind = indicatorById(id);
                        if (!ind) return null;
                        const open = expandedIndicator === `${node.id}:${id}`;
                        return (
                          <li key={id} className="text-[13px]">
                            <button
                              type="button"
                              className={cx(
                                'cursor-pointer',
                                open ? 'text-cobalt' : 'text-ink-muted hover:text-ink',
                              )}
                              onClick={() =>
                                setExpandedIndicator(open ? null : `${node.id}:${id}`)
                              }
                            >
                              ◆ {ind.name}
                            </button>
                            {open ? <TargetsEditor indicator={ind} /> : null}
                          </li>
                        );
                      })}
                    </ul>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          <ErrorNote error={nodeMut.remove.error} />
        </div>
      )}

      <Dialog open={dialog !== null} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent
          title={
            dialog?.node
              ? `Edit ${dialog.node.title}`
              : dialog?.parent
                ? `Add child of ${dialog.parent.title}`
                : 'Add goal'
          }
          className="w-[min(560px,calc(100vw-2rem))]"
        >
          {framework && dialog ? (
            <NodeForm
              frameworkId={framework.id}
              parent={dialog.parent}
              node={dialog.node}
              onDone={() => setDialog(null)}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </Page>
  );
}
