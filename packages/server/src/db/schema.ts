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
  doublePrecision,
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
    // project-level container fields (spec §16.2); status check lives in the
    // migration: 'draft' | 'active' | 'closed' | 'suspended'.
    status: text('status').notNull().default('active'),
    currency: text('currency').notNull().default('USD'),
    fiscalYearStart: integer('fiscal_year_start').notNull().default(1),
    startDate: date('start_date'),
    endDate: date('end_date'),
    metadata: jsonb('metadata').notNull().default({}),
  },
  (t) => [
    uniqueIndex('program_code_live')
      .on(t.code)
      .where(sql`deleted_at is null`),
  ],
);

// Custom project metadata fields (spec §16.2) — replace hardcoded attributes.
export const programFieldDef = pgTable(
  'program_field_def',
  {
    ...metaColumns,
    programId: uuid('program_id')
      .notNull()
      .references(() => program.id),
    fieldName: text('field_name').notNull(),
    // text | number | date | dropdown | boolean
    fieldType: text('field_type').notNull(),
    isRequired: boolean('is_required').notNull().default(false),
    options: jsonb('options'),
    displayOrder: integer('display_order').notNull().default(0),
  },
  (t) => [index('program_field_def_program').on(t.programId)],
);

export const programFieldValue = pgTable(
  'program_field_value',
  {
    ...metaColumns,
    programId: uuid('program_id')
      .notNull()
      .references(() => program.id),
    fieldDefId: uuid('field_def_id')
      .notNull()
      .references(() => programFieldDef.id),
    value: text('value'),
  },
  (t) => [
    index('program_field_value_program').on(t.programId),
    index('program_field_value_def').on(t.fieldDefId),
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
    // self-reference for nested disaggregation trees (spec §16.1); the FK is
    // declared in the migration, like org_unit.parent_id, to avoid a circular
    // type reference in drizzle.
    parentId: uuid('parent_id'),
    name: text('name').notNull(),
    code: text('code').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => [
    uniqueIndex('category_option_code_live')
      .on(t.code)
      .where(sql`deleted_at is null`),
    index('category_option_category').on(t.categoryId),
    index('category_option_parent').on(t.parentId),
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
    approvalLevels: integer('approval_levels').notNull().default(1),
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

// --- M2: sessions, data tables (spec §4.2), sync ledger (spec §6) -----------

export const submissionStatusEnum = pgEnum('submission_status', [
  'draft',
  'completed',
  'approved',
  'rejected',
]);
export const auditActionEnum = pgEnum('audit_action', [
  'create',
  'update',
  'delete',
  'sync_conflict',
]);
export const changeOpEnum = pgEnum('change_op', ['upsert', 'delete']);

export const session = pgTable(
  'session',
  {
    // sha256 of the random session token — the raw token only lives in the cookie
    id: text('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id),
    expiresAt: timestamp('expires_at', ts).notNull(),
    createdAt: timestamp('created_at', ts).notNull().defaultNow(),
    ip: text('ip'),
    userAgent: text('user_agent'),
  },
  (t) => [index('session_user').on(t.userId)],
);

export const dataValue = pgTable(
  'data_value',
  {
    id: uuid('id').primaryKey(), // client-generated UUIDv7 (idempotency key)
    dataElementId: uuid('data_element_id')
      .notNull()
      .references(() => dataElement.id),
    orgUnitId: uuid('org_unit_id')
      .notNull()
      .references(() => orgUnit.id),
    period: text('period').notNull(),
    categoryOptionComboId: uuid('category_option_combo_id').notNull(),
    value: text('value').notNull(),
    comment: text('comment').notNull().default(''),
    submissionId: uuid('submission_id'),
    storedBy: uuid('stored_by'),
    clientTs: timestamp('client_ts', ts),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', ts).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', ts).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('data_value_cell').on(
      t.dataElementId,
      t.orgUnitId,
      t.period,
      t.categoryOptionComboId,
    ),
    index('data_value_org_unit').on(t.orgUnitId, t.period),
  ],
);

export const dataValueAudit = pgTable(
  'data_value_audit',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    dataValueId: uuid('data_value_id').notNull(),
    oldValue: text('old_value'),
    newValue: text('new_value'),
    actor: uuid('actor'),
    ts: timestamp('ts', ts).notNull().defaultNow(),
    action: auditActionEnum('action').notNull(),
  },
  (t) => [index('data_value_audit_value').on(t.dataValueId)],
);

export const submission = pgTable(
  'submission',
  {
    id: uuid('id').primaryKey(),
    datasetId: uuid('dataset_id')
      .notNull()
      .references(() => dataset.id),
    orgUnitId: uuid('org_unit_id')
      .notNull()
      .references(() => orgUnit.id),
    period: text('period').notNull(),
    status: submissionStatusEnum('status').notNull().default('draft'),
    completedBy: uuid('completed_by'),
    completedAt: timestamp('completed_at', ts),
    note: text('note').notNull().default(''),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', ts).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', ts).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('submission_key').on(t.datasetId, t.orgUnitId, t.period)],
);

// One global monotonic sequence — THE sync cursor. Triggers on all synced
// tables append here (see migration 0004).
export const syncChangeLog = pgTable(
  'sync_change_log',
  {
    serverSeq: integer('server_seq').primaryKey().generatedAlwaysAsIdentity(),
    collection: text('collection').notNull(),
    rowId: uuid('row_id').notNull(),
    op: changeOpEnum('op').notNull(),
    ts: timestamp('ts', ts).notNull().defaultNow(),
  },
  (t) => [index('sync_change_log_collection').on(t.collection, t.serverSeq)],
);

export const syncDevice = pgTable('sync_device', {
  deviceId: uuid('device_id').primaryKey(),
  userId: uuid('user_id').notNull(),
  lastSeen: timestamp('last_seen', ts).notNull().defaultNow(),
  lastPushAt: timestamp('last_push_at', ts),
  lastPullCursor: integer('last_pull_cursor'),
});

// Applied ops — replays return the original result (idempotent push, §6.1)
export const syncOp = pgTable('sync_op', {
  opId: uuid('op_id').primaryKey(),
  deviceId: uuid('device_id').notNull(),
  kind: text('kind').notNull(),
  status: text('status').notNull(),
  result: jsonb('result').notNull().default({}),
  ts: timestamp('ts', ts).notNull().defaultNow(),
});

// Push batch journal for forensics (§6.3)
export const syncPushJournal = pgTable('sync_push_journal', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  deviceId: uuid('device_id').notNull(),
  batchHash: text('batch_hash').notNull(),
  opCount: integer('op_count').notNull(),
  ts: timestamp('ts', ts).notNull().defaultNow(),
});

