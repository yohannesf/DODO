// Configurable RAG (spec §16.4, ADR 005). resolveRagConfig walks the lookup
// chain; recalculateRag computes rag_log from targets vs achieved (reusing the
// analytics engine so RAG and analytics never diverge).
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { uuidv7, type AuthUser, type RagStatus } from '@dodo/shared';
import type { Db } from '../db/index.js';
import { indicator, ragConfig, ragLog, target } from '../db/schema.js';
import { runAnalytics } from './analytics.js';

export interface EffectiveRagConfig {
  configId: string | null;
  greenThreshold: number;
  yellowThreshold: number;
  calcBasis: string;
  formula: string | null;
}

const SYSTEM_DEFAULT: EffectiveRagConfig = {
  configId: null,
  greenThreshold: 80,
  yellowThreshold: 50,
  calcBasis: 'pct_of_target',
  formula: null,
};

/**
 * Resolve the effective RAG config for an indicator at a scope. First live
 * match wins, most specific to least: category_option → indicator → framework
 * → program → system default. The framework rung never matches in Phase 1
 * (frameworks arrive in Phase 2). scopeId is the org unit or category option.
 */
export async function resolveRagConfig(
  db: Db,
  indicatorId: string,
  scopeId?: string | null,
): Promise<EffectiveRagConfig> {
  const [ind] = await db
    .select()
    .from(indicator)
    .where(and(eq(indicator.id, indicatorId), isNull(indicator.deletedAt)));
  if (!ind) return SYSTEM_DEFAULT;

  // scopeIds are uuids (globally unique), so no cross-program collision risk
  const configs = await db.select().from(ragConfig).where(isNull(ragConfig.deletedAt));
  const pick = (type: string, id: string | null | undefined) =>
    id ? configs.find((c) => c.scopeType === type && c.scopeId === id) : undefined;

  const chosen =
    pick('category_option', scopeId) ??
    pick('indicator', indicatorId) ??
    // framework rung: pick('framework', <indicator's framework>) — Phase 2
    pick('program', ind.programId) ??
    null;

  if (!chosen) return SYSTEM_DEFAULT;
  return {
    configId: chosen.id,
    greenThreshold: chosen.greenThreshold,
    yellowThreshold: chosen.yellowThreshold,
    calcBasis: chosen.calcBasis,
    formula: chosen.formula,
  };
}

function classify(
  cfg: EffectiveRagConfig,
  achieved: number | null,
  pct: number | null,
): RagStatus {
  // 'absolute' compares the achieved value to the thresholds directly; every
  // other basis (incl. the deferred 'formula') uses percent of target.
  const v = cfg.calcBasis === 'absolute' ? (achieved ?? 0) : (pct ?? 0);
  if (v >= cfg.greenThreshold) return 'green';
  if (v >= cfg.yellowThreshold) return 'yellow';
  return 'red';
}

export interface RagLogRow {
  id: string;
  indicatorId: string;
  targetId: string | null;
  dataValueId: string | null;
  scopeId: string | null;
  period: string;
  achieved: number | null;
  targetVal: number | null;
  pct: number | null;
  status: RagStatus;
  configId: string | null;
}

/**
 * Recompute rag_log for the targets in scope. Idempotent: clears the rag_log
 * rows for the recomputed (indicator, period) set before inserting fresh ones.
 */
export async function recalculateRag(
  db: Db,
  user: AuthUser,
  opts: { indicatorId?: string; programId?: string } = {},
): Promise<RagLogRow[]> {
  let targets = await db
    .select()
    .from(target)
    .where(and(eq(target.kind, 'target'), isNull(target.deletedAt)));

  if (opts.indicatorId) {
    targets = targets.filter((t) => t.indicatorId === opts.indicatorId);
  }
  if (opts.programId) {
    const inds = await db
      .select({ id: indicator.id })
      .from(indicator)
      .where(and(eq(indicator.programId, opts.programId), isNull(indicator.deletedAt)));
    const ids = new Set(inds.map((i) => i.id));
    targets = targets.filter((t) => ids.has(t.indicatorId));
  }
  if (targets.length === 0) return [];

  const indIds = [...new Set(targets.map((t) => t.indicatorId))];
  const periods = [...new Set(targets.map((t) => t.period))];
  await db
    .delete(ragLog)
    .where(and(inArray(ragLog.indicatorId, indIds), inArray(ragLog.period, periods)));

  const out: RagLogRow[] = [];
  for (const t of targets) {
    const result = await runAnalytics(db, user, {
      dx: [t.indicatorId],
      ou: [t.orgUnitId],
      pe: [t.period],
      ouMode: 'subtree',
      peTotal: false,
    });
    const achieved = result.rows[0]?.value ?? null;
    const cfg = await resolveRagConfig(db, t.indicatorId, t.orgUnitId);
    const targetVal = t.value;
    const pct = achieved !== null && targetVal ? (achieved / targetVal) * 100 : null;
    const row: RagLogRow = {
      id: uuidv7(),
      indicatorId: t.indicatorId,
      targetId: t.id,
      dataValueId: null,
      scopeId: t.orgUnitId,
      period: t.period,
      achieved,
      targetVal,
      pct,
      status: classify(cfg, achieved, pct),
      configId: cfg.configId,
    };
    await db.insert(ragLog).values(row);
    out.push(row);
  }
  return out;
}

export async function getRagLog(
  db: Db,
  filter: {
    indicatorId?: string;
    period?: string;
    orgUnitId?: string;
    programId?: string;
  },
): Promise<(typeof ragLog.$inferSelect)[]> {
  const conds = [];
  if (filter.indicatorId) conds.push(eq(ragLog.indicatorId, filter.indicatorId));
  if (filter.period) conds.push(eq(ragLog.period, filter.period));
  if (filter.orgUnitId) conds.push(eq(ragLog.scopeId, filter.orgUnitId));
  // scope to a program (e.g. an API key scoped to one program) by restricting
  // to that program's indicators
  if (filter.programId) {
    const inds = await db
      .select({ id: indicator.id })
      .from(indicator)
      .where(and(eq(indicator.programId, filter.programId), isNull(indicator.deletedAt)));
    if (inds.length === 0) return [];
    conds.push(
      inArray(
        ragLog.indicatorId,
        inds.map((i) => i.id),
      ),
    );
  }
  return conds.length
    ? db
        .select()
        .from(ragLog)
        .where(and(...conds))
    : db.select().from(ragLog);
}
