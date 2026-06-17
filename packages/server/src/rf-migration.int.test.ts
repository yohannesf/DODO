// rf_node → framework data migration (spec §16.9, ADR 007). Own container —
// the migration RENAMES the old tables, so it must not share a DB with other
// suites. rf rows are seeded directly via the db handle.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { sql } from 'drizzle-orm';
import type pg from 'pg';
import { uuidv7 } from '@dodo/shared';
import { createDb, createPool, type Db } from './db/index.js';
import { runMigrations } from './migrate.js';
import {
  frameworkNode,
  indicator,
  indicatorFrameworkMapping,
  program,
  resultsFramework,
  rfNode,
  rfNodeIndicators,
} from './db/schema.js';
import { migrateRfToFramework } from './migrations/rf-to-framework.js';

let container: StartedPostgreSqlContainer;
let pool: pg.Pool;
let db: Db;

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgis/postgis:16-3.5').start();
  const uri = container.getConnectionUri();
  await runMigrations(uri);
  pool = createPool(uri);
  db = createDb(pool);
});

afterAll(async () => {
  await pool?.end();
  await container?.stop();
});

describe('rf → framework migration (spec §16.9)', () => {
  it('copies rf data, matches counts, preserves the tree, renames old tables', async () => {
    const progId = uuidv7();
    await db.insert(program).values({ id: progId, name: 'WASH', code: 'WASH-RFM' });
    const indId = uuidv7();
    await db.insert(indicator).values({
      id: indId,
      name: 'Pct served',
      code: 'IND-RFM',
      numeratorExpr: '#{X}',
      programId: progId,
    });
    const rfId = uuidv7();
    await db.insert(resultsFramework).values({
      id: rfId,
      name: 'WASH Results',
      code: 'RF-RFM',
      programId: progId,
    });
    const goalId = uuidv7();
    const outcomeId = uuidv7();
    const outputId = uuidv7();
    await db.insert(rfNode).values([
      { id: goalId, frameworkId: rfId, parentId: null, kind: 'goal', title: 'Goal A' },
      {
        id: outcomeId,
        frameworkId: rfId,
        parentId: goalId,
        kind: 'outcome',
        title: 'Outcome A',
      },
      {
        id: outputId,
        frameworkId: rfId,
        parentId: outcomeId,
        kind: 'output',
        title: 'Output A',
      },
    ]);
    await db.insert(rfNodeIndicators).values([
      { nodeId: outcomeId, indicatorId: indId },
      { nodeId: outputId, indicatorId: indId },
    ]);

    const result = await migrateRfToFramework(db);
    expect(result.alreadyMigrated).toBe(false);
    expect(result.frameworks).toBe(1);
    expect(result.levels).toBe(3); // goal, outcome, output
    expect(result.rfNodeIndicators).toBe(2);
    expect(result.mappings).toBe(2);

    // framework_node count == rf_node count; mapping count == link count
    const fwNodes = await db.select().from(frameworkNode);
    expect(fwNodes).toHaveLength(3);
    expect(await db.select().from(indicatorFrameworkMapping)).toHaveLength(2);

    // tree preserved
    const byTitle = new Map(fwNodes.map((n) => [n.title, n]));
    expect(byTitle.get('Output A')!.parentId).toBe(byTitle.get('Outcome A')!.id);
    expect(byTitle.get('Outcome A')!.parentId).toBe(byTitle.get('Goal A')!.id);
    expect(byTitle.get('Goal A')!.parentId).toBeNull();

    // old tables renamed with _deprecated_ prefix
    const probe = await db.execute(
      sql`select to_regclass('public.results_framework') as live,
                 to_regclass('public._deprecated_rf_node') as dep`,
    );
    expect(probe.rows[0]?.live).toBeNull();
    expect(probe.rows[0]?.dep).not.toBeNull();

    // re-running is a no-op
    expect((await migrateRfToFramework(db)).alreadyMigrated).toBe(true);
  });
});
