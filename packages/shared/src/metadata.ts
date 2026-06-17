// Cross-tier metadata schemas (spec §4.1). Server routes validate input with
// these; the client uses the same schemas for forms and offline validation.
// Every metadata entity has a mandatory, per-entity-unique `code` (ADR 001).
import { z } from 'zod';

export const PERMISSIONS = [
  'metadata:read',
  'metadata:write',
  'data:read',
  'data:write',
  'approvals:act',
  'dashboards:manage',
  'users:manage',
  'system:admin',
] as const;
export const permissionSchema = z.enum(PERMISSIONS);
export type Permission = z.infer<typeof permissionSchema>;

export const VALUE_TYPES = [
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
export const valueTypeSchema = z.enum(VALUE_TYPES);
export type ValueType = z.infer<typeof valueTypeSchema>;

export const AGGREGATION_OPS = ['sum', 'avg', 'count', 'min', 'max', 'last'] as const;
export const aggregationOpSchema = z.enum(AGGREGATION_OPS);
export type AggregationOp = z.infer<typeof aggregationOpSchema>;

export const FREQUENCIES = ['DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY'] as const;
export const frequencySchema = z.enum(FREQUENCIES);
export type Frequency = z.infer<typeof frequencySchema>;

export const ORG_UNIT_SCOPES = ['data_entry', 'data_view'] as const;
export const orgUnitScopeSchema = z.enum(ORG_UNIT_SCOPES);

// Reserved `default` combo/COC ids — seeded by migration, identical on every
// instance so bundles and undisaggregated values are portable.
export const DEFAULT_CATEGORY_COMBO_ID = '019754a0-0000-7000-8000-00000000c0c0';
export const DEFAULT_CATEGORY_OPTION_COMBO_ID = '019754a0-0000-7000-8000-00000000c0c1';

export const codeSchema = z
  .string()
  .min(2)
  .max(64)
  .regex(/^[A-Za-z0-9][A-Za-z0-9_.-]*$/, 'letters, digits, _ . - only');

export const nameSchema = z.string().min(1).max(230);

// Audit/version envelope returned by the API for every metadata entity.
export const metaFieldsSchema = z.object({
  id: z.string().uuid(),
  version: z.number().int().positive(),
  createdAt: z.string(),
  updatedAt: z.string(),
  deletedAt: z.string().nullable(),
});

// --- GeoJSON (minimal structural validation; PostGIS re-validates) ---------

export const geometrySchema = z.object({
  type: z.enum([
    'Point',
    'MultiPoint',
    'LineString',
    'MultiLineString',
    'Polygon',
    'MultiPolygon',
  ]),
  coordinates: z.unknown(),
});
export type Geometry = z.infer<typeof geometrySchema>;

export const featureCollectionSchema = z.object({
  type: z.literal('FeatureCollection'),
  features: z.array(
    z.object({
      type: z.literal('Feature'),
      geometry: geometrySchema.nullable(),
      properties: z.record(z.unknown()).nullable(),
    }),
  ),
});
export type FeatureCollection = z.infer<typeof featureCollectionSchema>;

// --- Entities ---------------------------------------------------------------

export const PROGRAM_STATUSES = ['draft', 'active', 'closed', 'suspended'] as const;
export const programStatusSchema = z.enum(PROGRAM_STATUSES);
export type ProgramStatus = z.infer<typeof programStatusSchema>;

export const programInputSchema = z.object({
  name: nameSchema,
  code: codeSchema,
  description: z.string().max(2000).default(''),
  active: z.boolean().default(true),
  // project-level container fields (spec §16.2); all default so existing
  // callers stay valid.
  status: programStatusSchema.default('active'),
  currency: z.string().min(1).max(8).default('USD'),
  fiscalYearStart: z.number().int().min(1).max(12).default(1),
  startDate: z.string().date().nullable().default(null),
  endDate: z.string().date().nullable().default(null),
  metadata: z.record(z.unknown()).default({}),
});
export const programSchema = programInputSchema.extend(metaFieldsSchema.shape);
export type Program = z.infer<typeof programSchema>;

// Custom project metadata fields (spec §16.2).
export const PROGRAM_FIELD_TYPES = [
  'text',
  'number',
  'date',
  'dropdown',
  'boolean',
] as const;
export const programFieldTypeSchema = z.enum(PROGRAM_FIELD_TYPES);
export type ProgramFieldType = z.infer<typeof programFieldTypeSchema>;

export const programFieldDefInputSchema = z.object({
  programId: z.string().uuid(),
  fieldName: nameSchema,
  fieldType: programFieldTypeSchema,
  isRequired: z.boolean().default(false),
  // dropdown choices; null/empty for non-dropdown types
  options: z.array(z.string()).nullable().default(null),
  displayOrder: z.number().int().min(0).default(0),
});
export const programFieldDefSchema = programFieldDefInputSchema.extend(
  metaFieldsSchema.shape,
);
export type ProgramFieldDef = z.infer<typeof programFieldDefSchema>;

export const programFieldValueInputSchema = z.object({
  programId: z.string().uuid(),
  fieldDefId: z.string().uuid(),
  value: z.string().max(50_000).nullable().default(null),
});
export const programFieldValueSchema = programFieldValueInputSchema.extend(
  metaFieldsSchema.shape,
);
export type ProgramFieldValue = z.infer<typeof programFieldValueSchema>;

// Media & evidence (spec §16.3).
export const EVIDENCE_TYPES = [
  'photo',
  'video',
  'audio',
  'document',
  'gps',
  'signature',
] as const;
export const evidenceTypeSchema = z.enum(EVIDENCE_TYPES);
export type EvidenceType = z.infer<typeof evidenceTypeSchema>;

export const evidenceRequirementInputSchema = z.object({
  dataElementId: z.string().uuid(),
  evidenceType: evidenceTypeSchema,
  isRequired: z.boolean().default(false),
  maxCount: z.number().int().min(1).nullable().default(null),
  maxFileKb: z.number().int().min(1).nullable().default(null),
  allowedFormats: z.array(z.string()).nullable().default(null),
  instructions: z.string().max(2000).nullable().default(null),
});
export const evidenceRequirementSchema = evidenceRequirementInputSchema.extend(
  metaFieldsSchema.shape,
);
export type EvidenceRequirement = z.infer<typeof evidenceRequirementSchema>;

export const MEDIA_SYNC_STATUSES = ['pending', 'synced', 'failed'] as const;

// The "metadata push" payload (step 2 of the two-step push, ADR 004) — the
// client posts the row it generated, including its UUIDv7 id and the fileRef
// returned by POST /api/files (null for GPS evidence).
export const mediaFileInputSchema = z.object({
  id: z.string().uuid(),
  programId: z.string().uuid(),
  dataElementId: z.string().uuid(),
  submissionId: z.string().uuid().nullable().default(null),
  dataValueId: z.string().uuid().nullable().default(null),
  evidenceType: evidenceTypeSchema,
  fileRef: z.string().nullable().default(null),
  fileName: z.string().nullable().default(null),
  fileSizeKb: z.number().int().nonnegative().nullable().default(null),
  mimeType: z.string().nullable().default(null),
  thumbnailRef: z.string().nullable().default(null),
  geoLat: z.number().nullable().default(null),
  geoLng: z.number().nullable().default(null),
  geoAccuracyM: z.number().nullable().default(null),
  deviceMeta: z.record(z.unknown()).default({}),
  capturedAt: z.string().nullable().default(null),
});
export const mediaFileSchema = mediaFileInputSchema.extend({
  uploadedBy: z.string().uuid().nullable(),
  syncStatus: z.enum(MEDIA_SYNC_STATUSES),
  syncedAt: z.string().nullable(),
  createdAt: z.string(),
});
export type MediaFile = z.infer<typeof mediaFileSchema>;

export const orgUnitLevelInputSchema = z.object({
  level: z.number().int().min(1).max(12),
  name: nameSchema,
});
export const orgUnitLevelSchema = orgUnitLevelInputSchema.extend(metaFieldsSchema.shape);
export type OrgUnitLevel = z.infer<typeof orgUnitLevelSchema>;

export const orgUnitInputSchema = z.object({
  name: nameSchema,
  shortName: z.string().min(1).max(60),
  code: codeSchema,
  parentId: z.string().uuid().nullable().default(null),
  openingDate: z.string().date().nullable().default(null),
  closedDate: z.string().date().nullable().default(null),
  geometry: geometrySchema.nullable().default(null),
  attributes: z.record(z.unknown()).default({}),
});
export const orgUnitSchema = orgUnitInputSchema.extend(metaFieldsSchema.shape).extend({
  level: z.number().int().min(1),
  path: z.string(),
});
export type OrgUnit = z.infer<typeof orgUnitSchema>;

export const categoryInputSchema = z.object({
  name: nameSchema,
  code: codeSchema,
  dataDimension: z.boolean().default(true),
});
export const categorySchema = categoryInputSchema.extend(metaFieldsSchema.shape);
export type Category = z.infer<typeof categorySchema>;

export const categoryOptionInputSchema = z.object({
  categoryId: z.string().uuid(),
  // nested disaggregation parent (spec §16.1); null = top-level option
  parentId: z.string().uuid().nullable().default(null),
  name: nameSchema,
  code: codeSchema,
  sortOrder: z.number().int().min(0).default(0),
});
export const categoryOptionSchema = categoryOptionInputSchema.extend(
  metaFieldsSchema.shape,
);
export type CategoryOption = z.infer<typeof categoryOptionSchema>;

export const categoryComboInputSchema = z.object({
  name: nameSchema,
  code: codeSchema,
  // ordered: defines column nesting in entry grids
  categoryIds: z.array(z.string().uuid()).min(1).max(4),
});
export const categoryComboSchema = categoryComboInputSchema.extend(
  metaFieldsSchema.shape,
);
export type CategoryCombo = z.infer<typeof categoryComboSchema>;

export const categoryOptionComboSchema = z.object({
  id: z.string().uuid(),
  comboId: z.string().uuid(),
  name: nameSchema,
  optionIds: z.array(z.string().uuid()),
});
export type CategoryOptionCombo = z.infer<typeof categoryOptionComboSchema>;

export const optionSetInputSchema = z.object({
  name: nameSchema,
  code: codeSchema,
});
export const optionSetSchema = optionSetInputSchema.extend(metaFieldsSchema.shape);
export type OptionSet = z.infer<typeof optionSetSchema>;

export const optionInputSchema = z.object({
  optionSetId: z.string().uuid(),
  name: nameSchema,
  code: codeSchema,
  sortOrder: z.number().int().min(0).default(0),
});
export const optionSchema = optionInputSchema.extend(metaFieldsSchema.shape);
export type Option = z.infer<typeof optionSchema>;

export const dataElementInputSchema = z
  .object({
    name: nameSchema,
    shortName: z.string().min(1).max(60),
    code: codeSchema,
    description: z.string().max(2000).default(''),
    valueType: valueTypeSchema,
    categoryComboId: z.string().uuid().nullable().default(null),
    unitOfMeasure: z.string().max(60).default(''),
    aggregationOp: aggregationOpSchema.default('sum'),
    optionSetId: z.string().uuid().nullable().default(null),
  })
  .refine((d) => d.valueType !== 'OPTION' || d.optionSetId !== null, {
    message: 'OPTION value type requires an option set',
    path: ['optionSetId'],
  });
export const dataElementSchema = z.object({
  ...dataElementInputSchema.innerType().shape,
  ...metaFieldsSchema.shape,
});
export type DataElement = z.infer<typeof dataElementSchema>;

export const datasetElementSchema = z.object({
  dataElementId: z.string().uuid(),
  sortOrder: z.number().int().min(0).default(0),
  section: z.string().max(120).default(''),
  required: z.boolean().default(false),
});
export const datasetInputSchema = z.object({
  name: nameSchema,
  code: codeSchema,
  description: z.string().max(2000).default(''),
  frequency: frequencySchema,
  openFuturePeriods: z.number().int().min(0).max(24).default(0),
  expiryDays: z.number().int().min(0).default(0),
  requiresApproval: z.boolean().default(false),
  approvalLevels: z.number().int().min(1).max(5).default(1),
  programId: z.string().uuid().nullable().default(null),
  entryLayout: z.record(z.unknown()).default({}),
  elements: z.array(datasetElementSchema).default([]),
  orgUnitIds: z.array(z.string().uuid()).default([]),
});
export const datasetSchema = datasetInputSchema.extend(metaFieldsSchema.shape);
export type Dataset = z.infer<typeof datasetSchema>;

export const roleInputSchema = z.object({
  name: nameSchema,
  code: codeSchema,
  permissions: z.array(permissionSchema).default([]),
});
export const roleSchema = roleInputSchema.extend(metaFieldsSchema.shape);
export type Role = z.infer<typeof roleSchema>;

export const userOrgUnitSchema = z.object({
  orgUnitId: z.string().uuid(),
  scope: orgUnitScopeSchema,
});
export type UserOrgUnit = z.infer<typeof userOrgUnitSchema>;
export const userInputSchema = z.object({
  username: z
    .string()
    .min(2)
    .max(64)
    .regex(/^[a-z0-9][a-z0-9_.-]*$/, 'lowercase letters, digits, _ . - only'),
  email: z.string().email().nullable().default(null),
  displayName: nameSchema,
  locale: z.string().min(2).max(12).default('en'),
  disabled: z.boolean().default(false),
  password: z.string().min(10).max(256).optional(),
  roleIds: z.array(z.string().uuid()).default([]),
  orgUnits: z.array(userOrgUnitSchema).default([]),
});
export const userSchema = userInputSchema.omit({ password: true }).extend({
  ...metaFieldsSchema.shape,
});
export type User = z.infer<typeof userSchema>;

// --- Validation rules (spec §4.1, M3) ---------------------------------------

export const VALIDATION_OPS = ['<', '<=', '=', '!=', '>=', '>'] as const;
export const validationOpSchema = z.enum(VALIDATION_OPS);
export type ValidationOp = z.infer<typeof validationOpSchema>;

export const SEVERITIES = ['warning', 'error'] as const;
export const severitySchema = z.enum(SEVERITIES);
export type Severity = z.infer<typeof severitySchema>;

export const validationRuleInputSchema = z.object({
  name: nameSchema,
  code: codeSchema,
  leftExpr: z.string().min(1).max(2000),
  op: validationOpSchema,
  rightExpr: z.string().min(1).max(2000),
  severity: severitySchema.default('warning'),
  instruction: z.string().max(500).default(''),
  datasetIds: z.array(z.string().uuid()).default([]),
});
export const validationRuleSchema = validationRuleInputSchema.extend(
  metaFieldsSchema.shape,
);
export type ValidationRule = z.infer<typeof validationRuleSchema>;

// --- Indicators, targets, results framework (spec §4.1, M4) -----------------

export const INDICATOR_TYPES = [
  'number',
  'percent',
  'rate',
  'per_thousand',
  'per_ten_thousand',
] as const;
export const indicatorTypeSchema = z.enum(INDICATOR_TYPES);
export type IndicatorType = z.infer<typeof indicatorTypeSchema>;

export const indicatorInputSchema = z.object({
  name: nameSchema,
  code: codeSchema,
  description: z.string().max(2000).default(''),
  numeratorExpr: z.string().min(1).max(2000),
  denominatorExpr: z.string().min(1).max(2000).default('1'),
  factor: z.number().finite().default(1),
  decimals: z.number().int().min(0).max(6).default(1),
  indicatorType: indicatorTypeSchema.default('number'),
  annualized: z.boolean().default(false),
  programId: z.string().uuid().nullable().default(null),
});
export const indicatorSchema = indicatorInputSchema.extend(metaFieldsSchema.shape);
export type Indicator = z.infer<typeof indicatorSchema>;

export const TARGET_KINDS = ['baseline', 'target'] as const;
export const targetKindSchema = z.enum(TARGET_KINDS);

export const targetInputSchema = z.object({
  indicatorId: z.string().uuid(),
  orgUnitId: z.string().uuid(),
  period: z.string().min(4),
  value: z.number().finite(),
  kind: targetKindSchema,
});
export const targetSchema = targetInputSchema.extend(metaFieldsSchema.shape);
export type Target = z.infer<typeof targetSchema>;

export const RF_NODE_KINDS = ['goal', 'outcome', 'output', 'activity'] as const;
export const rfNodeKindSchema = z.enum(RF_NODE_KINDS);

export const resultsFrameworkInputSchema = z.object({
  name: nameSchema,
  code: codeSchema,
  programId: z.string().uuid().nullable().default(null),
});
export const resultsFrameworkSchema = resultsFrameworkInputSchema.extend(
  metaFieldsSchema.shape,
);
export type ResultsFramework = z.infer<typeof resultsFrameworkSchema>;

export const rfNodeInputSchema = z.object({
  frameworkId: z.string().uuid(),
  parentId: z.string().uuid().nullable().default(null),
  kind: rfNodeKindSchema,
  title: nameSchema,
  description: z.string().max(2000).default(''),
  sortOrder: z.number().int().min(0).default(0),
  indicatorIds: z.array(z.string().uuid()).default([]),
});
export const rfNodeSchema = rfNodeInputSchema.extend(metaFieldsSchema.shape);
export type RfNode = z.infer<typeof rfNodeSchema>;

// --- Dashboards (spec §4.1, §8.6, M5) ----------------------------------------

export const WIDGET_KINDS = ['kpi', 'chart', 'map', 'table', 'text'] as const;
export const widgetKindSchema = z.enum(WIDGET_KINDS);
export type WidgetKind = z.infer<typeof widgetKindSchema>;

export const dashboardItemSchema = z.object({
  id: z.string().uuid(),
  kind: widgetKindSchema,
  // widget = saved analytics query + presentation settings; the client
  // interprets the config, the server stores it verbatim
  config: z.record(z.unknown()).default({}),
  gridX: z.number().int().min(0).max(11).default(0),
  gridY: z.number().int().min(0).default(0),
  gridW: z.number().int().min(1).max(12).default(4),
  gridH: z.number().int().min(1).max(12).default(3),
});
export type DashboardItem = z.infer<typeof dashboardItemSchema>;

export const dashboardInputSchema = z.object({
  name: nameSchema,
  code: codeSchema,
  shared: z.boolean().default(true),
  items: z.array(dashboardItemSchema).default([]),
});
export const dashboardSchema = dashboardInputSchema.extend(metaFieldsSchema.shape);
export type Dashboard = z.infer<typeof dashboardSchema>;

// --- Webhooks (spec §7.1, M6) -------------------------------------------------

export const WEBHOOK_EVENTS = [
  'submission.completed',
  'submission.approved',
  'submission.rejected',
] as const;
export const webhookEventSchema = z.enum(WEBHOOK_EVENTS);
export type WebhookEvent = z.infer<typeof webhookEventSchema>;

export const webhookInputSchema = z.object({
  name: nameSchema,
  url: z.string().url().max(2000),
  events: z.array(webhookEventSchema).default([]),
  secret: z.string().max(256).default(''),
  active: z.boolean().default(true),
});
export const webhookSchema = webhookInputSchema.extend(metaFieldsSchema.shape).extend({
  lastStatus: z.number().int().nullable().default(null),
  lastFiredAt: z.string().nullable().default(null),
});
export type Webhook = z.infer<typeof webhookSchema>;

// --- Metadata bundle (spec §8.5): one versioned, shareable JSON ------------

export const METADATA_BUNDLE_VERSION = 1;
export const metadataBundleSchema = z.object({
  bundleVersion: z.literal(METADATA_BUNDLE_VERSION),
  exportedAt: z.string(),
  programs: z.array(programSchema).default([]),
  orgUnitLevels: z.array(orgUnitLevelSchema).default([]),
  orgUnits: z.array(orgUnitSchema).default([]),
  categories: z.array(categorySchema).default([]),
  categoryOptions: z.array(categoryOptionSchema).default([]),
  categoryCombos: z.array(categoryComboSchema).default([]),
  optionSets: z.array(optionSetSchema).default([]),
  options: z.array(optionSchema).default([]),
  dataElements: z.array(dataElementSchema).default([]),
  datasets: z.array(datasetSchema).default([]),
  roles: z.array(roleSchema).default([]),
  validationRules: z.array(validationRuleSchema).default([]),
  indicators: z.array(indicatorSchema).default([]),
  resultsFrameworks: z.array(resultsFrameworkSchema).default([]),
  rfNodes: z.array(rfNodeSchema).default([]),
  targets: z.array(targetSchema).default([]),
  dashboards: z.array(dashboardSchema).default([]),
});
export type MetadataBundle = z.infer<typeof metadataBundleSchema>;
