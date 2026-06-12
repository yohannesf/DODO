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

export const programInputSchema = z.object({
  name: nameSchema,
  code: codeSchema,
  description: z.string().max(2000).default(''),
  active: z.boolean().default(true),
});
export const programSchema = programInputSchema.extend(metaFieldsSchema.shape);
export type Program = z.infer<typeof programSchema>;

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
});
export type MetadataBundle = z.infer<typeof metadataBundleSchema>;
