// Metadata bundle export/import (spec §8.5): one versioned metadata.json for
// sharing configurations between instances. Import upserts by id and
// re-materialises COCs; data values are never part of a bundle.
import { asc, eq, isNull, sql } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import {
  DEFAULT_CATEGORY_COMBO_ID,
  METADATA_BUNDLE_VERSION,
  metadataBundleSchema,
  type MetadataBundle,
} from '@dodo/shared';
import type { Db } from '../../db/index.js';
import {
  category,
  categoryOption,
  dataElement,
  optionSet,
  option,
  indicator,
  orgUnitLevel,
  program,
  resultsFramework,
  role,
  target,
  validationRule,
} from '../../db/schema.js';
import type { MetaTable } from './crud.js';
import { listOrgUnits, createOrgUnit, updateOrgUnit } from './org-units.js';
import {
  createCategoryCombo,
  listCategoryCombos,
  updateCategoryCombo,
} from './category-combos.js';
import { listDatasets, createDataset, updateDataset } from './datasets.js';
import { createRfNode, listRfNodes, updateRfNode } from './rf-nodes.js';
import { createDashboard, listDashboards, updateDashboard } from './dashboards.js';

export async function exportBundle(db: Db): Promise<MetadataBundle> {
  const [
    programs,
    orgUnitLevels,
    orgUnits,
    categories,
    categoryOptions,
    categoryCombos,
    optionSets,
    options,
    dataElements,
    datasets,
    roles,
    validationRules,
    indicators,
    resultsFrameworks,
    rfNodes,
    targets,
    dashboards,
  ] = await Promise.all([
    db.select().from(program).where(isNull(program.deletedAt)),
    db
      .select()
      .from(orgUnitLevel)
      .where(isNull(orgUnitLevel.deletedAt))
      .orderBy(asc(orgUnitLevel.level)),
    listOrgUnits(db),
    db.select().from(category).where(isNull(category.deletedAt)),
    db
      .select()
      .from(categoryOption)
      .where(isNull(categoryOption.deletedAt))
      .orderBy(asc(categoryOption.sortOrder)),
    listCategoryCombos(db),
    db.select().from(optionSet).where(isNull(optionSet.deletedAt)),
    db
      .select()
      .from(option)
      .where(isNull(option.deletedAt))
      .orderBy(asc(option.sortOrder)),
    db.select().from(dataElement).where(isNull(dataElement.deletedAt)),
    listDatasets(db),
    db.select().from(role).where(isNull(role.deletedAt)),
    db.select().from(validationRule).where(isNull(validationRule.deletedAt)),
    db.select().from(indicator).where(isNull(indicator.deletedAt)),
    db.select().from(resultsFramework).where(isNull(resultsFramework.deletedAt)),
    listRfNodes(db),
    db.select().from(target).where(isNull(target.deletedAt)),
    listDashboards(db),
  ]);

  return metadataBundleSchema.parse({
    bundleVersion: METADATA_BUNDLE_VERSION,
    exportedAt: new Date().toISOString(),
    programs,
    orgUnitLevels,
    orgUnits,
    categories,
    categoryOptions,
    // the reserved default combo is seeded identically on every instance
    categoryCombos: categoryCombos.filter((c) => c.id !== DEFAULT_CATEGORY_COMBO_ID),
    optionSets,
    options,
    dataElements,
    datasets,
    roles,
    validationRules,
    indicators,
    resultsFrameworks,
    rfNodes,
    targets,
    dashboards,
  });
}

export interface BundleImportReport {
  created: Record<string, number>;
  updated: Record<string, number>;
}

