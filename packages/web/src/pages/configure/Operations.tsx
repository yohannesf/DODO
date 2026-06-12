// Operations (M6): device fleet (which field devices are lagging — spec
// §6.3), audit trail, webhook configuration.
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { WEBHOOK_EVENTS, type Webhook } from '@dodo/shared';
import {
  Button,
  Checkbox,
  Dialog,
  DialogClose,
  DialogContent,
  Field,
  FieldGroup,
  Input,
  TBody,
  Table,
  Td,
  Th,
  THead,
  Tr,
} from '../../components';
import { api } from '../../api/client';
import { useEntityList, useEntityMutations } from '../../api/metadata';
import { EmptyHint, ErrorNote, SectionTitle } from './common';

interface SyncStatus {
  serverTime: string;
  latestSeq: number;
  devices: Array<{
    deviceId: string;
    userId: string;
    lastSeen: string;
    lastPushAt: string | null;
  }>;
}

interface AuditRow {
  id: number;
  dataValueId: string;
  oldValue: string | null;
  newValue: string | null;
  actor: string | null;
  ts: string;
  action: string;
}

function DevicesPanel() {
  const status = useQuery({
    queryKey: ['syncStatus'],
    queryFn: () => api.get<SyncStatus>('/api/sync/status'),
  });
  return (
    <section>
      <SectionTitle title="Device fleet" />
      {status.data ? (
        <>
          <p className="mb-2 text-[12px] text-ink-muted">
            change log at <span className="tnum">{status.data.latestSeq}</span> · server
            time {new Date(status.data.serverTime).toLocaleString()}
          </p>
          {status.data.devices.length === 0 ? (
            <EmptyHint>No devices have pushed data yet.</EmptyHint>
          ) : (
            <Table>
              <THead>
                <Tr>
                  <Th>Device</Th>
                  <Th>Last seen</Th>
                  <Th>Last push</Th>
                  <Th>Lag</Th>
                </Tr>
              </THead>
              <TBody>
                {status.data.devices.map((d) => {
                  const lagMs = Date.now() - new Date(d.lastSeen).getTime();
                  const lagDays = Math.floor(lagMs / 86_400_000);
                  return (
                    <Tr key={d.deviceId} className="hover:bg-surface">
                      <Td className="font-mono text-[12px]">
                        {d.deviceId.slice(0, 13)}…
                      </Td>
                      <Td>{new Date(d.lastSeen).toLocaleString()}</Td>
                      <Td>
                        {d.lastPushAt ? new Date(d.lastPushAt).toLocaleString() : '—'}
                      </Td>
                      <Td>
                        <span
                          className={
                            lagDays >= 7
                              ? 'small-caps text-offtrack'
                              : lagDays >= 2
                                ? 'small-caps text-ochre'
                                : 'small-caps text-ink-muted'
                          }
                        >
                          {lagDays === 0 ? '● current' : `▲ ${lagDays}d behind`}
                        </span>
                      </Td>
                    </Tr>
                  );
                })}
              </TBody>
            </Table>
          )}
        </>
      ) : null}
      <ErrorNote error={status.error} />
    </section>
  );
}

