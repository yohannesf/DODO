// /api/metadata — route → zod validate → service → drizzle (CLAUDE.md).
import type { FastifyInstance } from 'fastify';
import { z, type ZodTypeAny } from 'zod';
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
  roleInputSchema,
  userInputSchema,
} from '@dodo/shared';
import type { Db } from '../db/index.js';
import {
  category,
  categoryOption,
  option,
  optionSet,
  orgUnitLevel,
  program,
  role,
  dataElement,
} from '../db/schema.js';
import { dataElementInputSchema } from '@dodo/shared';
import { makeCrud, type MetaTable } from '../services/metadata/crud.js';
import * as orgUnits from '../services/metadata/org-units.js';
import * as combos from '../services/metadata/category-combos.js';
import * as datasets from '../services/metadata/datasets.js';
import * as users from '../services/metadata/users.js';
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
