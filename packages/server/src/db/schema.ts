// Drizzle schema — metadata tables (spec §4.1, M1 scope + program per ADR 001).
// Conventions (spec §4): every table gets id (UUIDv7, generated in services),
// created/updated audit columns; metadata tables add `version` (bumped on every
// write) and `deleted_at` (soft delete → sync tombstone). Codes are mandatory
// and unique per entity among live rows (partial unique index).
import { sql } from 'drizzle-orm';
import {
  boolean,
  customType,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
// Enum literals are duplicated from @dodo/shared because drizzle-kit loads
// this file with a CJS loader that cannot import the ESM-only shared package.
// schema.test.ts asserts they stay identical to the shared definitions.
const VALUE_TYPES = [
  'INTEGER',
  'INTEGER_POSITIVE',
  'INTEGER_ZERO_OR_POSITIVE',
  'NUMBER',
  'PERCENTAGE',
  'BOOLEAN',
  'TEXT',
  'LONG_TEXT',
  'DATE',
  'OPTION',
  'COORDINATE',
  'FILE',
] as const;
const AGGREGATION_OPS = ['sum', 'avg', 'count', 'min', 'max', 'last'] as const;
const FREQUENCIES = ['DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY'] as const;
const ORG_UNIT_SCOPES = ['data_entry', 'data_view'] as const;

const ltree = customType<{ data: string }>({ dataType: () => 'ltree' });
// GeoJSON in/out is handled with ST_GeomFromGeoJSON / ST_AsGeoJSON in services.
const geometry = customType<{ data: unknown }>({
  dataType: () => 'geometry(Geometry,4326)',
});

export const valueTypeEnum = pgEnum('value_type', VALUE_TYPES);
export const aggregationOpEnum = pgEnum('aggregation_op', AGGREGATION_OPS);
export const frequencyEnum = pgEnum('frequency', FREQUENCIES);
export const orgUnitScopeEnum = pgEnum('org_unit_scope', ORG_UNIT_SCOPES);

const ts = { withTimezone: true, mode: 'string' } as const;

const metaColumns = {
  id: uuid('id').primaryKey(),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at', ts).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', ts).notNull().defaultNow(),
  createdBy: uuid('created_by'),
  updatedBy: uuid('updated_by'),
  deletedAt: timestamp('deleted_at', ts),
};

export const program = pgTable(
  'program',
  {
    ...metaColumns,
    name: text('name').notNull(),
    code: text('code').notNull(),
    description: text('description').notNull().default(''),
    active: boolean('active').notNull().default(true),
  },
  (t) => [
    uniqueIndex('program_code_live')
      .on(t.code)
      .where(sql`deleted_at is null`),
  ],
);

export const orgUnitLevel = pgTable(
  'org_unit_level',
  {
    ...metaColumns,
    level: integer('level').notNull(),
    name: text('name').notNull(),
  },
  (t) => [
    uniqueIndex('org_unit_level_live')
      .on(t.level)
      .where(sql`deleted_at is null`),
  ],
);

export const orgUnit = pgTable(
  'org_unit',
  {
    ...metaColumns,
    parentId: uuid('parent_id'),
    name: text('name').notNull(),
    shortName: text('short_name').notNull(),
    code: text('code').notNull(),
    level: integer('level').notNull(),
    path: ltree('path').notNull(),
    openingDate: date('opening_date'),
    closedDate: date('closed_date'),
    geometry: geometry('geometry'),
    attributes: jsonb('attributes').notNull().default({}),
  },
  (t) => [
    uniqueIndex('org_unit_code_live')
      .on(t.code)
      .where(sql`deleted_at is null`),
    index('org_unit_parent').on(t.parentId),
    index('org_unit_path_gist').using('gist', t.path),
    index('org_unit_geometry_gist').using('gist', t.geometry),
  ],
);

export const category = pgTable(
  'category',
  {
    ...metaColumns,
    name: text('name').notNull(),
    code: text('code').notNull(),
    dataDimension: boolean('data_dimension').notNull().default(true),
  },
  (t) => [
    uniqueIndex('category_code_live')
      .on(t.code)
      .where(sql`deleted_at is null`),
  ],
);

export const categoryOption = pgTable(
  'category_option',
  {
    ...metaColumns,
    categoryId: uuid('category_id')
      .notNull()
      .references(() => category.id),
    name: text('name').notNull(),
    code: text('code').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => [
    uniqueIndex('category_option_code_live')
      .on(t.code)
      .where(sql`deleted_at is null`),
    index('category_option_category').on(t.categoryId),
  ],
);

export const categoryCombo = pgTable(
  'category_combo',
  {
    ...metaColumns,
    name: text('name').notNull(),
    code: text('code').notNull(),
  },
  (t) => [
    uniqueIndex('category_combo_code_live')
      .on(t.code)
      .where(sql`deleted_at is null`),
  ],
);

export const categoryComboCategories = pgTable(
  'category_combo_categories',
  {
    comboId: uuid('combo_id')
      .notNull()
      .references(() => categoryCombo.id),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => category.id),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.comboId, t.categoryId] })],
);

