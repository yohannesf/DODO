// /api/metadata — route → zod validate → service → drizzle (CLAUDE.md).
import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { z, type ZodTypeAny } from 'zod';
import { parseExpression, uuidv7 } from '@dodo/shared';
import {
  categoryInputSchema,
  categoryOptionInputSchema,
  categoryComboInputSchema,
  datasetInputSchema,
  featureCollectionSchema,
  metadataBundleSchema,
  optionInputSchema,
  optionSetInputSchema,
  orgUnitInputSchema,
  orgUnitLevelInputSchema,
  programInputSchema,
  programFieldDefInputSchema,
  programFieldValueInputSchema,
  evidenceRequirementInputSchema,
  ragConfigInputSchema,
  frameworkInputSchema,
  frameworkLevelInputSchema,
  frameworkNodeInputSchema,
  indicatorFrameworkMappingInputSchema,
  frameworkDisaggFilterInputSchema,
  dashboardInputSchema,
  indicatorInputSchema,
  resultsFrameworkInputSchema,
  rfNodeInputSchema,
  roleInputSchema,
  targetInputSchema,
  userInputSchema,
  validationRuleInputSchema,
  webhookInputSchema,
} from '@dodo/shared';
import type { Db } from '../db/index.js';
import {
  category,
  categoryOption,
  option,
  optionSet,
  orgUnitLevel,
  program,
  programFieldDef,
  programFieldValue,
  evidenceRequirement,
  ragConfig,
  framework,
  frameworkLevel,
  frameworkNode,
  indicatorFrameworkMapping,
  frameworkDisaggFilter,
  role,
  dataElement,
  indicator,
  resultsFramework,
  target,
  validationRule,
  webhook,
} from '../db/schema.js';
import { dataElementInputSchema } from '@dodo/shared';
import { makeCrud, type MetaTable } from '../services/metadata/crud.js';
import * as orgUnits from '../services/metadata/org-units.js';
import * as combos from '../services/metadata/category-combos.js';
import * as datasets from '../services/metadata/datasets.js';
import * as users from '../services/metadata/users.js';
import * as rfNodes from '../services/metadata/rf-nodes.js';
import * as dashboards from '../services/metadata/dashboards.js';
import { exportBundle, importBundle } from '../services/metadata/bundle.js';

const idParam = z.object({ id: z.string().uuid() });

interface CrudHandlers {
  list: (db: Db) => Promise<unknown>;
  get: (db: Db, id: string) => Promise<unknown>;
  create: (db: Db, input: never, actor?: string) => Promise<unknown>;
  update: (db: Db, id: string, patch: never, actor?: string) => Promise<unknown>;
  softDelete?: (db: Db, id: string, actor?: string) => Promise<void>;
  delete?: (db: Db, id: string, actor?: string) => Promise<void>;
}

