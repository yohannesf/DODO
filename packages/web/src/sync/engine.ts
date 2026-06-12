// Client sync engine (spec §5.3–5.4, §6): Dexie is the session source of
// truth; this module replicates asynchronously. Push first, then pull.
import { create } from 'zustand';
import {
  MAX_PUSH_OPS,
  uuidv7,
  type DataValueUpsertPayload,
  type SubmissionCompletePayload,
  type PullResponse,
  type PushResponse,
  type SyncCollection,
} from '@dodo/shared';
import { api } from '../api/client';
import { getDb, hasDb, type ConflictRow } from '../db/db';

export type SyncStatusKind = 'idle' | 'syncing' | 'offline' | 'attention';

interface SyncUiState {
  status: SyncStatusKind;
  pending: number;
  failed: number;
  conflicts: number;
  lastSyncAt: string | null;
  storagePersisted: boolean | null;
}

export const useSyncStatus = create<SyncUiState>(() => ({
  status: 'idle',
  pending: 0,
  failed: 0,
  conflicts: 0,
  lastSyncAt: null,
  storagePersisted: null,
}));

export async function refreshCounters(): Promise<void> {
  if (!hasDb()) return;
  const db = getDb();
  const [pending, failed, conflicts, state] = await Promise.all([
    db.outbox.where('state').anyOf('pending', 'inflight').count(),
    db.outbox.where('state').equals('failed').count(),
    db.conflicts.filter((c) => c.resolvedAt === null).count(),
    db.syncState.get('sync'),
  ]);
  useSyncStatus.setState({
    pending,
    failed,
    conflicts,
    lastSyncAt: state?.lastSyncAt ?? null,
  });
}

async function ensureSyncState() {
  const db = getDb();
  let state = await db.syncState.get('sync');
  if (!state) {
    state = {
      id: 'sync',
      deviceId: uuidv7(),
      cursor: 0,
      lastFullSync: null,
      lastSyncAt: null,
    };
    await db.syncState.put(state);
  }
  return state;
}

// --- write path (spec §5.3) -------------------------------------------------

let scheduled: ReturnType<typeof setTimeout> | null = null;

export function scheduleSync(delayMs = 1500): void {
  if (scheduled) clearTimeout(scheduled);
  scheduled = setTimeout(() => void syncNow(), delayMs);
}

export async function enqueueDataValue(
  payload: DataValueUpsertPayload,
  baseVersion: number | undefined,
): Promise<void> {
  const db = getDb();
  await db.transaction('rw', db.dataValues, db.outbox, async () => {
    await db.dataValues.put({ ...payload, version: baseVersion });
    // coalesce: a newer edit of the same cell supersedes its queued ops
    const stale = await db.outbox
      .where('state')
      .anyOf('pending', 'failed')
      .filter((op) => (op.payload as { id?: string }).id === payload.id)
      .primaryKeys();
    await db.outbox.bulkDelete(stale);
    await db.outbox.put({
      opId: uuidv7(),
      kind: 'dataValue.upsert',
      payload,
      clientTs: new Date().toISOString(),
      baseVersion,
      createdAt: new Date().toISOString(),
      tries: 0,
      state: 'pending',
    });
  });
  await refreshCounters();
  scheduleSync();
  // request durable storage after the first local save (spec §5.6)
  void requestPersistentStorage();
}

// --- push -------------------------------------------------------------------

async function pushOnce(): Promise<boolean> {
  const db = getDb();
  const state = await ensureSyncState();
  const batch = await db.outbox
    .where('state')
    .equals('pending')
    .sortBy('opId')
    .then((ops) => ops.slice(0, MAX_PUSH_OPS));
  if (batch.length === 0) return false;

  await db.outbox.bulkPut(batch.map((op) => ({ ...op, state: 'inflight' as const })));
  let response: PushResponse;
  try {
    response = await api.post<PushResponse>('/api/sync/push', {
      deviceId: state.deviceId,
      ops: batch.map(({ opId, kind, payload, clientTs, baseVersion }) => ({
        opId,
        kind,
        payload,
        clientTs,
        baseVersion,
      })),
    });
  } catch (err) {
    // network/server failure → back to pending, retried on the next trigger
    await db.outbox.bulkPut(
      batch.map((op) => ({ ...op, state: 'pending' as const, tries: op.tries + 1 })),
    );
    throw err;
  }

  for (const result of response.results) {
    const op = batch.find((o) => o.opId === result.opId);
    if (!op) continue;
    switch (result.status) {
      case 'applied':
      case 'duplicate': {
        await db.outbox.delete(op.opId);
        if (op.kind === 'dataValue.upsert' && result.serverVersion !== undefined) {
          const payload = op.payload as DataValueUpsertPayload;
          const row = await db.dataValues.get(payload.id);
          if (row) {
            await db.dataValues.put({ ...row, version: result.serverVersion });
          }
        }
        break;
      }
      case 'conflict': {
        // never silent last-write-wins: park for the resolver (spec §8.4)
        await db.conflicts.put({
          opId: op.opId,
          kind: op.kind,
          localPayload: op.payload,
          conflict: result.conflict!,
          createdAt: new Date().toISOString(),
          resolvedAt: null,
        });
        await db.outbox.delete(op.opId);
        break;
      }
      case 'rejected': {
        // permanent failure — visible until dismissed, never retried silently
        await db.outbox.put({
          ...op,
          state: 'failed',
          lastError: result.error ?? 'rejected by server',
        });
        break;
      }
    }
  }
  return batch.length === MAX_PUSH_OPS; // there may be more to push
}

// --- pull -------------------------------------------------------------------

const PROTECTED_TABLES = new Set<SyncCollection>(['dataValues']);

