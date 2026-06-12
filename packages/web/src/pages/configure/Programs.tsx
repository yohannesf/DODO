import { useState } from 'react';
import type { Program } from '@dodo/shared';
import {
  Button,
  Checkbox,
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
  const mutation = program ? update : create;

  function submit() {
    const input = { name, code, description, active };
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

export function ProgramsPage() {
  const list = useEntityList('programs');
  const { remove } = useEntityMutations('programs');
  const [editing, setEditing] = useState<Program | null>(null);
  const [open, setOpen] = useState(false);

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
              <Th>Description</Th>
              <Th>Status</Th>
              <Th />
            </Tr>
          </THead>
          <TBody>
            {list.data?.map((p) => (
              <Tr key={p.id} className="hover:bg-surface">
                <Td className="font-medium">{p.name}</Td>
                <Td className="font-mono text-[12px]">{p.code}</Td>
                <Td className="text-ink-muted">{p.description}</Td>
                <Td>
                  <span className="small-caps text-ink-muted">
                    {p.active ? '● active' : '◌ inactive'}
                  </span>
                </Td>
                <Td className="text-right">
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
    </section>
  );
}