function AuditPanel() {
  const audit = useQuery({
    queryKey: ['audit'],
    queryFn: () => api.get<AuditRow[]>('/api/data/audit'),
  });
  return (
    <section className="mt-10">
      <SectionTitle title="Data value audit" />
      {audit.data?.length === 0 ? (
        <EmptyHint>No data changes recorded yet.</EmptyHint>
      ) : (
        <Table>
          <THead>
            <Tr>
              <Th>When</Th>
              <Th>Action</Th>
              <Th numeric>Old</Th>
              <Th numeric>New</Th>
              <Th>Value id</Th>
            </Tr>
          </THead>
          <TBody>
            {audit.data?.slice(0, 50).map((a) => (
              <Tr key={a.id} className="hover:bg-surface">
                <Td className="text-ink-muted">{new Date(a.ts).toLocaleString()}</Td>
                <Td>
                  <span
                    className={
                      a.action === 'sync_conflict'
                        ? 'small-caps text-offtrack'
                        : 'small-caps text-ink-muted'
                    }
                  >
                    {a.action === 'sync_conflict' ? '▲' : '●'} {a.action}
                  </span>
                </Td>
                <Td numeric>{a.oldValue ?? '—'}</Td>
                <Td numeric>{a.newValue ?? '—'}</Td>
                <Td className="font-mono text-[11px]">{a.dataValueId.slice(0, 8)}…</Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      )}
      <ErrorNote error={audit.error} />
    </section>
  );
}

function WebhooksPanel() {
  const hooks = useEntityList('webhooks');
  const { create, update, remove } = useEntityMutations('webhooks');
  const [editing, setEditing] = useState<Webhook | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', url: '', secret: '' });
  const [events, setEvents] = useState<string[]>([]);

  function openFor(hook: Webhook | null) {
    setEditing(hook);
    setForm({
      name: hook?.name ?? '',
      url: hook?.url ?? '',
      secret: hook?.secret ?? '',
    });
    setEvents(hook?.events ?? []);
    setOpen(true);
  }

  function submit() {
    const input = { ...form, events, active: true };
    const promise = editing
      ? update.mutateAsync({ id: editing.id, patch: input })
      : create.mutateAsync(input);
    void promise.then(() => setOpen(false)).catch(() => {});
  }

  return (
    <section className="mt-10">
      <SectionTitle
        title="Webhooks"
        actions={
          <Button variant="primary" onClick={() => openFor(null)}>
            New webhook
          </Button>
        }
      />
      {hooks.data?.length === 0 ? (
        <EmptyHint>
          Webhooks POST a signed JSON payload to your systems when submissions are
          completed, approved, or rejected.
        </EmptyHint>
      ) : (
        <Table>
          <THead>
            <Tr>
              <Th>Name</Th>
              <Th>URL</Th>
              <Th>Events</Th>
              <Th>Last delivery</Th>
              <Th />
            </Tr>
          </THead>
          <TBody>
            {hooks.data?.map((h) => (
              <Tr key={h.id} className="hover:bg-surface">
                <Td className="font-medium">{h.name}</Td>
                <Td className="font-mono text-[12px]">{h.url}</Td>
                <Td className="text-ink-muted">{h.events.join(', ')}</Td>
                <Td>
                  {h.lastFiredAt ? (
                    <span
                      className={
                        (h.lastStatus ?? 0) >= 200 && (h.lastStatus ?? 0) < 300
                          ? 'small-caps text-ontrack'
                          : 'small-caps text-offtrack'
                      }
                    >
                      {(h.lastStatus ?? 0) > 0 ? `● ${h.lastStatus}` : '▲ unreachable'}
                    </span>
                  ) : (
                    <span className="small-caps text-ink-muted">— never</span>
                  )}
                </Td>
                <Td className="text-right">
                  <Button size="sm" variant="ghost" onClick={() => openFor(h)}>
                    Edit
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => remove.mutate(h.id)}>
                    Delete
                  </Button>
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      )}
      <ErrorNote error={create.error ?? update.error ?? remove.error} />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title={editing ? `Edit ${editing.name}` : 'New webhook'}>
          <div className="mt-4 space-y-3">
            <Field label="Name">
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                autoFocus
              />
            </Field>
            <Field label="URL">
              <Input
                value={form.url}
                onChange={(e) => setForm({ ...form, url: e.target.value })}
                placeholder="https://example.org/hooks/dodo"
              />
            </Field>
            <Field label="Secret" hint="HMAC-SHA256 signature in x-dodo-signature">
              <Input
                value={form.secret}
                onChange={(e) => setForm({ ...form, secret: e.target.value })}
              />
            </Field>
            <FieldGroup label="Events">
              <div className="space-y-1">
                {WEBHOOK_EVENTS.map((ev) => (
                  <Checkbox
                    key={ev}
                    label={ev}
                    checked={events.includes(ev)}
                    onChange={() =>
                      setEvents((list) =>
                        list.includes(ev) ? list.filter((x) => x !== ev) : [...list, ev],
                      )
                    }
                    className="block"
                  />
                ))}
              </div>
            </FieldGroup>
            <div className="flex justify-end gap-2">
              <DialogClose asChild>
                <Button>Cancel</Button>
              </DialogClose>
              <Button
                variant="primary"
                onClick={submit}
                disabled={!form.name || !form.url}
              >
                {editing ? 'Save' : 'Create webhook'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}

export function OperationsPage() {
  return (
    <div className="max-w-4xl">
      <DevicesPanel />
      <AuditPanel />
      <WebhooksPanel />
    </div>
  );
}
