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
} from './db/schema.js';
import { createOrgUnit } from './services/metadata/org-units.js';
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

  await programs.create(db, {
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
    for (let s = 1; s <= 9; s++) {
      const [lon, lat] = baseCoords[r]!;
      sites.push(
        await createOrgUnit(db, {
          name: `${regionNames[r]} Site ${s}`,
          shortName: `${regionNames[r]![0]}S${s}`,
          code: `DL-${regionNames[r]![0]}-S${s}`,
          parentId: region.id,
          openingDate: '2020-01-01',
          closedDate: null,
          geometry: {
            type: 'Point',
            coordinates: [lon + (rand() - 0.5) * 0.6, lat + (rand() - 0.5) * 0.6],
          },
          attributes: {},
        }),
      );
    }
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
  await ind('Boreholes rehabilitated (total)', 'IND-BOREHOLES', '#{DE-BOREHOLES}', '1');
  await ind('Functional water points', 'IND-WATERPOINTS', '#{DE-WATERPOINTS}', '1');
  await ind('People with safe water', 'IND-PEOPLE-WATER', '#{DE-PEOPLE-WATER}', '1');
  await ind(
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
  console.log(
    `seeded: ${sites.length + 5} org units, 6 data elements, 12 indicators, ${ops.length} values across ${periods.length} months`,
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
