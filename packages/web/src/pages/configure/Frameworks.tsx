// Framework builder (spec §16.10): frameworks per program, level editor, node
// tree, indicator assignment, and per-mapping disaggregation filters. Built on
// the metadata hooks; node tree rendered inline (indented by level_order).
import { useMemo, useState } from 'react';
import type { Framework, FrameworkNode } from '@dodo/shared';
import {
  Button,
  Checkbox,
  Dialog,
  DialogClose,
  DialogContent,
  Field,
  Input,
  Select,
} from '../../components';
import { useEntityList, useEntityMutations } from '../../api/metadata';
import { EmptyHint, ErrorNote, SectionTitle } from './common';

function FrameworkForm({
  framework,
  onDone,
}: {
  framework: Framework | null;
  onDone: () => void;
}) {
  const programs = useEntityList('programs');
  const { create, update } = useEntityMutations('frameworks');
  const [name, setName] = useState(framework?.name ?? '');
  const [programId, setProgramId] = useState(framework?.programId ?? '');
  const [isInternal, setIsInternal] = useState(framework?.isInternal ?? false);
  const mutation = framework ? update : create;

  function submit() {
    const input = { name, programId, isInternal, description: null };
    const promise = framework
      ? update.mutateAsync({ id: framework.id, patch: { name, isInternal } })
      : create.mutateAsync(input);
    void promise.then(onDone).catch(() => {});
  }

  return (
    <div className="mt-4 space-y-3">
      <Field label="Name">
        <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </Field>
      {!framework ? (
        <Field label="Program">
          <Select value={programId} onChange={(e) => setProgramId(e.target.value)}>
            <option value="">choose…</option>
            {programs.data?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}
      <Checkbox
        label="Internal framework (default view)"
        checked={isInternal}
        onChange={(e) => setIsInternal(e.target.checked)}
      />
      <ErrorNote error={mutation.error} />
      <div className="flex justify-end gap-2 pt-1">
        <DialogClose asChild>
          <Button>Cancel</Button>
        </DialogClose>
        <Button
          variant="primary"
          onClick={submit}
          disabled={mutation.isPending || !name || (!framework && !programId)}
        >
          {framework ? 'Save' : 'Create'}
        </Button>
      </div>
    </div>
  );
}

function LevelEditor({ frameworkId }: { frameworkId: string }) {
  const all = useEntityList('frameworkLevels');
  const { create, remove } = useEntityMutations('frameworkLevels');
  const levels = (all.data ?? [])
    .filter((l) => l.frameworkId === frameworkId)
    .sort((a, b) => a.levelOrder - b.levelOrder);
  const [name, setName] = useState('');
  const nextOrder = (levels.at(-1)?.levelOrder ?? 0) + 1;

  return (
    <div>
      <h3 className="small-caps mb-1 font-medium text-ink-muted">Levels</h3>
      <ul className="space-y-1">
        {levels.map((l) => (
          <li key={l.id} className="flex items-center justify-between text-sm">
            <span>
              <span className="tnum mr-2 text-ink-muted">{l.levelOrder}</span>
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
          placeholder={`Level ${nextOrder} name (e.g. Outcome)`}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Button
          onClick={() =>
            create.mutate(
              { frameworkId, name, levelOrder: nextOrder },
              { onSuccess: () => setName('') },
            )
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

function NodeTree({
  frameworkId,
  selectedNodeId,
  onSelect,
}: {
  frameworkId: string;
  selectedNodeId: string | null;
  onSelect: (id: string) => void;
}) {
  const levelsAll = useEntityList('frameworkLevels');
  const nodesAll = useEntityList('frameworkNodes');
  const { create, remove } = useEntityMutations('frameworkNodes');

  const levels = (levelsAll.data ?? [])
    .filter((l) => l.frameworkId === frameworkId)
    .sort((a, b) => a.levelOrder - b.levelOrder);
  const nodes = (nodesAll.data ?? []).filter((n) => n.frameworkId === frameworkId);
  const levelOrder = new Map(levels.map((l) => [l.id, l.levelOrder]));

  // depth = parent chain length; used purely for indentation
  const depthOf = (n: FrameworkNode): number => {
    let d = 0;
    let cur: FrameworkNode | undefined = n;
    const byId = new Map(nodes.map((x) => [x.id, x]));
    while (cur?.parentId) {
      d++;
      cur = byId.get(cur.parentId);
      if (d > 20) break;
    }
    return d;
  };
  const ordered = [...nodes].sort((a, b) => {
    const la = levelOrder.get(a.levelId) ?? 99;
    const lb = levelOrder.get(b.levelId) ?? 99;
    return la - lb || a.sortOrder - b.sortOrder || a.title.localeCompare(b.title);
  });

  const [title, setTitle] = useState('');
  const [levelId, setLevelId] = useState('');
  const [parentId, setParentId] = useState('');

  return (
    <div>
      <h3 className="small-caps mb-1 font-medium text-ink-muted">Nodes</h3>
      {ordered.length === 0 ? (
        <EmptyHint>No nodes yet. Add levels first, then build the tree.</EmptyHint>
      ) : (
        <ul className="border border-hairline">
          {ordered.map((n) => (
            <li
              key={n.id}
              className={`flex items-center justify-between border-b border-hairline px-2 py-1 text-sm ${
                n.id === selectedNodeId ? 'bg-primary-tint' : 'hover:bg-surface'
              }`}
            >
              <button
                type="button"
                className="flex-1 text-left"
                style={{ paddingLeft: depthOf(n) * 16 }}
                onClick={() => onSelect(n.id)}
              >
                {n.title}
              </button>
              <Button size="sm" variant="ghost" onClick={() => remove.mutate(n.id)}>
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-2 grid grid-cols-2 gap-2">
        <Field label="New node title">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="Level">
          <Select value={levelId} onChange={(e) => setLevelId(e.target.value)}>
            <option value="">choose…</option>
            {levels.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Parent (optional)">
          <Select value={parentId} onChange={(e) => setParentId(e.target.value)}>
            <option value="">none (top level)</option>
            {ordered.map((n) => (
              <option key={n.id} value={n.id}>
                {n.title}
              </option>
            ))}
          </Select>
        </Field>
        <div className="flex items-end">
          <Button
            variant="primary"
            onClick={() =>
              create.mutate(
                { frameworkId, levelId, title, parentId: parentId || null },
                { onSuccess: () => setTitle('') },
              )
            }
            disabled={!title.trim() || !levelId}
          >
            Add node
          </Button>
        </div>
      </div>
      <ErrorNote error={create.error ?? remove.error} />
    </div>
  );
}

function IndicatorAssignment({ nodeId }: { nodeId: string }) {
  const indicators = useEntityList('indicators');
  const mappingsAll = useEntityList('indicatorMappings');
  const { create, remove } = useEntityMutations('indicatorMappings');

  const mappings = (mappingsAll.data ?? []).filter((m) => m.nodeId === nodeId);
  const mappedIndicatorIds = new Map(mappings.map((m) => [m.indicatorId, m.id]));

  function toggle(indicatorId: string, checked: boolean) {
    if (checked) {
      void create.mutateAsync({ indicatorId, nodeId, isPrimary: false }).catch(() => {});
    } else {
      const mappingId = mappedIndicatorIds.get(indicatorId);
      if (mappingId) remove.mutate(mappingId);
    }
  }

  return (
    <div>
      <h3 className="small-caps mb-1 font-medium text-ink-muted">
        Indicators on this node
      </h3>
      <ul className="max-h-56 overflow-auto border border-hairline">
        {(indicators.data ?? []).map((ind) => (
          <li
            key={ind.id}
            className="flex items-center gap-2 border-b border-hairline px-2 py-1 text-sm"
          >
            <Checkbox
              label=""
              checked={mappedIndicatorIds.has(ind.id)}
              onChange={(e) => toggle(ind.id, e.target.checked)}
            />
            <span className="flex-1">{ind.name}</span>
          </li>
        ))}
      </ul>
      <ErrorNote error={create.error ?? remove.error} />
      {mappings.map((m) => (
        <DisaggFilter key={m.id} mappingId={m.id} />
      ))}
    </div>
  );
}

function DisaggFilter({ mappingId }: { mappingId: string }) {
  const categories = useEntityList('categories');
  const options = useEntityList('categoryOptions');
  const filtersAll = useEntityList('frameworkDisaggFilters');
  const { create, remove } = useEntityMutations('frameworkDisaggFilters');
  const filters = (filtersAll.data ?? []).filter((f) => f.mappingId === mappingId);
  const [categoryId, setCategoryId] = useState('');

  return (
    <div className="mt-2 border-l-2 border-hairline pl-3 text-[12px]">
      <p className="small-caps text-ink-muted">Disaggregation filters</p>
      {filters.map((f) => {
        const cat = categories.data?.find((c) => c.id === f.categoryId);
        const allowed = (f.allowedOptionIds ?? []) as string[];
        const names = allowed.length
          ? (options.data ?? [])
              .filter((o) => allowed.includes(o.id as string))
              .map((o) => o.name)
              .join(', ')
          : 'all options';
        return (
          <div key={f.id} className="flex items-center justify-between py-0.5">
            <span>
              {cat?.name ?? '—'}: {names}
            </span>
            <Button size="sm" variant="ghost" onClick={() => remove.mutate(f.id)}>
              Remove
            </Button>
          </div>
        );
      })}
      <div className="mt-1 flex gap-2">
        <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          <option value="">add category filter…</option>
          {categories.data?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <Button
          size="sm"
          onClick={() =>
            create.mutate(
              { mappingId, categoryId, allowedOptionIds: [] },
              { onSuccess: () => setCategoryId('') },
            )
          }
          disabled={!categoryId}
        >
          Add
        </Button>
      </div>
    </div>
  );
}

export function FrameworksPage() {
  const frameworks = useEntityList('frameworks');
  const programs = useEntityList('programs');
  const { remove } = useEntityMutations('frameworks');
  const [editing, setEditing] = useState<Framework | null>(null);
  const [open, setOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const list = frameworks.data ?? [];
  const active = useMemo(
    () => list.find((f) => f.id === activeId) ?? null,
    [list, activeId],
  );
  const programName = (id: string | null) =>
    programs.data?.find((p) => p.id === id)?.name ?? '—';

  return (
    <section className="max-w-5xl">
      <SectionTitle
        title="Frameworks"
        actions={
          <Button
            variant="primary"
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
          >
            New framework
          </Button>
        }
      />
      {list.length === 0 ? (
        <EmptyHint>
          No frameworks yet. A framework is a donor or internal results hierarchy (USAID,
          BMGF, …); one indicator can map into several frameworks at once.
        </EmptyHint>
      ) : (
        <ul className="mb-6 space-y-1">
          {list.map((f) => (
            <li
              key={f.id}
              className={`flex items-center justify-between border border-hairline px-3 py-2 ${
                f.id === activeId ? 'bg-primary-tint' : ''
              }`}
            >
              <button
                type="button"
                className="text-left"
                onClick={() => {
                  setActiveId(f.id);
                  setSelectedNodeId(null);
                }}
              >
                <span className="font-medium">{f.name}</span>
                <span className="small-caps ml-2 text-ink-muted">
                  {programName(f.programId)}
                  {f.isInternal ? ' · internal' : ''}
                </span>
              </button>
              <span className="flex gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setEditing(f);
                    setOpen(true);
                  }}
                >
                  Edit
                </Button>
                <Button size="sm" variant="ghost" onClick={() => remove.mutate(f.id)}>
                  Delete
                </Button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <ErrorNote error={remove.error} />

      {active ? (
        <div className="grid grid-cols-2 gap-6 border-t border-hairline pt-4">
          <div className="space-y-4">
            <LevelEditor frameworkId={active.id} />
            <NodeTree
              frameworkId={active.id}
              selectedNodeId={selectedNodeId}
              onSelect={setSelectedNodeId}
            />
          </div>
          <div>
            {selectedNodeId ? (
              <IndicatorAssignment nodeId={selectedNodeId} />
            ) : (
              <EmptyHint>Select a node to assign indicators and set filters.</EmptyHint>
            )}
          </div>
        </div>
      ) : null}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title={editing ? `Edit ${editing.name}` : 'New framework'}>
          <FrameworkForm framework={editing} onDone={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
    </section>
  );
}
