// Approvals (spec §3, §7.1): per-dataset chain of approval levels. A
// completed submission needs `dataset.approval_levels` sequential approvals;
// any rejection ends the chain. Approvers act within their org-unit scope.
import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm';
import { uuidv7, type AuthUser } from '@dodo/shared';
import type { Db } from '../db/index.js';
import { approval, dataset, orgUnit, submission, user } from '../db/schema.js';
import { badRequest, notFound } from '../lib/errors.js';
import { fireWebhooks } from './webhooks.js';

async function userScopePaths(db: Db, who: AuthUser): Promise<string[] | null> {
  if (who.permissions.includes('system:admin')) return null; // unrestricted
  const ids = who.orgUnits.map((o) => o.orgUnitId);
  if (ids.length === 0) return [];
  const rows = await db
    .select({ path: orgUnit.path })
    .from(orgUnit)
    .where(and(inArray(orgUnit.id, ids), isNull(orgUnit.deletedAt)));
  return rows.map((r) => r.path);
}

const within = (paths: string[] | null, path: string) =>
  paths === null || paths.some((p) => path === p || path.startsWith(`${p}.`));

export interface PendingApproval {
  submissionId: string;
  datasetId: string;
  datasetName: string;
  orgUnitId: string;
  orgUnitName: string;
  period: string;
  completedBy: string | null;
  completedByName: string | null;
  completedAt: string | null;
  note: string;
  approvalLevels: number;
  /** approvals granted so far (= the next level to act on) */
  approvedLevels: number;
}

export async function listPending(db: Db, who: AuthUser): Promise<PendingApproval[]> {
  const scope = await userScopePaths(db, who);
  const rows = await db
    .select({
      submissionId: submission.id,
      datasetId: submission.datasetId,
      datasetName: dataset.name,
      orgUnitId: submission.orgUnitId,
      orgUnitName: orgUnit.name,
      orgUnitPath: orgUnit.path,
      period: submission.period,
      completedBy: submission.completedBy,
      completedAt: submission.completedAt,
      note: submission.note,
      approvalLevels: dataset.approvalLevels,
      requiresApproval: dataset.requiresApproval,
    })
    .from(submission)
    .innerJoin(dataset, eq(dataset.id, submission.datasetId))
    .innerJoin(orgUnit, eq(orgUnit.id, submission.orgUnitId))
    .where(eq(submission.status, 'completed'))
    .orderBy(desc(submission.updatedAt));

  const inScope = rows.filter((r) => r.requiresApproval && within(scope, r.orgUnitPath));
  if (inScope.length === 0) return [];

  const approvals = await db
    .select()
    .from(approval)
    .where(
      inArray(
        approval.submissionId,
        inScope.map((r) => r.submissionId),
      ),
    )
    .orderBy(asc(approval.level));

  const users = await db
    .select({ id: user.id, displayName: user.displayName })
    .from(user);
  const nameOf = new Map(users.map((u) => [u.id, u.displayName]));

  return inScope.map((r) => ({
    submissionId: r.submissionId,
    datasetId: r.datasetId,
    datasetName: r.datasetName,
    orgUnitId: r.orgUnitId,
    orgUnitName: r.orgUnitName,
    period: r.period,
    completedBy: r.completedBy,
    completedByName: r.completedBy ? (nameOf.get(r.completedBy) ?? null) : null,
    completedAt: r.completedAt,
    note: r.note,
    approvalLevels: r.approvalLevels,
    approvedLevels: approvals.filter(
      (a) => a.submissionId === r.submissionId && a.status === 'approved',
    ).length,
  }));
}

export async function act(
  db: Db,
  who: AuthUser,
  submissionId: string,
  status: 'approved' | 'rejected',
  comment: string,
): Promise<{ submissionStatus: string; level: number }> {
  const rows = await db
    .select({
      sub: submission,
      approvalLevels: dataset.approvalLevels,
      requiresApproval: dataset.requiresApproval,
      datasetName: dataset.name,
      orgUnitPath: orgUnit.path,
      orgUnitName: orgUnit.name,
    })
    .from(submission)
    .innerJoin(dataset, eq(dataset.id, submission.datasetId))
    .innerJoin(orgUnit, eq(orgUnit.id, submission.orgUnitId))
    .where(eq(submission.id, submissionId));
  const row = rows[0];
  if (!row) throw notFound('submission');
  if (!row.requiresApproval) throw badRequest('dataset does not require approval');
  if (row.sub.status !== 'completed') {
    throw badRequest(`submission is ${row.sub.status}, not completed`);
  }
  const scope = await userScopePaths(db, who);
  if (!within(scope, row.orgUnitPath)) {
    throw badRequest('submission is outside your org unit scope');
  }

  const prior = await db
    .select()
    .from(approval)
    .where(eq(approval.submissionId, submissionId));
  const level = prior.filter((a) => a.status === 'approved').length + 1;

  await db.insert(approval).values({
    id: uuidv7(),
    submissionId,
    level,
    actor: who.id,
    status,
    comment,
  });

  let submissionStatus: 'completed' | 'approved' | 'rejected' = 'completed';
  if (status === 'rejected') {
    submissionStatus = 'rejected';
  } else if (level >= row.approvalLevels) {
    submissionStatus = 'approved';
  }
  if (submissionStatus !== 'completed') {
    await db
      .update(submission)
      .set({ status: submissionStatus })
      .where(eq(submission.id, submissionId));
    void fireWebhooks(db, `submission.${submissionStatus}`, {
      submissionId,
      dataset: row.datasetName,
      orgUnit: row.orgUnitName,
      period: row.sub.period,
      level,
      actor: who.username,
      comment,
    });
  }
  return { submissionStatus, level };
}

export async function history(db: Db, submissionId: string) {
  const rows = await db
    .select()
    .from(approval)
    .where(eq(approval.submissionId, submissionId))
    .orderBy(asc(approval.ts));
  return rows;
}