export async function importBundle(
  db: Db,
  bundle: MetadataBundle,
): Promise<BundleImportReport> {
  const created: Record<string, number> = {};
  const updated: Record<string, number> = {};
  const count = (bag: Record<string, number>, key: string) => {
    bag[key] = (bag[key] ?? 0) + 1;
  };

  await db.transaction(async (txRaw) => {
    const tx = txRaw as unknown as Db;

    // upsert helper for flat entities — strips meta fields the target owns
    async function upsert<T extends { id: string }>(
      table: MetaTable,
      kind: string,
      rows: T[],
      fields: (row: T) => Record<string, unknown>,
    ) {
      for (const row of rows) {
        const existing = await tx
          .select({ id: table.id })
          .from(table as PgTable)
          .where(eq(table.id, row.id));
        if (existing.length > 0) {
          await tx
            .update(table)
            .set({
              ...fields(row),
              updatedAt: sql`now()`,
              version: sql`version + 1`,
              deletedAt: null,
            } as never)
            .where(eq(table.id, row.id));
          count(updated, kind);
        } else {
          await tx.insert(table).values({ ...fields(row), id: row.id } as never);
          count(created, kind);
        }
      }
    }

    await upsert(program, 'programs', bundle.programs, (r) => ({
      name: r.name,
      code: r.code,
      description: r.description,
      active: r.active,
    }));
    await upsert(orgUnitLevel, 'orgUnitLevels', bundle.orgUnitLevels, (r) => ({
      level: r.level,
      name: r.name,
    }));

    // org units: parents before children (bundle paths are instance-local)
    const byDepth = [...bundle.orgUnits].sort(
      (a, b) => a.path.split('.').length - b.path.split('.').length,
    );
    const existingOrgUnits = new Set((await listOrgUnits(tx)).map((o) => o.id));
    for (const ou of byDepth) {
      const input = {
        name: ou.name,
        shortName: ou.shortName,
        code: ou.code,
        parentId: ou.parentId,
        openingDate: ou.openingDate,
        closedDate: ou.closedDate,
        geometry: ou.geometry,
        attributes: ou.attributes,
      };
      if (existingOrgUnits.has(ou.id)) {
        await updateOrgUnit(tx, ou.id, input);
        count(updated, 'orgUnits');
      } else {
        await createOrgUnit(tx, input, undefined, ou.id);
        count(created, 'orgUnits');
      }
    }

    await upsert(category, 'categories', bundle.categories, (r) => ({
      name: r.name,
      code: r.code,
      dataDimension: r.dataDimension,
    }));
    await upsert(categoryOption, 'categoryOptions', bundle.categoryOptions, (r) => ({
      categoryId: r.categoryId,
      name: r.name,
      code: r.code,
      sortOrder: r.sortOrder,
    }));

    const existingCombos = new Set((await listCategoryCombos(tx)).map((c) => c.id));
    for (const combo of bundle.categoryCombos) {
      const input = {
        name: combo.name,
        code: combo.code,
        categoryIds: combo.categoryIds,
      };
      if (existingCombos.has(combo.id)) {
        await updateCategoryCombo(tx, combo.id, input);
        count(updated, 'categoryCombos');
      } else {
        await createCategoryCombo(tx, input, undefined, combo.id);
        count(created, 'categoryCombos');
      }
    }

    await upsert(optionSet, 'optionSets', bundle.optionSets, (r) => ({
      name: r.name,
      code: r.code,
    }));
    await upsert(option, 'options', bundle.options, (r) => ({
      optionSetId: r.optionSetId,
      name: r.name,
      code: r.code,
      sortOrder: r.sortOrder,
    }));
    await upsert(dataElement, 'dataElements', bundle.dataElements, (r) => ({
      name: r.name,
      shortName: r.shortName,
      code: r.code,
      description: r.description,
      valueType: r.valueType,
      categoryComboId: r.categoryComboId,
      unitOfMeasure: r.unitOfMeasure,
      aggregationOp: r.aggregationOp,
      optionSetId: r.optionSetId,
    }));
    await upsert(role, 'roles', bundle.roles, (r) => ({
      name: r.name,
      code: r.code,
      permissions: r.permissions,
    }));
    await upsert(validationRule, 'validationRules', bundle.validationRules, (r) => ({
      name: r.name,
      code: r.code,
      leftExpr: r.leftExpr,
      op: r.op,
      rightExpr: r.rightExpr,
      severity: r.severity,
      instruction: r.instruction,
      datasetIds: r.datasetIds,
    }));

    await upsert(indicator, 'indicators', bundle.indicators, (r) => ({
      name: r.name,
      code: r.code,
      description: r.description,
      numeratorExpr: r.numeratorExpr,
      denominatorExpr: r.denominatorExpr,
      factor: r.factor,
      decimals: r.decimals,
      indicatorType: r.indicatorType,
      annualized: r.annualized,
      programId: r.programId,
    }));
    await upsert(
      resultsFramework,
      'resultsFrameworks',
      bundle.resultsFrameworks,
      (r) => ({
        name: r.name,
        code: r.code,
        programId: r.programId,
      }),
    );
    const existingNodes = new Set((await listRfNodes(tx)).map((n) => n.id));
    const nodesOrdered = [...bundle.rfNodes].sort(
      (a, b) => Number(a.parentId !== null) - Number(b.parentId !== null),
    );
    for (const node of nodesOrdered) {
      const input = {
        frameworkId: node.frameworkId,
        parentId: node.parentId,
        kind: node.kind,
        title: node.title,
        description: node.description,
        sortOrder: node.sortOrder,
        indicatorIds: node.indicatorIds,
      };
      if (existingNodes.has(node.id)) {
        await updateRfNode(tx, node.id, input);
        count(updated, 'rfNodes');
      } else {
        await createRfNode(tx, input, undefined, node.id);
        count(created, 'rfNodes');
      }
    }
    await upsert(target, 'targets', bundle.targets, (r) => ({
      indicatorId: r.indicatorId,
      orgUnitId: r.orgUnitId,
      period: r.period,
      value: r.value,
      kind: r.kind,
    }));

    const existingDashboards = new Set((await listDashboards(tx)).map((d) => d.id));
    for (const dash of bundle.dashboards) {
      const input = {
        name: dash.name,
        code: dash.code,
        shared: dash.shared,
        items: dash.items,
      };
      if (existingDashboards.has(dash.id)) {
        await updateDashboard(tx, dash.id, input);
        count(updated, 'dashboards');
      } else {
        await createDashboard(tx, input, undefined, dash.id);
        count(created, 'dashboards');
      }
    }

    const existingDatasets = new Set((await listDatasets(tx)).map((d) => d.id));
    for (const ds of bundle.datasets) {
      const {
        id,
        version: _v,
        createdAt: _c,
        updatedAt: _u,
        deletedAt: _d,
        ...input
      } = ds;
      if (existingDatasets.has(id)) {
        await updateDataset(tx, id, input);
        count(updated, 'datasets');
      } else {
        await createDataset(tx, input, undefined, id);
        count(created, 'datasets');
      }
    }
  });

  return { created, updated };
}