async function applyPullPage(page: PullResponse): Promise<void> {
  const db = getDb();
  const tables = [
    db.programs,
    db.orgUnitLevels,
    db.orgUnits,
    db.categories,
    db.categoryOptions,
    db.categoryCombos,
    db.categoryOptionCombos,
    db.optionSets,
    db.options,
    db.dataElements,
    db.datasets,
    db.dataValues,
    db.submissions,
    db.validationRules,
    db.outbox,
    db.syncState,
  ];
  await db.transaction('rw', tables, async () => {
    // local rows with unpushed edits win until the push resolves them
    const pendingValueIds = new Set<string>();
    await db.outbox.each((op) => {
      const payload = op.payload as { id?: string };
      if (payload?.id) pendingValueIds.add(payload.id);
    });

    for (const change of page.changes) {
      const table = db.table(change.collection);
      if (PROTECTED_TABLES.has(change.collection) && pendingValueIds.has(change.rowId)) {
        continue;
      }
      if (change.op === 'delete') {
        await table.delete(change.rowId);
      } else {
        await table.put(change.row as { id: string });
      }
    }
    const state = await db.syncState.get('sync');
    if (state) {
      await db.syncState.put({
        ...state,
        cursor: page.nextCursor,
        lastSyncAt: new Date().toISOString(),
        lastFullSync: state.lastFullSync ?? new Date().toISOString(),
      });
    }
  });
}

async function pullOnce(): Promise<void> {
  let state = await ensureSyncState();
  for (;;) {
    const page = await api.get<PullResponse>(`/api/sync/pull?cursor=${state.cursor}`);
    await applyPullPage(page);
    state = (await getDb().syncState.get('sync'))!;
    if (!page.hasMore) break;
  }
}

// --- orchestration (spec §5.4) ----------------------------------------------

let syncing = false;

export async function syncNow(): Promise<void> {
  if (syncing || !hasDb()) return;
  if (!navigator.onLine) {
    useSyncStatus.setState({ status: 'offline' });
    await refreshCounters();
    return;
  }
  syncing = true;
  useSyncStatus.setState({ status: 'syncing' });
  try {
    while (await pushOnce()) {
      /* drain the outbox in batches */
    }
    await pullOnce();
    await refreshCounters();
    const { failed, conflicts } = useSyncStatus.getState();
    useSyncStatus.setState({
      status: failed > 0 || conflicts > 0 ? 'attention' : 'idle',
    });
  } catch {
    await refreshCounters();
    useSyncStatus.setState({ status: navigator.onLine ? 'attention' : 'offline' });
    // transient failures (server hiccup, dropped response) retry shortly;
    // the op journal makes replays safe (§6.1)
    if (navigator.onLine) scheduleSync(5000);
  } finally {
    syncing = false;
  }
}

let started = false;

export function startSyncLoop(): void {
  if (started) return;
  started = true;
  window.addEventListener('online', () => void syncNow());
  window.addEventListener('offline', () => {
    useSyncStatus.setState({ status: 'offline' });
  });
  setInterval(() => {
    if (document.visibilityState === 'visible' && navigator.onLine) void syncNow();
  }, 90_000);
  void syncNow();
}

// --- storage stewardship (spec §5.6) -----------------------------------------

let persistRequested = false;

export async function requestPersistentStorage(): Promise<void> {
  if (persistRequested || !navigator.storage?.persist) return;
  persistRequested = true;
  const persisted = await navigator.storage.persisted();
  const granted = persisted || (await navigator.storage.persist());
  useSyncStatus.setState({ storagePersisted: granted });
}

// --- submissions (M3) ---------------------------------------------------------

export async function enqueueSubmissionComplete(
  payload: SubmissionCompletePayload,
): Promise<void> {
  const db = getDb();
  await db.transaction('rw', db.submissions, db.outbox, async () => {
    await db.submissions.put({
      ...payload,
      status: 'completed',
      completedAt: new Date().toISOString(),
    });
    await db.outbox.put({
      opId: uuidv7(),
      kind: 'submission.complete',
      payload,
      clientTs: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      tries: 0,
      state: 'pending',
    });
  });
  await refreshCounters();
  scheduleSync();
}

// --- conflict resolution (spec §8.4): keep mine / take server / edit ----------

export async function resolveConflictKeepMine(conflict: ConflictRow): Promise<void> {
  const local = conflict.localPayload as DataValueUpsertPayload;
  await enqueueDataValue(local, conflict.conflict.serverVersion);
  await getDb().conflicts.update(conflict.opId, {
    resolvedAt: new Date().toISOString(),
  });
  await refreshCounters();
}

export async function resolveConflictTakeServer(conflict: ConflictRow): Promise<void> {
  const db = getDb();
  const local = conflict.localPayload as DataValueUpsertPayload;
  const row = await db.dataValues.get(local.id);
  if (conflict.conflict.serverValue === null) {
    if (row) await db.dataValues.delete(local.id);
  } else if (row) {
    await db.dataValues.put({
      ...row,
      value: conflict.conflict.serverValue,
      version: conflict.conflict.serverVersion,
    });
  }
  await db.conflicts.update(conflict.opId, { resolvedAt: new Date().toISOString() });
  await refreshCounters();
}

export async function resolveConflictEdit(
  conflict: ConflictRow,
  newValue: string,
): Promise<void> {
  const local = conflict.localPayload as DataValueUpsertPayload;
  await enqueueDataValue({ ...local, value: newValue }, conflict.conflict.serverVersion);
  await getDb().conflicts.update(conflict.opId, {
    resolvedAt: new Date().toISOString(),
  });
  await refreshCounters();
}
