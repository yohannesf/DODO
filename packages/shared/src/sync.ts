// Sync protocol schemas (spec §6) — single source of truth for both ends.
import { z } from 'zod';
import { periodStringSchema } from './schemas.js';

/** Collections replicated to clients; names double as Dexie table names. */
export const SYNC_COLLECTIONS = [
  'programs',
  'programFieldDefs',
  'programFieldValues',
  'orgUnitLevels',
  'orgUnits',
  'categories',
  'categoryOptions',
  'categoryCombos',
  'categoryOptionCombos',
  'optionSets',
  'options',
  'dataElements',
  'datasets',
  'dataValues',
  'submissions',
  'evidenceRequirements',
  'mediaFiles',
  'ragConfigs',
  'validationRules',
  'indicators',
  'resultsFrameworks',
  'rfNodes',
  'targets',
  'dashboards',
] as const;
export type SyncCollection = (typeof SYNC_COLLECTIONS)[number];

export const dataValueUpsertPayloadSchema = z.object({
  id: z.string().uuid(),
  dataElementId: z.string().uuid(),
  orgUnitId: z.string().uuid(),
  period: periodStringSchema,
  categoryOptionComboId: z.string().uuid(),
  value: z.string().min(1).max(50_000),
  comment: z.string().max(50_000).default(''),
});
export type DataValueUpsertPayload = z.infer<typeof dataValueUpsertPayloadSchema>;

export const dataValueDeletePayloadSchema = z.object({
  id: z.string().uuid(),
});

export const submissionCompletePayloadSchema = z.object({
  id: z.string().uuid(),
  datasetId: z.string().uuid(),
  orgUnitId: z.string().uuid(),
  period: periodStringSchema,
  note: z.string().max(2000).default(''),
});
export type SubmissionCompletePayload = z.infer<typeof submissionCompletePayloadSchema>;

export const SYNC_OP_KINDS = [
  'dataValue.upsert',
  'dataValue.delete',
  'submission.complete',
] as const;

export const syncOpSchema = z.object({
  opId: z.string().uuid(),
  kind: z.enum(SYNC_OP_KINDS),
  payload: z.unknown(),
  clientTs: z.string(),
  baseVersion: z.number().int().positive().optional(),
});
export type SyncOp = z.infer<typeof syncOpSchema>;

export const MAX_PUSH_OPS = 200;

export const pushRequestSchema = z.object({
  deviceId: z.string().uuid(),
  ops: z.array(syncOpSchema).min(1).max(MAX_PUSH_OPS),
});
export type PushRequest = z.infer<typeof pushRequestSchema>;

export const opStatusSchema = z.enum(['applied', 'duplicate', 'conflict', 'rejected']);
export type OpStatus = z.infer<typeof opStatusSchema>;

export const pushResultSchema = z.object({
  opId: z.string().uuid(),
  status: opStatusSchema,
  serverVersion: z.number().int().optional(),
  conflict: z
    .object({
      /** the server's row id for this cell — resolutions target it */
      serverId: z.string().uuid(),
      serverValue: z.string().nullable(),
      serverActor: z.string().nullable(),
      serverTs: z.string().nullable(),
      serverVersion: z.number().int(),
    })
    .optional(),
  error: z.string().optional(),
});
export type PushResult = z.infer<typeof pushResultSchema>;

export const pushResponseSchema = z.object({
  results: z.array(pushResultSchema),
});
export type PushResponse = z.infer<typeof pushResponseSchema>;

export interface PullChange {
  seq: number;
  collection: SyncCollection;
  op: 'upsert' | 'delete';
  rowId: string;
  /** present when op = upsert */
  row?: unknown;
}

export interface PullResponse {
  changes: PullChange[];
  nextCursor: number;
  hasMore: boolean;
}

export const PULL_PAGE_SIZE = 1000;
