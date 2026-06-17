// One-time data migration: v0.1.0 results_framework/rf_node → the configurable
// framework model (spec §16.9, ADR 007). Run manually via `pnpm migrate:rf`.
// NOT part of the auto-applied drizzle chain. Idempotent (skips if already run).
import { eq, isNull, sql } from 'drizzle-orm';
import { uuidv7 } from '@dodo/shared';
import { loadConfig } from '../config.js';
import { createDb, createPool, type Db } from '../db/index.js';
import {
  framework,
  frameworkLevel,
  frameworkNode,
  indicatorFrameworkMapping,
  resultsFramework,
  rfNode,
  rfNodeIndicators,
} from '../db/schema.js';

const KIND_ORDER: Record<string, number> = {
  goal: 1,
  outcome: 2,
  output: 3,
  activity: 4,
};
const KIND_NAME: Record<string, string> = {
  goal: 'Goal',
  outcome: 'Outcome',
  output: 'Output',
  activity: 'Activity',
};

export interface RfMigrationResult {
  alreadyMigrated: boolean;
  frameworks: number;
  levels: number;
  nodes: number;
  mappings: number;
  rfNodeIndicators: number;
}

export async function migrateRfToFramework(db: Db): Promise<RfMigrationResult> {
  // idempotency guard: once renamed, results_framework no longer resolves
  const probe = await db.execute(
    sql`select to_regclass('public.results_framework') as t`,
  );
  if (!probe.rows[0]?.t) {
    return {
      alreadyMigrated: true,
      frameworks: 0,
      levels: 0,
      nodes: 0,
      mappings: 0,
      rfNodeIndicators: 0,
    };
  }

  const rfs = await db
    .select()
    .from(resultsFramework)
    .where(isNull(resultsFramework.deletedAt));
  const nodes = await db.select().from(rfNode).where(isNull(rfNode.deletedAt));
  const links = await db.select().from(rfNodeIndicators);

  const fwIdByRf = new Map<string, string>();
  const levelIdByFwKind = new Map<string, string>();
  let levelCount = 0;

  // 1. results_framework → framework; 2. distinct kinds → framework_level
  for (const rf of rfs) {
    const fwId = uuidv7();
    fwIdByRf.set(rf.id, fwId);
    await db.insert(framework).values({
      id: fwId,
      programId: rf.programId!,
      name: rf.name,
      isInternal: true,
    });
    const kinds = [
      ...new Set(nodes.filter((n) => n.frameworkId === rf.id).map((n) => n.kind)),
    ].sort((a, b) => (KIND_ORDER[a] ?? 99) - (KIND_ORDER[b] ?? 99));
    for (const kind of kinds) {
      const levelId = uuidv7();
      await db.insert(frameworkLevel).values({
        id: levelId,
        frameworkId: fwId,
        name: KIND_NAME[kind] ?? kind,
        levelOrder: KIND_ORDER[kind] ?? 99,
      });
      levelIdByFwKind.set(`${fwId}:${kind}`, levelId);
      levelCount++;
    }
  }

  // 3. rf_node → framework_node (parent set in a second pass)
  const fwNodeIdByRfNode = new Map<string, string>();
  for (const n of nodes) {
    const fwId = fwIdByRf.get(n.frameworkId);
    if (!fwId) continue;
    const levelId = levelIdByFwKind.get(`${fwId}:${n.kind}`);
    if (!levelId) continue;
    const fwNodeId = uuidv7();
    fwNodeIdByRfNode.set(n.id, fwNodeId);
    await db.insert(frameworkNode).values({
      id: fwNodeId,
      frameworkId: fwId,
      levelId,
      parentId: null,
      title: n.title,
      description: n.description,
      sortOrder: n.sortOrder,
    });
  }
  for (const n of nodes) {
    if (!n.parentId) continue;
    const child = fwNodeIdByRfNode.get(n.id);
    const parent = fwNodeIdByRfNode.get(n.parentId);
    if (child && parent) {
      await db
        .update(frameworkNode)
        .set({ parentId: parent })
        .where(eq(frameworkNode.id, child));
    }
  }

  // 4. rf_node_indicators → indicator_framework_mapping
  let mappings = 0;
  for (const link of links) {
    const nodeId = fwNodeIdByRfNode.get(link.nodeId);
    if (!nodeId) continue;
    await db
      .insert(indicatorFrameworkMapping)
      .values({
        id: uuidv7(),
        indicatorId: link.indicatorId,
        nodeId,
        isPrimary: true,
      })
      .onConflictDoNothing();
    mappings++;
  }

  // 5. verify counts
  if (mappings !== links.length) {
    throw new Error(
      `rf migration count mismatch: ${links.length} rf_node_indicators vs ${mappings} mappings`,
    );
  }

  // 6. rename old tables (kept one release; dropped in v0.3.0)
  await db.execute(
    sql`ALTER TABLE IF EXISTS "results_framework" RENAME TO "_deprecated_results_framework"`,
  );
  await db.execute(sql`ALTER TABLE IF EXISTS "rf_node" RENAME TO "_deprecated_rf_node"`);
  await db.execute(
    sql`ALTER TABLE IF EXISTS "rf_node_indicators" RENAME TO "_deprecated_rf_node_indicators"`,
  );

  return {
    alreadyMigrated: false,
    frameworks: rfs.length,
    levels: levelCount,
    nodes: fwNodeIdByRfNode.size,
    mappings,
    rfNodeIndicators: links.length,
  };
}

// `pnpm migrate:rf`
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  const config = loadConfig();
  const pool = createPool(config.DATABASE_URL);
  migrateRfToFramework(createDb(pool))
    .then((r) => {
      console.log('rf → framework migration:', JSON.stringify(r));
      return pool.end();
    })
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
