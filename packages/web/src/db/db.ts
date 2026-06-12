// Dexie schema (spec §5.2): metadata mirrors + data tables + client-only
// outbox/sync/auth/conflict tables. One database per user (spec §9) so
// shared devices keep outboxes separate.
import Dexie, { type Table } from 'dexie';
import type {
  AuthUser,
  CategoryOptionCombo,
  DataValueUpsertPayload,
  OrgUnit,
  PushResult,
  SyncOp,
} from '@dodo/shared';

export interface LocalDataValue extends DataValueUpsertPayload {
  /** server version of the row this client last saw (conflict base) */
  version?: number;
  updatedAt?: string;
}

export interface OutboxEntry extends SyncOp {
  createdAt: string;
  tries: number;
  lastError?: string;
  state: 'pending' | 'inflight' | 'failed' | 'conflicted';
}

export interface SyncStateRow {
  id: 'sync';
  deviceId: string;
  cursor: number;
  lastFullSync: string | null;
  lastSyncAt: string | null;
}

export interface AuthCacheRow {
  id: 'auth';
  user: AuthUser;
  cachedAt: string;
}

export interface ConflictRow {
  opId: string;
  kind: SyncOp['kind'];
  localPayload: unknown;
  conflict: NonNullable<PushResult['conflict']>;
  createdAt: string;
  resolvedAt: string | null;
}

type Row = Record<string, unknown>;

export class DodoDb extends Dexie {
  programs!: Table<Row, string>;
  orgUnitLevels!: Table<Row, string>;
  orgUnits!: Table<OrgUnit, string>;
  categories!: Table<Row, string>;
  categoryOptions!: Table<Row, string>;
  categoryCombos!: Table<Row, string>;
  categoryOptionCombos!: Table<CategoryOptionCombo, string>;
  optionSets!: Table<Row, string>;
  options!: Table<Row, string>;
  dataElements!: Table<Row, string>;
  datasets!: Table<Row, string>;
  dataValues!: Table<LocalDataValue, string>;
  submissions!: Table<Row, string>;
  outbox!: Table<OutboxEntry, string>;
  syncState!: Table<SyncStateRow, string>;
  authCache!: Table<AuthCacheRow, string>;
  conflicts!: Table<ConflictRow, string>;

  constructor(name: string) {
    super(name);
    this.version(1).stores({
      programs: 'id',
      orgUnitLevels: 'id, level',
      orgUnits: 'id, path, parentId',
      categories: 'id',
      categoryOptions: 'id, categoryId',
      categoryCombos: 'id',
      categoryOptionCombos: 'id, comboId',
      optionSets: 'id',
      options: 'id, optionSetId',
      dataElements: 'id',
      datasets: 'id',
      dataValues:
        'id, [dataElementId+orgUnitId+period+categoryOptionComboId], orgUnitId, period',
      submissions: 'id, [datasetId+orgUnitId+period]',
      outbox: 'opId, state, createdAt',
      syncState: 'id',
      authCache: 'id',
      conflicts: 'opId, resolvedAt, createdAt',
    });
  }
}

let current: DodoDb | null = null;

export function openDb(userId: string): DodoDb {
  if (current?.name === `dodo_${userId}`) return current;
  current?.close();
  current = new DodoDb(`dodo_${userId}`);
  return current;
}

/** The active per-user database; throws when nobody is logged in. */
export function getDb(): DodoDb {
  if (!current) throw new Error('no user database open — not logged in?');
  return current;
}

export function hasDb(): boolean {
  return current !== null;
}