export function registerMetadataRoutes(app: FastifyInstance, db: Db) {
  const read = { preHandler: app.requirePermission('metadata:read') };
  const write = { preHandler: app.requirePermission('metadata:write') };

  function crudRoutes(
    prefix: string,
    inputSchema: ZodTypeAny,
    patchSchema: ZodTypeAny,
    svc: CrudHandlers,
  ) {
    app.get(`/api/metadata/${prefix}`, read, async () => svc.list(db));
    app.get(`/api/metadata/${prefix}/:id`, read, async (req) => {
      const { id } = idParam.parse(req.params);
      return svc.get(db, id);
    });
    app.post(`/api/metadata/${prefix}`, write, async (req, reply) => {
      const input = inputSchema.parse(req.body) as never;
      const row = await svc.create(db, input, req.authUser?.id);
      return reply.code(201).send(row);
    });
    app.patch(`/api/metadata/${prefix}/:id`, write, async (req) => {
      const { id } = idParam.parse(req.params);
      const patch = patchSchema.parse(req.body) as never;
      return svc.update(db, id, patch, req.authUser?.id);
    });
    app.delete(`/api/metadata/${prefix}/:id`, write, async (req, reply) => {
      const { id } = idParam.parse(req.params);
      await (svc.softDelete ?? svc.delete)!(db, id, req.authUser?.id);
      return reply.code(204).send();
    });
  }

  const simple = (table: MetaTable, entity: string) => makeCrud(table, entity);

  crudRoutes(
    'programs',
    programInputSchema,
    programInputSchema.partial(),
    simple(program, 'program'),
  );
  crudRoutes(
    'program-fields',
    programFieldDefInputSchema,
    programFieldDefInputSchema.partial(),
    simple(programFieldDef, 'program field'),
  );
  crudRoutes(
    'program-field-values',
    programFieldValueInputSchema,
    programFieldValueInputSchema.partial(),
    simple(programFieldValue, 'program field value'),
  );
  crudRoutes(
    'evidence-requirements',
    evidenceRequirementInputSchema,
    evidenceRequirementInputSchema.partial(),
    simple(evidenceRequirement, 'evidence requirement'),
  );
  crudRoutes(
    'rag-configs',
    ragConfigInputSchema,
    ragConfigInputSchema.partial(),
    simple(ragConfig, 'rag config'),
  );

  // multi-framework (spec §16.7 / §17). framework/level/node are standard
  // metadata; the mapping + disagg filter are append-only (GET/POST/DELETE).
  crudRoutes(
    'frameworks',
    frameworkInputSchema,
    frameworkInputSchema.partial(),
    simple(framework, 'framework'),
  );
  crudRoutes(
    'framework-levels',
    frameworkLevelInputSchema,
    frameworkLevelInputSchema.partial(),
    simple(frameworkLevel, 'framework level'),
  );
  crudRoutes(
    'framework-nodes',
    frameworkNodeInputSchema,
    frameworkNodeInputSchema.partial(),
    simple(frameworkNode, 'framework node'),
  );

  app.get('/api/metadata/indicator-framework-mappings', read, async () =>
    db.select().from(indicatorFrameworkMapping),
  );
  app.post('/api/metadata/indicator-framework-mappings', write, async (req, reply) => {
    const input = indicatorFrameworkMappingInputSchema.parse(req.body);
    const [row] = await db
      .insert(indicatorFrameworkMapping)
      .values({ ...input, id: uuidv7() })
      .returning();
    return reply.code(201).send(row);
  });
  app.delete(
    '/api/metadata/indicator-framework-mappings/:id',
    write,
    async (req, reply) => {
      const { id } = idParam.parse(req.params);
      await db
        .delete(indicatorFrameworkMapping)
        .where(eq(indicatorFrameworkMapping.id, id));
      return reply.code(204).send();
    },
  );

  app.get('/api/metadata/framework-disagg-filters', read, async () =>
    db.select().from(frameworkDisaggFilter),
  );
  app.post('/api/metadata/framework-disagg-filters', write, async (req, reply) => {
    const input = frameworkDisaggFilterInputSchema.parse(req.body);
    const [row] = await db
      .insert(frameworkDisaggFilter)
      .values({ ...input, id: uuidv7() })
      .returning();
    return reply.code(201).send(row);
  });
  app.delete('/api/metadata/framework-disagg-filters/:id', write, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    await db.delete(frameworkDisaggFilter).where(eq(frameworkDisaggFilter.id, id));
    return reply.code(204).send();
  });
  crudRoutes(
    'org-unit-levels',
    orgUnitLevelInputSchema,
    orgUnitLevelInputSchema.partial(),
    simple(orgUnitLevel, 'org unit level'),
  );
  crudRoutes(
    'categories',
    categoryInputSchema,
    categoryInputSchema.partial(),
    simple(category, 'category'),
  );
  crudRoutes('option-sets', optionSetInputSchema, optionSetInputSchema.partial(), {
    ...simple(optionSet, 'option set'),
  });
  crudRoutes(
    'options',
    optionInputSchema,
    optionInputSchema.partial(),
    simple(option, 'option'),
  );
  crudRoutes('roles', roleInputSchema, roleInputSchema.partial(), simple(role, 'role'));
  const indicatorChecked = indicatorInputSchema.superRefine((r, ctx) => {
    for (const [field, src] of [
      ['numeratorExpr', r.numeratorExpr],
      ['denominatorExpr', r.denominatorExpr],
    ] as const) {
      if (src === undefined) continue;
      try {
        parseExpression(src);
      } catch (err) {
        ctx.addIssue({
          code: 'custom',
          path: [field],
          message: err instanceof Error ? err.message : 'invalid expression',
        });
      }
    }
  });
  crudRoutes(
    'indicators',
    indicatorChecked,
    indicatorInputSchema.partial(),
    simple(indicator, 'indicator'),
  );
  crudRoutes(
    'results-frameworks',
    resultsFrameworkInputSchema,
    resultsFrameworkInputSchema.partial(),
    simple(resultsFramework, 'results framework'),
  );
  crudRoutes('rf-nodes', rfNodeInputSchema, rfNodeInputSchema.partial(), {
    list: rfNodes.listRfNodes,
    get: rfNodes.getRfNode,
    create: rfNodes.createRfNode,
    update: rfNodes.updateRfNode,
    delete: rfNodes.deleteRfNode,
  });
  crudRoutes('dashboards', dashboardInputSchema, dashboardInputSchema.partial(), {
    list: dashboards.listDashboards,
    get: dashboards.getDashboard,
    create: dashboards.createDashboard,
    update: dashboards.updateDashboard,
    delete: dashboards.deleteDashboard,
  });
  crudRoutes(
    'webhooks',
    webhookInputSchema,
    webhookInputSchema.partial(),
    simple(webhook, 'webhook'),
  );
  crudRoutes(
    'targets',
    targetInputSchema,
    targetInputSchema.partial(),
    simple(target, 'target'),
  );

  const validationRuleChecked = validationRuleInputSchema.superRefine((r, ctx) => {
    for (const [field, src] of [
      ['leftExpr', r.leftExpr],
      ['rightExpr', r.rightExpr],
    ] as const) {
      if (src === undefined) continue;
      try {
        parseExpression(src);
      } catch (err) {
        ctx.addIssue({
          code: 'custom',
          path: [field],
          message: err instanceof Error ? err.message : 'invalid expression',
        });
      }
    }
  });
  crudRoutes(
    'validation-rules',
    validationRuleChecked,
    validationRuleInputSchema.partial(),
    simple(validationRule, 'validation rule'),
  );
  crudRoutes(
    'data-elements',
    dataElementInputSchema,
    dataElementInputSchema.innerType().partial(),
    simple(dataElement, 'data element'),
  );

  // category options re-materialise affected combos on change
  const categoryOptionCrud = simple(categoryOption, 'category option');
  crudRoutes(
    'category-options',
    categoryOptionInputSchema,
    categoryOptionInputSchema.partial(),
    {
      list: (d) => categoryOptionCrud.list(d),
      get: (d, id) => categoryOptionCrud.get(d, id),
      create: async (d: Db, input: never) => {
        const row = (await categoryOptionCrud.create(d, input)) as { categoryId: string };
        await combos.rematerialiseCombosForCategory(d, row.categoryId);
        return row;
      },
      update: async (d: Db, id: string, patch: never) => {
        const row = (await categoryOptionCrud.update(d, id, patch)) as {
          categoryId: string;
        };
        await combos.rematerialiseCombosForCategory(d, row.categoryId);
        return row;
      },
      softDelete: async (d: Db, id: string) => {
        const row = (await categoryOptionCrud.get(d, id)) as { categoryId: string };
        await categoryOptionCrud.softDelete(d, id);
        await combos.rematerialiseCombosForCategory(d, row.categoryId);
      },
    },
  );

  crudRoutes('org-units', orgUnitInputSchema, orgUnitInputSchema.partial(), {
    list: orgUnits.listOrgUnits,
    get: orgUnits.getOrgUnit,
    create: orgUnits.createOrgUnit,
    update: orgUnits.updateOrgUnit,
    delete: orgUnits.deleteOrgUnit,
  });
  crudRoutes(
    'category-combos',
    categoryComboInputSchema,
    categoryComboInputSchema.partial(),
    {
      list: combos.listCategoryCombos,
      get: combos.getCategoryCombo,
      create: combos.createCategoryCombo,
      update: combos.updateCategoryCombo,
      delete: combos.deleteCategoryCombo,
    },
  );
  crudRoutes('datasets', datasetInputSchema, datasetInputSchema.partial(), {
    list: datasets.listDatasets,
    get: datasets.getDataset,
    create: datasets.createDataset,
    update: datasets.updateDataset,
    delete: datasets.deleteDataset,
  });
  crudRoutes('users', userInputSchema, userInputSchema.partial(), {
    list: users.listUsers,
    get: users.getUser,
    create: users.createUser,
    update: users.updateUser,
    delete: users.deleteUser,
  });

  app.get('/api/metadata/category-combos/:id/option-combos', read, async (req) => {
    const { id } = idParam.parse(req.params);
    return combos.listOptionCombos(db, id);
  });

  const csvImportSchema = z.object({
    csv: z.string().min(1),
    dryRun: z.boolean().default(true),
  });
  app.post('/api/metadata/org-units/import-csv', write, async (req) => {
    const { csv, dryRun } = csvImportSchema.parse(req.body);
    return orgUnits.importOrgUnitsCsv(db, csv, dryRun, req.authUser?.id);
  });

  app.post('/api/metadata/org-units/import-geojson', write, async (req) => {
    const fc = featureCollectionSchema.parse(req.body);
    return orgUnits.importOrgUnitGeoJson(db, fc, req.authUser?.id);
  });

  app.get('/api/metadata/bundle', read, async () => exportBundle(db));
  app.post('/api/metadata/bundle', write, async (req) => {
    const bundle = metadataBundleSchema.parse(req.body);
    return importBundle(db, bundle);
  });
}
