import { useMemo, useState } from 'react';
import { generateCategoryOptionCombos, type Category } from '@dodo/shared';
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  Field,
  FieldGroup,
  Input,
  cx,
} from '../../components';
import { useEntityList, useEntityMutations, useOptionCombos } from '../../api/metadata';
import { EmptyHint, ErrorNote, SectionTitle } from './common';

function CategoriesPane({
  selected,
  onSelect,
}: {
  selected: Category | null;
  onSelect: (c: Category | null) => void;
}) {
  const categories = useEntityList('categories');
  const options = useEntityList('categoryOptions');
  const catMut = useEntityMutations('categories');
  const optMut = useEntityMutations('categoryOptions');
  const [newCat, setNewCat] = useState({ name: '', code: '' });
  const [newOpt, setNewOpt] = useState({ name: '', code: '' });

  const optsOf = (categoryId: string) =>
    (options.data ?? [])
      .filter((o) => o.categoryId === categoryId)
      .sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <div>
      <SectionTitle title="Categories" />
      {categories.data?.length === 0 ? (
        <EmptyHint>
          Categories are disaggregation axes — Sex, Age group, Water point type.
        </EmptyHint>
      ) : null}
      <ul className="space-y-1">
        {categories.data?.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              className={cx(
                'flex w-full items-baseline justify-between px-2 py-1 text-left text-sm',
                selected?.id === c.id
                  ? 'bg-surface font-medium text-cobalt'
                  : 'hover:bg-surface',
              )}
              onClick={() => onSelect(selected?.id === c.id ? null : c)}
            >
              {c.name}
              <span className="tnum text-[12px] text-ink-muted">
                {optsOf(c.id).length} options
              </span>
            </button>
            {selected?.id === c.id ? (
              <div className="mt-1 mb-2 ml-2 border-l border-hairline pl-3">
                <ul className="space-y-0.5 text-sm">
                  {optsOf(c.id).map((o) => (
                    <li key={o.id} className="flex justify-between">
                      <span>{o.name}</span>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => optMut.remove.mutate(o.id)}
                      >
                        ×
                      </Button>
                    </li>
                  ))}
                </ul>
                <div className="mt-1 flex gap-1">
                  <Input
                    placeholder="Option name"
                    value={newOpt.name}
                    onChange={(e) => setNewOpt({ ...newOpt, name: e.target.value })}
                    className="h-7 text-[13px]"
                  />
                  <Input
                    placeholder="Option code"
                    value={newOpt.code}
                    onChange={(e) => setNewOpt({ ...newOpt, code: e.target.value })}
                    className="h-7 w-28 text-[13px]"
                  />
                  <Button
                    size="sm"
                    onClick={() =>
                      optMut.create.mutate(
                        {
                          categoryId: c.id,
                          name: newOpt.name,
                          code: newOpt.code,
                          sortOrder: optsOf(c.id).length,
                        },
                        { onSuccess: () => setNewOpt({ name: '', code: '' }) },
                      )
                    }
                    disabled={!newOpt.name || !newOpt.code}
                  >
                    Add
                  </Button>
                </div>
                <ErrorNote error={optMut.create.error} />
                <div className="mt-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => catMut.remove.mutate(c.id)}
                  >
                    Delete category
                  </Button>
                </div>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      <div className="mt-3 flex gap-1">
        <Input
          placeholder="New category (e.g. Sex)"
          value={newCat.name}
          onChange={(e) => setNewCat({ ...newCat, name: e.target.value })}
          className="h-7 text-[13px]"
        />
        <Input
          placeholder="Category code"
          value={newCat.code}
          onChange={(e) => setNewCat({ ...newCat, code: e.target.value })}
          className="h-7 w-28 text-[13px]"
        />
        <Button
          size="sm"
          onClick={() =>
            catMut.create.mutate(newCat, {
              onSuccess: () => setNewCat({ name: '', code: '' }),
            })
          }
          disabled={!newCat.name || !newCat.code}
        >
          Add
        </Button>
      </div>
      <ErrorNote error={catMut.create.error ?? catMut.remove.error} />
    </div>
  );
}

function ComboBuilder({ onDone }: { onDone: () => void }) {
  const categories = useEntityList('categories');
  const options = useEntityList('categoryOptions');
  const { create } = useEntityMutations('categoryCombos');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [categoryIds, setCategoryIds] = useState<string[]>([]);

  const toggle = (id: string) =>
    setCategoryIds((ids) =>
      ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id],
    );

  // live preview with the exact code the server uses to materialise
  const preview = useMemo(() => {
    const cats = categoryIds
      .map((id) => categories.data?.find((c) => c.id === id))
      .filter((c): c is Category => !!c)
      .map((c) => ({
        id: c.id,
        name: c.name,
        options: (options.data ?? [])
          .filter((o) => o.categoryId === c.id)
          .map(({ id, name, sortOrder }) => ({ id, name, sortOrder })),
      }));
    if (cats.length === 0 || cats.some((c) => c.options.length === 0)) return null;
    try {
      return generateCategoryOptionCombos(cats);
    } catch {
      return null;
    }
  }, [categoryIds, categories.data, options.data]);

  return (
    <div className="mt-4 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </Field>
        <Field label="Code">
          <Input value={code} onChange={(e) => setCode(e.target.value)} />
        </Field>
      </div>
      <FieldGroup label="Categories (click in nesting order)">
        <div className="flex flex-wrap gap-2">
          {categories.data?.map((c) => {
            const idx = categoryIds.indexOf(c.id);
            return (
              <Button
                key={c.id}
                size="sm"
                variant={idx >= 0 ? 'primary' : 'secondary'}
                onClick={() => toggle(c.id)}
              >
                {idx >= 0 ? `${idx + 1}. ` : ''}
                {c.name}
              </Button>
            );
          })}
        </div>
      </FieldGroup>
      {preview ? (
        <div data-testid="combo-preview">
          <p className="small-caps mb-1 text-ink-muted">
            preview — {preview.length} combinations
          </p>
          <div className="flex max-h-36 flex-wrap gap-1 overflow-y-auto border border-hairline bg-surface p-2">
            {preview.map((p) => (
              <span
                key={p.optionIds.join('|')}
                className="border border-hairline px-1.5 py-0.5 text-[12px]"
              >
                {p.name}
              </span>
            ))}
          </div>
        </div>
      ) : categoryIds.length > 0 ? (
        <p className="text-[12px] text-ochre">
          ▲ every selected category needs at least one option
        </p>
      ) : null}
      <ErrorNote error={create.error} />
      <div className="flex justify-end gap-2 pt-1">
        <DialogClose asChild>
          <Button>Cancel</Button>
        </DialogClose>
        <Button
          variant="primary"
          disabled={!name || !code || !preview || create.isPending}
          onClick={() =>
            create.mutate({ name, code, categoryIds }, { onSuccess: onDone })
          }
        >
          Create combo
        </Button>
      </div>
    </div>
  );
}

