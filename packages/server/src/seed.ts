// Demo seed (spec §11): WASH program — 3-level org tree with geometry,
// disaggregation, 2 datasets, 12 indicators, 18 months of sample data.
// Used by demos and e2e. Idempotent-ish: refuses to run on a non-empty
// instance unless --force.
import { isNull } from 'drizzle-orm';
import {
  offsetPeriod,
  periodContaining,
  formatPeriod,
  uuidv7,
  type AuthUser,
} from '@dodo/shared';
import { loadConfig } from './config.js';
import { createDb, createPool, type Db } from './db/index.js';
import { runMigrations } from './migrate.js';
import { bootstrapAdmin } from './bootstrap.js';
import { program as programTable } from './db/schema.js';
import { makeCrud } from './services/metadata/crud.js';
import {
  category,
  categoryOption,
  dataElement,
  orgUnitLevel,
  program,
  evidenceRequirement,
  framework,
  frameworkLevel,
  frameworkNode,
  indicatorFrameworkMapping,
  exportTemplate,
} from './db/schema.js';
import { createOrgUnit, updateOrgUnit } from './services/metadata/org-units.js';

// Convex hull (Andrew's monotone chain) over a region's site coordinates,
// buffered outward from the centroid, so each region renders as an
// administrative-boundary polygon on the map (no external basemap needed).
function hullPolygon(
  points: Array<[number, number]>,
  buffer = 0.18,
): { type: 'Polygon'; coordinates: number[][][] } | null {
  if (points.length < 3) return null;
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: number[], a: number[], b: number[]) =>
    (a[0]! - o[0]!) * (b[1]! - o[1]!) - (a[1]! - o[1]!) * (b[0]! - o[0]!);
  const lower: number[][] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower.at(-2)!, lower.at(-1)!, p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: number[][] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i]!;
    while (upper.length >= 2 && cross(upper.at(-2)!, upper.at(-1)!, p) <= 0) upper.pop();
    upper.push(p);
  }
  const hull = [...lower.slice(0, -1), ...upper.slice(0, -1)];
  if (hull.length < 3) return null;
  const cx = hull.reduce((s, p) => s + p[0]!, 0) / hull.length;
  const cy = hull.reduce((s, p) => s + p[1]!, 0) / hull.length;
  const ring = hull.map(([x, y]) => {
    const dx = x! - cx;
    const dy = y! - cy;
    const d = Math.hypot(dx, dy) || 1;
    return [x! + (dx / d) * buffer, y! + (dy / d) * buffer];
  });
  ring.push(ring[0]!); // close the ring
  return { type: 'Polygon', coordinates: [ring] };
}
import {
  createCategoryCombo,
  listOptionCombos,
} from './services/metadata/category-combos.js';
import { createDataset } from './services/metadata/datasets.js';
import { push } from './services/sync.js';

