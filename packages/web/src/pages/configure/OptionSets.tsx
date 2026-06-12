import { useState } from 'react';
import { Button, Input, cx } from '../../components';
import { useEntityList, useEntityMutations } from '../../api/metadata';
import { EmptyHint, ErrorNote, SectionTitle } from './common';

export function OptionSetsPage() {
  const sets = useEntityList('optionSets');
  const options = useEntityList('options');
  const setMut = useEntityMutations('optionSets');
  const optMut = useEntityMutations('options');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newSet, setNewSet] = useState({ name: '', code: '' });
  const [newOpt, setNewOpt] = useState({ name: '', code: '' });

  const optsOf = (setId: string) =>
    (options.data ?? [])
      .filter((o) => o.optionSetId === setId)
      .sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <section className="max-w-2xl">
      <SectionTitle title="Option sets" />
      {sets.data?.length === 0 ? (
        <EmptyHint>
          Option sets give OPTION-type data elements their allowed values — e.g. Water
          point type → {'{'}borehole, dug well, spring{'}'}.
        </EmptyHint>
      ) : null}
      <ul className="space-y-1">
        {sets.data?.map((s) => (
          <li key={s.id}>
            <button
              type="button"
              onClick={() => setSelectedId(selectedId === s.id ? null : s.id)}
              className={cx(
                'flex w-full items-baseline justify-between px-2 py-1 text-left text-sm',
                selectedId === s.id
                  ? 'bg-surface font-medium text-cobalt'
                  : 'hover:bg-surface',
              )}
            >
              {s.name}
              <span className="tnum text-[12px] text-ink-muted">
                {optsOf(s.id).length} options
              </span>
            </button>
            {selectedId === s.id ? (
              <div className="mt-1 mb-2 ml-2 border-l border-hairline pl-3">
                <ul className="space-y-0.5 text-sm">
                  {optsOf(s.id).map((o) => (
                    <li key={o.id} className="flex justify-between">
                      <span>
                        {o.name}{' '}
                        <span className="font-mono text-[11px] text-ink-muted">
                          {o.code}
                        </span>
                      </span>
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
                    placeholder="Code"
                    value={newOpt.code}
                    onChange={(e) => setNewOpt({ ...newOpt, code: e.target.value })}
                    className="h-7 w-28 text-[13px]"
                  />
                  <Button
                    size="sm"
                    onClick={() =>
                      optMut.create.mutate(
                        {
                          optionSetId: s.id,
                          ...newOpt,
                          sortOrder: optsOf(s.id).length,
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
                    onClick={() => setMut.remove.mutate(s.id)}
                  >
                    Delete set
                  </Button>
                </div>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      <div className="mt-3 flex gap-1">
        <Input
          placeholder="New option set name"
          value={newSet.name}
          onChange={(e) => setNewSet({ ...newSet, name: e.target.value })}
          className="h-7 text-[13px]"
        />
        <Input
          placeholder="Code"
          value={newSet.code}
          onChange={(e) => setNewSet({ ...newSet, code: e.target.value })}
          className="h-7 w-28 text-[13px]"
        />
        <Button
          size="sm"
          onClick={() =>
            setMut.create.mutate(newSet, {
              onSuccess: () => setNewSet({ name: '', code: '' }),
            })
          }
          disabled={!newSet.name || !newSet.code}
        >
          Add
        </Button>
      </div>
      <ErrorNote error={setMut.create.error ?? setMut.remove.error} />
    </section>
  );
}