function CombosPane() {
  const combos = useEntityList('categoryCombos');
  const { remove } = useEntityMutations('categoryCombos');
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const cocs = useOptionCombos(selectedId);

  return (
    <div>
      <SectionTitle
        title="Category combos"
        actions={
          <Button variant="primary" onClick={() => setOpen(true)}>
            New combo
          </Button>
        }
      />
      {combos.data?.length === 0 ? (
        <EmptyHint>
          A combo assigns one or more categories to a data element — Sex × Age becomes the
          columns of the entry grid.
        </EmptyHint>
      ) : null}
      <ul className="space-y-1">
        {combos.data?.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              onClick={() => setSelectedId(selectedId === c.id ? null : c.id)}
              className={cx(
                'flex w-full items-baseline justify-between px-2 py-1 text-left text-sm',
                selectedId === c.id
                  ? 'bg-surface font-medium text-cobalt'
                  : 'hover:bg-surface',
              )}
            >
              {c.name}
              <span className="font-mono text-[11px] text-ink-muted">{c.code}</span>
            </button>
            {selectedId === c.id ? (
              <div className="mt-1 mb-2 ml-2 border-l border-hairline pl-3">
                <p className="small-caps mb-1 text-ink-muted">
                  {cocs.data?.length ?? '…'} option combos
                </p>
                <div className="flex max-h-32 flex-wrap gap-1 overflow-y-auto">
                  {cocs.data?.map((coc) => (
                    <span
                      key={coc.id}
                      className="border border-hairline bg-surface px-1.5 py-0.5 text-[12px]"
                    >
                      {coc.name}
                    </span>
                  ))}
                </div>
                <div className="mt-2">
                  <Button size="sm" variant="ghost" onClick={() => remove.mutate(c.id)}>
                    Delete combo
                  </Button>
                </div>
                <ErrorNote error={remove.error} />
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          title="New category combo"
          className="w-[min(560px,calc(100vw-2rem))]"
        >
          <ComboBuilder onDone={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function DisaggregationPage() {
  const [selectedCat, setSelectedCat] = useState<Category | null>(null);
  return (
    <section className="grid max-w-4xl grid-cols-2 gap-10">
      <CategoriesPane selected={selectedCat} onSelect={setSelectedCat} />
      <CombosPane />
    </section>
  );
}
