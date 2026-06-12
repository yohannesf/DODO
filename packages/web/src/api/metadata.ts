// Metadata hooks. Query keys mirror the (future) Dexie table names so the M2
// offline mirror is a drop-in replacement (CLAUDE.md).
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';
import type {
  Category,
  Indicator,
  ResultsFramework,
  RfNode,
  Target,
  ValidationRule,
  CategoryCombo,
  CategoryOption,
  CategoryOptionCombo,
  DataElement,
  Dataset,
  MetadataBundle,
  Option,
  OptionSet,
  OrgUnit,
  OrgUnitLevel,
  Program,
  Role,
  User,
} from '@dodo/shared';
import { api } from './client';

export interface EntityConfig {
  /** query key — equals the Dexie table name from spec §5.2 */
  table: string;
  path: string;
}

export const ENTITIES = {
  programs: { table: 'programs', path: '/api/metadata/programs' },
  orgUnitLevels: { table: 'orgUnitLevels', path: '/api/metadata/org-unit-levels' },
  orgUnits: { table: 'orgUnits', path: '/api/metadata/org-units' },
  categories: { table: 'categories', path: '/api/metadata/categories' },
  categoryOptions: {
    table: 'categoryOptions',
    path: '/api/metadata/category-options',
  },
  categoryCombos: { table: 'categoryCombos', path: '/api/metadata/category-combos' },
  optionSets: { table: 'optionSets', path: '/api/metadata/option-sets' },
  options: { table: 'options', path: '/api/metadata/options' },
  dataElements: { table: 'dataElements', path: '/api/metadata/data-elements' },
  datasets: { table: 'datasets', path: '/api/metadata/datasets' },
  roles: { table: 'roles', path: '/api/metadata/roles' },
  validationRules: {
    table: 'validationRules',
    path: '/api/metadata/validation-rules',
  },
  indicators: { table: 'indicators', path: '/api/metadata/indicators' },
  resultsFrameworks: {
    table: 'resultsFrameworks',
    path: '/api/metadata/results-frameworks',
  },
  rfNodes: { table: 'rfNodes', path: '/api/metadata/rf-nodes' },
  targets: { table: 'targets', path: '/api/metadata/targets' },
  users: { table: 'users', path: '/api/metadata/users' },
} as const satisfies Record<string, EntityConfig>;

export type EntityKey = keyof typeof ENTITIES;

export interface EntityTypes {
  programs: Program;
  orgUnitLevels: OrgUnitLevel;
  orgUnits: OrgUnit;
  categories: Category;
  categoryOptions: CategoryOption;
  categoryCombos: CategoryCombo;
  optionSets: OptionSet;
  options: Option;
  dataElements: DataElement;
  datasets: Dataset;
  roles: Role;
  users: User;
  validationRules: ValidationRule;
  indicators: Indicator;
  resultsFrameworks: ResultsFramework;
  rfNodes: RfNode;
  targets: Target;
}

export function useEntityList<K extends EntityKey>(
  key: K,
): UseQueryResult<Array<EntityTypes[K]>> {
  const { table, path } = ENTITIES[key];
  return useQuery({
    queryKey: [table],
    queryFn: () => api.get<Array<EntityTypes[K]>>(path),
  });
}

export function useEntityMutations<K extends EntityKey>(key: K) {
  const { table, path } = ENTITIES[key];
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: [table] });

  const create = useMutation({
    mutationFn: (input: unknown) => api.post<EntityTypes[K]>(path, input),
    onSuccess: invalidate,
  });
  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: unknown }) =>
      api.patch<EntityTypes[K]>(`${path}/${id}`, patch),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`${path}/${id}`),
    onSuccess: invalidate,
  });
  return { create, update, remove, invalidate };
}

export function useOptionCombos(comboId: string | null) {
  return useQuery({
    queryKey: ['categoryOptionCombos', comboId],
    queryFn: () =>
      api.get<CategoryOptionCombo[]>(
        `/api/metadata/category-combos/${comboId}/option-combos`,
      ),
    enabled: comboId !== null,
  });
}

export interface CsvImportReport {
  dryRun: boolean;
  rows: Array<{ line: number; code: string; action: string; message?: string }>;
  created: number;
  updated: number;
  errors: number;
}

export const importOrgUnitsCsv = (csv: string, dryRun: boolean) =>
  api.post<CsvImportReport>('/api/metadata/org-units/import-csv', { csv, dryRun });

export const importOrgUnitsGeoJson = (fc: unknown) =>
  api.post<{ matched: number; unmatched: string[] }>(
    '/api/metadata/org-units/import-geojson',
    fc,
  );

export const exportBundle = () => api.get<MetadataBundle>('/api/metadata/bundle');
export const importBundle = (bundle: unknown) =>
  api.post<{ created: Record<string, number>; updated: Record<string, number> }>(
    '/api/metadata/bundle',
    bundle,
  );