export const categoryOptionCombo = pgTable(
  'category_option_combo',
  {
    id: uuid('id').primaryKey(),
    comboId: uuid('combo_id')
      .notNull()
      .references(() => categoryCombo.id),
    name: text('name').notNull(),
    optionIds: uuid('option_ids').array().notNull(),
  },
  (t) => [index('coc_combo').on(t.comboId)],
);

export const optionSet = pgTable(
  'option_set',
  {
    ...metaColumns,
    name: text('name').notNull(),
    code: text('code').notNull(),
  },
  (t) => [
    uniqueIndex('option_set_code_live')
      .on(t.code)
      .where(sql`deleted_at is null`),
  ],
);

export const option = pgTable(
  'option',
  {
    ...metaColumns,
    optionSetId: uuid('option_set_id')
      .notNull()
      .references(() => optionSet.id),
    name: text('name').notNull(),
    code: text('code').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => [
    index('option_set_idx').on(t.optionSetId),
    uniqueIndex('option_code_live')
      .on(t.optionSetId, t.code)
      .where(sql`deleted_at is null`),
  ],
);

export const dataElement = pgTable(
  'data_element',
  {
    ...metaColumns,
    name: text('name').notNull(),
    shortName: text('short_name').notNull(),
    code: text('code').notNull(),
    description: text('description').notNull().default(''),
    valueType: valueTypeEnum('value_type').notNull(),
    categoryComboId: uuid('category_combo_id').references(() => categoryCombo.id),
    unitOfMeasure: text('unit_of_measure').notNull().default(''),
    aggregationOp: aggregationOpEnum('aggregation_op').notNull().default('sum'),
    optionSetId: uuid('option_set_id').references(() => optionSet.id),
  },
  (t) => [
    uniqueIndex('data_element_code_live')
      .on(t.code)
      .where(sql`deleted_at is null`),
  ],
);

export const dataset = pgTable(
  'dataset',
  {
    ...metaColumns,
    name: text('name').notNull(),
    code: text('code').notNull(),
    description: text('description').notNull().default(''),
    frequency: frequencyEnum('frequency').notNull(),
    openFuturePeriods: integer('open_future_periods').notNull().default(0),
    expiryDays: integer('expiry_days').notNull().default(0),
    requiresApproval: boolean('requires_approval').notNull().default(false),
    programId: uuid('program_id').references(() => program.id),
    entryLayout: jsonb('entry_layout').notNull().default({}),
  },
  (t) => [
    uniqueIndex('dataset_code_live')
      .on(t.code)
      .where(sql`deleted_at is null`),
  ],
);

export const datasetElements = pgTable(
  'dataset_elements',
  {
    datasetId: uuid('dataset_id')
      .notNull()
      .references(() => dataset.id),
    dataElementId: uuid('data_element_id')
      .notNull()
      .references(() => dataElement.id),
    sortOrder: integer('sort_order').notNull().default(0),
    section: text('section').notNull().default(''),
    required: boolean('required').notNull().default(false),
  },
  (t) => [primaryKey({ columns: [t.datasetId, t.dataElementId] })],
);

export const datasetOrgUnits = pgTable(
  'dataset_org_units',
  {
    datasetId: uuid('dataset_id')
      .notNull()
      .references(() => dataset.id),
    orgUnitId: uuid('org_unit_id')
      .notNull()
      .references(() => orgUnit.id),
  },
  (t) => [primaryKey({ columns: [t.datasetId, t.orgUnitId] })],
);

export const user = pgTable(
  'user',
  {
    ...metaColumns,
    username: text('username').notNull(),
    email: text('email'),
    passwordHash: text('password_hash'),
    displayName: text('display_name').notNull(),
    locale: text('locale').notNull().default('en'),
    disabled: boolean('disabled').notNull().default(false),
  },
  (t) => [
    uniqueIndex('user_username_live')
      .on(t.username)
      .where(sql`deleted_at is null`),
  ],
);

export const role = pgTable(
  'role',
  {
    ...metaColumns,
    name: text('name').notNull(),
    code: text('code').notNull(),
    permissions: text('permissions').array().notNull().default([]),
  },
  (t) => [
    uniqueIndex('role_code_live')
      .on(t.code)
      .where(sql`deleted_at is null`),
  ],
);

export const userRole = pgTable(
  'user_role',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id),
    roleId: uuid('role_id')
      .notNull()
      .references(() => role.id),
  },
  (t) => [primaryKey({ columns: [t.userId, t.roleId] })],
);

export const userOrgUnits = pgTable(
  'user_org_units',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id),
    orgUnitId: uuid('org_unit_id')
      .notNull()
      .references(() => orgUnit.id),
    scope: orgUnitScopeEnum('scope').notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.orgUnitId, t.scope] })],
);
