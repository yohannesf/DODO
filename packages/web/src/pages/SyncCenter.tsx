// Sync Center (spec §8.4): outbox with per-item status, human error
// messages, conflicts, device storage panel. Never lose a value silently.
import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { DataValueUpsertPayload } from '@dodo/shared';
import { Button, TBody, Table, Td, Th, THead, Tr } from '../components';
import { getDb, hasDb, type ConflictRow } from '../db/db';
import {
  refreshCounters,
  requestPersistentStorage,
  syncNow,
  useSyncStatus,
} from '../sync/engine';
import { ConflictDialog } from '../entry/ConflictDialog';
import { Page } from './Page';

function StoragePanel() {
  const persisted = useSyncStatus((s) => s.storagePersisted);
  const [estimate, setEstimate] = useState<{ usage: number; quota: number } | null>(null);
  const counts = useLiveQuery(async () => {
    if (!hasDb()) return null;
    const db = getDb();
    return {
      dataValues: await db.dataValues.count(),
      metadata:
        (await db.orgUnits.count()) +
        (await db.dataElements.count()) +
        (await db.datasets.count()),
    };
  });

  useEffect(() => {
    void requestPersistentStorage();
    void navigator.storage?.estimate?.().then((e) => {
      setEstimate({ usage: e.usage ?? 0, quota: e.quota ?? 0 });
    });
  }, []);

  const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;

  return (
    <section className="mt-8 max-w-md">
      <h2 className="text-base font-semibold">Device storage</h2>
      <dl className="mt-2 space-y-1 text-sm">
        <div className="flex justify-between border-b border-hairline py-1">
          <dt className="text-ink-muted">Persistent storage</dt>
          <dd className="small-caps">
            {persisted === null ? '…' : persisted ? '● granted' : '▲ not granted'}
          </dd>
        </div>
        <div className="flex justify-between border-b border-hairline py-1">
          <dt className="text-ink-muted">Used / quota</dt>
          <dd className="tnum">
            {estimate ? `${mb(estimate.usage)} / ${mb(estimate.quota)}` : '…'}
          </dd>
        </div>
        <div className="flex justify-between border-b border-hairline py-1">
          <dt className="text-ink-muted">Data values on device</dt>
          <dd className="tnum">{counts?.dataValues ?? '…'}</dd>
        </div>
        <div className="flex justify-between border-b border-hairline py-1">
          <dt className="text-ink-muted">Metadata rows on device</dt>
          <dd className="tnum">{counts?.metadata ?? '…'}</dd>
        </div>
      </dl>
      {persisted === false ? (
        <p className="mt-2 text-[12px] text-ochre">
          ▲ The browser may evict local data under disk pressure. On iOS, clearing Safari
          history deletes app data — sync often.
        </p>
      ) : null}
    </section>
  );
}

function ConflictItem({
  conflict,
  onResolve,
}: {
  conflict: ConflictRow;
  onResolve: (c: ConflictRow) => void;
}) {
  const local = conflict.localPayload as DataValueUpsertPayload;
  return (
    <Tr>
      <Td className="font-mono text-[11px]">{local.id.slice(0, 8)}…</Td>
      <Td numeric className="font-medium">
        {local.value}
      </Td>
      <Td numeric>{conflict.conflict.serverValue ?? '—'}</Td>
      <Td className="text-ink-muted">
        {new Date(conflict.conflict.serverTs ?? conflict.createdAt).toLocaleString()}
      </Td>
      <Td className="text-right whitespace-nowrap">
        <Button size="sm" variant="primary" onClick={() => onResolve(conflict)}>
          Resolve…
        </Button>
      </Td>
    </Tr>
  );
}

export function SyncCenter() {
  const { status, lastSyncAt } = useSyncStatus();
  const [resolving, setResolving] = useState<ConflictRow | null>(null);

  const outbox = useLiveQuery(
    () => (hasDb() ? getDb().outbox.orderBy('createdAt').toArray() : []),
    [],
  );
  const conflicts = useLiveQuery(
    () =>
      hasDb()
        ? getDb()
            .conflicts.filter((c) => c.resolvedAt === null)
            .toArray()
        : [],
    [],
  );

  return (
    <Page number="08" title="Sync Center">
      <div className="flex items-center gap-4">
        <span className="small-caps" data-testid="sync-status">
          state: {status}
          {lastSyncAt ? ` — last sync ${new Date(lastSyncAt).toLocaleTimeString()}` : ''}
        </span>
        <Button size="sm" variant="primary" onClick={() => void syncNow()}>
          Sync now
        </Button>
      </div>

      <section className="mt-6">
        <h2 className="text-base font-semibold text-ink">
          Outbox <span className="tnum text-ink-muted">({outbox?.length ?? 0})</span>
        </h2>
        {outbox?.length ? (
          <Table className="mt-2">
            <THead>
              <Tr>
                <Th>Operation</Th>
                <Th>Created</Th>
                <Th>State</Th>
                <Th>Problem</Th>
                <Th />
              </Tr>
            </THead>
            <TBody>
              {outbox.map((op) => (
                <Tr key={op.opId}>
                  <Td className="font-mono text-[12px]">{op.kind}</Td>
                  <Td className="text-ink-muted">
                    {new Date(op.createdAt).toLocaleTimeString()}
                  </Td>
                  <Td>
                    <span className="small-caps">
                      {op.state === 'failed' ? '▲ failed' : `◌ ${op.state}`}
                    </span>
                  </Td>
                  <Td className="text-offtrack">{op.lastError ?? ''}</Td>
                  <Td className="text-right">
                    {op.state === 'failed' ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          void getDb().outbox.delete(op.opId).then(refreshCounters);
                        }}
                      >
                        Dismiss
                      </Button>
                    ) : null}
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        ) : (
          <p className="mt-1 text-sm text-ink-muted">
            Empty — every local change has reached the server.
          </p>
        )}
      </section>

      <section className="mt-6">
        <h2 className="text-base font-semibold text-ink">
          Conflicts{' '}
          <span className="tnum text-ink-muted">({conflicts?.length ?? 0})</span>
        </h2>
        {conflicts?.length ? (
          <Table className="mt-2">
            <THead>
              <Tr>
                <Th>Value</Th>
                <Th numeric>Mine</Th>
                <Th numeric>Server</Th>
                <Th>Server changed</Th>
                <Th />
              </Tr>
            </THead>
            <TBody>
              {conflicts.map((c) => (
                <ConflictItem key={c.opId} conflict={c} onResolve={setResolving} />
              ))}
            </TBody>
          </Table>
        ) : (
          <p className="mt-1 text-sm text-ink-muted">
            None — no value was edited in two places at once.
          </p>
        )}
      </section>

      <StoragePanel />
      <ConflictDialog conflict={resolving} onClose={() => setResolving(null)} />
    </Page>
  );
}