// --- M3: validation rules (spec §4.1) ----------------------------------------

export const validationOpEnum = pgEnum('validation_op', [
  '<',
  '<=',
  '=',
  '!=',
  '>=',
  '>',
]);
export const severityEnum = pgEnum('severity', ['warning', 'error']);

export const validationRule = pgTable(
  'validation_rule',
  {
    ...metaColumns,
    name: text('name').notNull(),
    code: text('code').notNull(),
    leftExpr: text('left_expr').notNull(),
    op: validationOpEnum('op').notNull(),
    rightExpr: text('right_expr').notNull(),
    severity: severityEnum('severity').notNull().default('warning'),
    instruction: text('instruction').notNull().default(''),
    datasetIds: uuid('datasets').array().notNull().default([]),
  },
  (t) => [
    uniqueIndex('validation_rule_code_live')
      .on(t.code)
      .where(sql`deleted_at is null`),
  ],
);

// --- M4: indicators, targets, results framework (spec §4.1) ------------------

export const indicatorTypeEnum = pgEnum('indicator_type', [
  'number',
  'percent',
  'rate',
  'per_thousand',
  'per_ten_thousand',
]);
export const targetKindEnum = pgEnum('target_kind', ['baseline', 'target']);
export const rfNodeKindEnum = pgEnum('rf_node_kind', [
  'goal',
  'outcome',
  'output',
  'activity',
]);

export const indicator = pgTable(
  'indicator',
  {
    ...metaColumns,
    name: text('name').notNull(),
    code: text('code').notNull(),
    description: text('description').notNull().default(''),
    numeratorExpr: text('numerator_expr').notNull(),
    denominatorExpr: text('denominator_expr').notNull().default('1'),
    factor: doublePrecision('factor').notNull().default(1),
    decimals: integer('decimals').notNull().default(1),
    indicatorType: indicatorTypeEnum('indicator_type').notNull().default('number'),
    annualized: boolean('annualized').notNull().default(false),
    programId: uuid('program_id').references(() => program.id),
  },
  (t) => [
    uniqueIndex('indicator_code_live')
      .on(t.code)
      .where(sql`deleted_at is null`),
  ],
);