// deterministic pseudo-random — same demo data on every install
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export async function seedDemo(db: Db, adminUser: AuthUser): Promise<void> {
  const rand = mulberry32(42);
  const programs = makeCrud(programTable, 'program');
  const levels = makeCrud(orgUnitLevel, 'org unit level');
  const categories = makeCrud(category, 'category');
  const categoryOptions = makeCrud(categoryOption, 'category option');
  const dataElements = makeCrud(dataElement, 'data element');

  const wash = await programs.create(db, {
    name: 'WASH',
    code: 'WASH',
    description: 'Water, sanitation and hygiene programme',
  });

  for (const [level, name] of [
    [1, 'Country'],
    [2, 'Region'],
    [3, 'Site'],
  ] as const) {
    await levels.create(db, { level, name });
  }

  // org tree: 1 country, 4 regions, 36 sites (~40 units) with geometry
  const country = await createOrgUnit(db, {
    name: 'Demoland',
    shortName: 'Demoland',
    code: 'DL',
    parentId: null,
    openingDate: '2020-01-01',
    closedDate: null,
    geometry: null,
    attributes: {},
  });
  const regionNames = ['North', 'East', 'South', 'West'];
  const baseCoords: Array<[number, number]> = [
    [38.7, 9.6],
    [39.4, 9.0],
    [38.7, 8.4],
    [38.0, 9.0],
  ];
  const sites: Array<{ id: string }> = [];
  const regionUnits: Array<{ id: string }> = [];
  for (let r = 0; r < 4; r++) {
    const region = await createOrgUnit(db, {
      name: `${regionNames[r]} Region`,
      shortName: regionNames[r]!,
      code: `DL-${regionNames[r]![0]}`,
      parentId: country.id,
      openingDate: '2020-01-01',
      closedDate: null,
      geometry: null,
      attributes: {},
    });
    const regionCoords: Array<[number, number]> = [];
    for (let s = 1; s <= 9; s++) {
      const [lon, lat] = baseCoords[r]!;
      const coord: [number, number] = [
        lon + (rand() - 0.5) * 0.6,
        lat + (rand() - 0.5) * 0.6,
      ];
      regionCoords.push(coord);
      sites.push(
        await createOrgUnit(db, {
          name: `${regionNames[r]} Site ${s}`,
          shortName: `${regionNames[r]![0]}S${s}`,
          code: `DL-${regionNames[r]![0]}-S${s}`,
          parentId: region.id,
          openingDate: '2020-01-01',
          closedDate: null,
          geometry: { type: 'Point', coordinates: coord },
          attributes: {},
        }),
      );
    }
    // give the region an administrative-boundary polygon around its sites
    const poly = hullPolygon(regionCoords);
    if (poly) await updateOrgUnit(db, region.id, { geometry: poly });
    regionUnits.push(region);
  }

  // disaggregation: Sex × Age band
  const sex = await categories.create(db, { name: 'Sex', code: 'SEX' });
  const age = await categories.create(db, { name: 'Age band', code: 'AGE' });
  await categoryOptions.create(db, {
    categoryId: sex.id,
    name: 'Female',
    code: 'SEX-F',
    sortOrder: 0,
  });
  await categoryOptions.create(db, {
    categoryId: sex.id,
    name: 'Male',
    code: 'SEX-M',
    sortOrder: 1,
  });
  await categoryOptions.create(db, {
    categoryId: age.id,
    name: 'Under 18',
    code: 'AGE-U18',
    sortOrder: 0,
  });
  await categoryOptions.create(db, {
    categoryId: age.id,
    name: '18 and over',
    code: 'AGE-18P',
    sortOrder: 1,
  });
  const sexAge = await createCategoryCombo(db, {
    name: 'Sex / Age',
    code: 'SEX_AGE',
    categoryIds: [sex.id as string, age.id as string],
  });

  // data elements
  const de = async (
    name: string,
    code: string,
    opts: Partial<{
      aggregationOp: string;
      categoryComboId: string | null;
      unit: string;
    }> = {},
  ) =>
    dataElements.create(db, {
      name,
      shortName: name.slice(0, 50),
      code,
      description: '',
      valueType: 'INTEGER_ZERO_OR_POSITIVE',
      categoryComboId: opts.categoryComboId ?? null,
      unitOfMeasure: opts.unit ?? '',
      aggregationOp: opts.aggregationOp ?? 'sum',
      optionSetId: null,
    });

  const deBoreholes = await de('Boreholes rehabilitated', 'DE-BOREHOLES', {
    unit: 'boreholes',
  });
  const deWaterPoints = await de('Functional water points', 'DE-WATERPOINTS', {
    aggregationOp: 'last',
    unit: 'water points',
  });
  const dePeopleWater = await de(
    'People gaining access to safe water',
    'DE-PEOPLE-WATER',
    {
      categoryComboId: sexAge.id,
    },
  );
  const deLatrines = await de('Household latrines built', 'DE-LATRINES', {
    unit: 'latrines',
  });
  const dePeopleSan = await de('People gaining access to sanitation', 'DE-PEOPLE-SAN', {
    categoryComboId: sexAge.id,
  });
  const deHygieneSessions = await de(
    'Hygiene promotion sessions held',
    'DE-HYG-SESSIONS',
  );

  // datasets
  await createDataset(db, {
    name: 'Monthly water report',
    code: 'DS-WATER-M',
    description: '',
    frequency: 'MONTHLY',
    openFuturePeriods: 1,
    expiryDays: 0,
    requiresApproval: true,
    approvalLevels: 1,
    programId: null,
    entryLayout: {},
    elements: [
      {
        dataElementId: deBoreholes.id as string,
        sortOrder: 0,
        section: 'Water',
        required: true,
      },
      {
        dataElementId: deWaterPoints.id as string,
        sortOrder: 1,
        section: 'Water',
        required: true,
      },
      {
        dataElementId: dePeopleWater.id as string,
        sortOrder: 2,
        section: 'Water',
        required: false,
      },
    ],
    orgUnitIds: sites.map((s) => s.id),
  });
  await createDataset(db, {
    name: 'Monthly sanitation & hygiene report',
    code: 'DS-SAN-M',
    description: '',
    frequency: 'MONTHLY',
    openFuturePeriods: 1,
    expiryDays: 0,
    requiresApproval: false,
    approvalLevels: 1,
    programId: null,
    entryLayout: {},
    elements: [
      {
        dataElementId: deLatrines.id as string,
        sortOrder: 0,
        section: 'Sanitation',
        required: true,
      },
      {
        dataElementId: dePeopleSan.id as string,
        sortOrder: 1,
        section: 'Sanitation',
        required: false,
      },
      {
        dataElementId: deHygieneSessions.id as string,
        sortOrder: 2,
        section: 'Hygiene',
        required: false,
      },
    ],
    orgUnitIds: sites.map((s) => s.id),
  });

  // 12 indicators via the API-equivalent service
  const indicators = makeCrud((await import('./db/schema.js')).indicator, 'indicator');
  const ind = (name: string, code: string, num: string, den: string, type = 'number') =>
    indicators.create(db, {
      name,
      code,
      description: '',
      numeratorExpr: num,
      denominatorExpr: den,
      factor: 1,
      decimals: 1,
      indicatorType: type,
      annualized: false,
      programId: null,
    });
  const indBoreholes = await ind(
    'Boreholes rehabilitated (total)',
    'IND-BOREHOLES',
    '#{DE-BOREHOLES}',
    '1',
  );
  const indWaterPoints = await ind(
    'Functional water points',
    'IND-WATERPOINTS',
    '#{DE-WATERPOINTS}',
    '1',
  );
  const indPeopleWater = await ind(
    'People with safe water',
    'IND-PEOPLE-WATER',
    '#{DE-PEOPLE-WATER}',
    '1',
  );
  const indPctFemale = await ind(
    '% female (water)',
    'IND-PCT-F-WATER',
    '#{DE-PEOPLE-WATER.SEX-F}',
    '#{DE-PEOPLE-WATER}',
    'percent',
  );
  await ind(
    '% under 18 (water)',
    'IND-PCT-U18-WATER',
    '#{DE-PEOPLE-WATER.AGE-U18}',
    '#{DE-PEOPLE-WATER}',
    'percent',
  );
  await ind(
    'People per water point',
    'IND-PPL-PER-WP',
    '#{DE-PEOPLE-WATER}',
    '#{DE-WATERPOINTS}',
  );
  await ind('Latrines built (total)', 'IND-LATRINES', '#{DE-LATRINES}', '1');
  await ind('People with sanitation', 'IND-PEOPLE-SAN', '#{DE-PEOPLE-SAN}', '1');
  await ind(
    '% female (sanitation)',
    'IND-PCT-F-SAN',
    '#{DE-PEOPLE-SAN.SEX-F}',
    '#{DE-PEOPLE-SAN}',
    'percent',
  );
  await ind('Hygiene sessions held', 'IND-HYG', '#{DE-HYG-SESSIONS}', '1');
  await ind(
    'People reached per session',
    'IND-PPL-PER-SESSION',
    '#{DE-PEOPLE-SAN}',
    '#{DE-HYG-SESSIONS}',
  );
  await ind(
    'Sanitation vs water access ratio',
    'IND-SAN-WATER-RATIO',
    '#{DE-PEOPLE-SAN}',
    '#{DE-PEOPLE-WATER}',
    'percent',
  );

  // 18 months of data for every site
  const cocs = await listOptionCombos(db, sexAge.id as string);
  const now = periodContaining('MONTHLY', new Date());
  const periods: string[] = [];
  for (let i = 18; i >= 1; i--) periods.push(formatPeriod(offsetPeriod(now, -i)));

  const DEFAULT_COC = '019754a0-0000-7000-8000-00000000c0c1';
  const ops: Array<Record<string, unknown>> = [];
  const value = (deId: string, ouId: string, period: string, cocId: string, v: number) =>
    ops.push({
      opId: uuidv7(),
      kind: 'dataValue.upsert',
      clientTs: new Date().toISOString(),
      payload: {
        id: uuidv7(),
        dataElementId: deId,
        orgUnitId: ouId,
        period,
        categoryOptionComboId: cocId,
        value: String(v),
      },
    });

  for (const site of sites) {
    let waterPoints = 5 + Math.floor(rand() * 10);
    for (const period of periods) {
      waterPoints += Math.floor(rand() * 2);
      value(
        deBoreholes.id as string,
        site.id,
        period,
        DEFAULT_COC,
        Math.floor(rand() * 4),
      );
      value(deWaterPoints.id as string, site.id, period, DEFAULT_COC, waterPoints);
      value(
        deLatrines.id as string,
        site.id,
        period,
        DEFAULT_COC,
        Math.floor(rand() * 12),
      );
      value(
        deHygieneSessions.id as string,
        site.id,
        period,
        DEFAULT_COC,
        1 + Math.floor(rand() * 5),
      );
      for (const coc of cocs) {
        value(
          dePeopleWater.id as string,
          site.id,
          period,
          coc.id,
          20 + Math.floor(rand() * 80),
        );
        value(
          dePeopleSan.id as string,
          site.id,
          period,
          coc.id,
          10 + Math.floor(rand() * 60),
        );
      }
    }
  }

  // push in batches of 200 through the real sync path (audited, journaled)
  const deviceId = uuidv7();
  for (let i = 0; i < ops.length; i += 200) {
    const results = await push(db, adminUser, deviceId, ops.slice(i, i + 200) as never);
    const bad = results.find((r) => r.status !== 'applied');
    if (bad) throw new Error(`seed push failed: ${JSON.stringify(bad)}`);
  }
  // targets for the headline indicators at every region + site, derived from
  // the actual annual value so the map shows a real green/amber/red spread
  const { runAnalytics } = await import('./services/analytics.js');
  const targets = makeCrud((await import('./db/schema.js')).target, 'target');
  const thisYear = formatPeriod(periodContaining('YEARLY', new Date()));
  const targetOus = [...regionUnits, ...sites].map((o) => o.id);
  // achievement factors cycle to spread units across the legend buckets
  const factors = [1.25, 1.08, 0.96, 0.82, 0.64, 1.15, 0.9, 0.72];
  let fi = 0;
  for (const ind of [indPeopleWater, indWaterPoints, indBoreholes]) {
    const res = await runAnalytics(db, adminUser, {
      dx: [ind.id as string],
      ou: targetOus,
      pe: [thisYear],
      ouMode: 'subtree',
      peTotal: false,
    });
    for (const row of res.rows) {
      if (row.value === null || row.value <= 0) continue;
      const factor = factors[fi++ % factors.length]!;
      await targets.create(db, {
        indicatorId: ind.id as string,
        orgUnitId: row.ou,
        period: thisYear,
        value: Math.max(1, Math.round(row.value / factor)),
        kind: 'target',
      });
    }
  }

  // an overview dashboard so a fresh install opens to something judgeable
  const { createDashboard } = await import('./services/metadata/dashboards.js');
  const widget = (
    kind: 'kpi' | 'chart' | 'map' | 'table',
    config: Record<string, unknown>,
    grid: [number, number, number, number],
  ) => ({
    id: uuidv7(),
    kind,
    config: { ouIds: [country.id as string], ouMode: 'subtree', ...config },
    gridX: grid[0],
    gridY: grid[1],
    gridW: grid[2],
    gridH: grid[3],
  });
  await createDashboard(db, {
    name: 'WASH overview',
    code: 'DASH-WASH',
    shared: true,
    items: [
      widget(
        'kpi',
        {
          title: 'People with safe water (12m)',
          dx: [indPeopleWater.id],
          relativePeriod: 'LAST_12_MONTHS',
        },
        [0, 0, 4, 2],
      ),
      widget(
        'kpi',
        {
          title: 'Functional water points',
          dx: [indWaterPoints.id],
          relativePeriod: 'LAST_MONTH',
        },
        [4, 0, 4, 2],
      ),
      widget(
        'kpi',
        {
          title: 'Boreholes rehabilitated (12m)',
          dx: [indBoreholes.id],
          relativePeriod: 'LAST_12_MONTHS',
        },
        [8, 0, 4, 2],
      ),
      widget(
        'chart',
        {
          title: 'People reached, monthly',
          dx: [indPeopleWater.id],
          relativePeriod: 'LAST_12_MONTHS',
          chartKind: 'line',
        },
        [0, 2, 8, 4],
      ),
      widget(
        'map',
        {
          title: 'Coverage by site',
          dx: [indPeopleWater.id],
          relativePeriod: 'LAST_MONTH',
        },
        [8, 2, 4, 4],
      ),
      widget(
        'chart',
        {
          title: 'Boreholes by month',
          dx: [indBoreholes.id],
          relativePeriod: 'LAST_6_MONTHS',
          chartKind: 'bar',
        },
        [0, 6, 6, 3],
      ),
      widget(
        'table',
        {
          title: '% female of people reached',
          dx: [indPctFemale.id],
          relativePeriod: 'LAST_3_MONTHS',
        },
        [6, 6, 6, 3],
      ),
    ],
  });

  // --- v0.2.0 demo additions --------------------------------------------------
  const programId = wash.id as string;

  // nested disaggregation (spec §16.1): a service ladder with a child option
  const serviceLevel = await categories.create(db, {
    name: 'Service level',
    code: 'SVCLVL',
  });
  const safelyManaged = await categoryOptions.create(db, {
    categoryId: serviceLevel.id as string,
    name: 'Safely managed',
    code: 'SVC-SAFE',
    sortOrder: 0,
  });
  await categoryOptions.create(db, {
    categoryId: serviceLevel.id as string,
    parentId: safelyManaged.id as string,
    name: 'Safely managed — National',
    code: 'SVC-SAFE-NAT',
    sortOrder: 0,
  });

  // media evidence requirement (spec §16.3): a required photo on boreholes
  const evidenceReqs = makeCrud(evidenceRequirement, 'evidence requirement');
  await evidenceReqs.create(db, {
    dataElementId: deBoreholes.id as string,
    evidenceType: 'photo',
    isRequired: true,
    instructions: 'Photograph the rehabilitated borehole',
  });

  // two frameworks (spec §16.7): internal + USAID donor, each mapping boreholes
  const frameworks = makeCrud(framework, 'framework');
  const frameworkLevels = makeCrud(frameworkLevel, 'framework level');
  const frameworkNodes = makeCrud(frameworkNode, 'framework node');
  for (const [name, isInternal] of [
    ['WASH internal framework', true],
    ['USAID Results Framework', false],
  ] as const) {
    const fw = await frameworks.create(db, { programId, name, isInternal });
    const level = await frameworkLevels.create(db, {
      frameworkId: fw.id as string,
      name: isInternal ? 'Outcome' : 'Development Objective',
      levelOrder: 1,
    });
    const node = await frameworkNodes.create(db, {
      frameworkId: fw.id as string,
      levelId: level.id as string,
      title: isInternal ? 'Improved water access' : 'DO 1: Resilient communities',
    });
    await db.insert(indicatorFrameworkMapping).values({
      id: uuidv7(),
      indicatorId: indBoreholes.id as string,
      nodeId: node.id as string,
      isPrimary: isInternal,
    });
  }

  // one export template (spec §16.11): a generated workbook with a RAG column
  const exportTemplates = makeCrud(exportTemplate, 'export template');
  await exportTemplates.create(db, {
    programId,
    name: 'Quarterly board report',
    outputFormat: 'excel',
    templateType: 'internal',
    periodType: 'relative',
    flags: { include_rag: true },
  });

  console.log(
    `seeded: ${sites.length + 5} org units, 6 data elements, 12 indicators, ${ops.length} values across ${periods.length} months; ` +
      'plus nested disaggregation, a photo evidence requirement, 2 frameworks, and an export template (v0.2.0)',
  );
}

async function main() {
  const config = loadConfig();
  await runMigrations(config.DATABASE_URL);
  const pool = createPool(config.DATABASE_URL);
  const db = createDb(pool);
  try {
    const force = process.argv.includes('--force');
    const existing = await db
      .select({ id: program.id })
      .from(program)
      .where(isNull(program.deletedAt))
      .limit(1);
    if (existing.length > 0 && !force) {
      console.error('instance already has data — re-run with --force to seed anyway');
      process.exit(1);
    }
    await bootstrapAdmin(db);
    const { buildAuthUser } = await import('./services/auth.js');
    const admins = await db
      .select()
      .from((await import('./db/schema.js')).user)
      .limit(1);
    const adminUser = await buildAuthUser(db, admins[0]!.id);
    await seedDemo(db, adminUser);
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