export const resultsFramework = pgTable(
  'results_framework',
  {
    ...metaColumns,
    name: text('name').notNull(),
    code: text('code').notNull(),
    programId: uuid('program_id').references(() => program.id),
  },
  (t) => [
    uniqueIndex('results_framework_code_live')
      .on(t.code)
      .where(sql`deleted_at is null`),
  ],
);

export const rfNode = pgTable(
  'rf_node',
  {
    ...metaColumns,
    frameworkId: uuid('framework_id')
      .notNull()
      .references(() => resultsFramework.id),
    parentId: uuid('parent_id'),
    kind: rfNodeKindEnum('kind').notNull(),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => [index('rf_node_framework').on(t.frameworkId)],
);

export const rfNodeIndicators = pgTable(
  'rf_node_indicators',
  {
    nodeId: uuid('node_id')
      .notNull()
      .references(() => rfNode.id),
    indicatorId: uuid('indicator_id')
      .notNull()
      .references(() => indicator.id),
  },
  (t) => [primaryKey({ columns: [t.nodeId, t.indicatorId] })],
);

export const target = pgTable(
  'target',
  {
    ...metaColumns,
    indicatorId: uuid('indicator_id')
      .notNull()
      .references(() => indicator.id),
    orgUnitId: uuid('org_unit_id')
      .notNull()
      .references(() => orgUnit.id),
    period: text('period').notNull(),
    value: doublePrecision('value').notNull(),
    kind: targetKindEnum('kind').notNull(),
  },
  (t) => [
    uniqueIndex('target_key_live')
      .on(t.indicatorId, t.orgUnitId, t.period, t.kind)
      .where(sql`deleted_at is null`),
  ],
);

// --- M5: dashboards (spec §4.1) -----------------------------------------------

export const widgetKindEnum = pgEnum('widget_kind', [
  'kpi',
  'chart',
  'map',
  'table',
  'text',
]);

export const dashboard = pgTable(
  'dashboard',
  {
    ...metaColumns,
    name: text('name').notNull(),
    code: text('code').notNull(),
    shared: boolean('shared').notNull().default(true),
  },
  (t) => [
    uniqueIndex('dashboard_code_live')
      .on(t.code)
      .where(sql`deleted_at is null`),
  ],
);

export const dashboardItem = pgTable(
  'dashboard_item',
  {
    id: uuid('id').primaryKey(),
    dashboardId: uuid('dashboard_id')
      .notNull()
      .references(() => dashboard.id),
    kind: widgetKindEnum('kind').notNull(),
    config: jsonb('config').notNull().default({}),
    gridX: integer('grid_x').notNull().default(0),
    gridY: integer('grid_y').notNull().default(0),
    gridW: integer('grid_w').notNull().default(4),
    gridH: integer('grid_h').notNull().default(3),
  },
  (t) => [index('dashboard_item_dashboard').on(t.dashboardId)],
);

// --- M6: approvals + webhooks (spec §4.2, §7.1) -------------------------------

export const approvalStatusEnum = pgEnum('approval_status', ['approved', 'rejected']);

export const approval = pgTable(
  'approval',
  {
    id: uuid('id').primaryKey(),
    submissionId: uuid('submission_id')
      .notNull()
      .references(() => submission.id),
    level: integer('level').notNull(),
    actor: uuid('actor').notNull(),
    status: approvalStatusEnum('status').notNull(),
    comment: text('comment').notNull().default(''),
    ts: timestamp('ts', ts).notNull().defaultNow(),
  },
  (t) => [index('approval_submission').on(t.submissionId)],
);

export const webhook = pgTable('webhook', {
  ...metaColumns,
  name: text('name').notNull(),
  url: text('url').notNull(),
  events: text('events').array().notNull().default([]),
  secret: text('secret').notNull().default(''),
  active: boolean('active').notNull().default(true),
  lastStatus: integer('last_status'),
  lastFiredAt: timestamp('last_fired_at', ts),
});

// Configurable RAG (spec §16.4). rag_config is synced metadata; thresholds are
// double precision per ADR 005.
export const ragConfig = pgTable(
  'rag_config',
  {
    ...metaColumns,
    programId: uuid('program_id')
      .notNull()
      .references(() => program.id),
    // 'program' | 'framework' | 'indicator' | 'category_option'
    scopeType: text('scope_type').notNull(),
    scopeId: uuid('scope_id').notNull(),
    greenThreshold: doublePrecision('green_threshold').notNull().default(80),
    yellowThreshold: doublePrecision('yellow_threshold').notNull().default(50),
    // 'pct_of_target' | 'absolute' | 'formula'
    calcBasis: text('calc_basis').notNull().default('pct_of_target'),
    formula: text('formula'),
    appliesFrom: date('applies_from'),
    appliesTo: date('applies_to'),
  },
  (t) => [
    index('rag_config_program').on(t.programId),
    index('rag_config_scope').on(t.scopeType, t.scopeId),
  ],
);

// rag_log is server-only (NOT synced, ADR 005): computed RAG status per
// indicator/target/period, read by dashboards via the analytics API.
export const ragLog = pgTable(
  'rag_log',
  {
    id: uuid('id').primaryKey(),
    indicatorId: uuid('indicator_id')
      .notNull()
      .references(() => indicator.id),
    targetId: uuid('target_id'),
    dataValueId: uuid('data_value_id'),
    scopeId: uuid('scope_id'),
    period: text('period').notNull(),
    achieved: doublePrecision('achieved'),
    targetVal: doublePrecision('target_val'),
    pct: doublePrecision('pct'),
    // 'red' | 'yellow' | 'green'
    status: text('status').notNull(),
    configId: uuid('config_id').references(() => ragConfig.id),
    calculatedAt: timestamp('calculated_at', ts).notNull().defaultNow(),
  },
  (t) => [
    index('rag_log_indicator').on(t.indicatorId),
    index('rag_log_indicator_period').on(t.indicatorId, t.period),
  ],
);

// Evidence requirements per data element (spec §16.3) — synced metadata.
export const evidenceRequirement = pgTable(
  'evidence_requirement',
  {
    ...metaColumns,
    dataElementId: uuid('data_element_id')
      .notNull()
      .references(() => dataElement.id),
    // photo | video | audio | document | gps | signature
    evidenceType: text('evidence_type').notNull(),
    isRequired: boolean('is_required').notNull().default(false),
    maxCount: integer('max_count'),
    maxFileKb: integer('max_file_kb'),
    allowedFormats: jsonb('allowed_formats'),
    instructions: text('instructions'),
  },
  (t) => [index('evidence_requirement_data_element').on(t.dataElementId)],
);

// Captured media/evidence (spec §16.3). Client-generated id; no soft-delete or
// version columns (ADR 004). local_blob_key is client-only and never stored
// here. Enters the sync stream via the media_file trigger + a dedicated pull
// branch (the row has no deleted_at, like category_option_combo).
export const mediaFile = pgTable(
  'media_file',
  {
    id: uuid('id').primaryKey(),
    programId: uuid('program_id')
      .notNull()
      .references(() => program.id),
    dataElementId: uuid('data_element_id')
      .notNull()
      .references(() => dataElement.id),
    submissionId: uuid('submission_id'),
    dataValueId: uuid('data_value_id'),
    evidenceType: text('evidence_type').notNull(),
    fileRef: text('file_ref'),
    fileName: text('file_name'),
    fileSizeKb: integer('file_size_kb'),
    mimeType: text('mime_type'),
    thumbnailRef: text('thumbnail_ref'),
    geoLat: doublePrecision('geo_lat'),
    geoLng: doublePrecision('geo_lng'),
    geoAccuracyM: doublePrecision('geo_accuracy_m'),
    deviceMeta: jsonb('device_meta').notNull().default({}),
    uploadedBy: uuid('uploaded_by'),
    syncStatus: text('sync_status').notNull().default('pending'),
    syncedAt: timestamp('synced_at', ts),
    capturedAt: timestamp('captured_at', ts),
    createdAt: timestamp('created_at', ts).notNull().defaultNow(),
  },
  (t) => [
    index('media_file_data_element').on(t.dataElementId),
    index('media_file_submission').on(t.submissionId),
    index('media_file_data_value').on(t.dataValueId),
  ],
);
