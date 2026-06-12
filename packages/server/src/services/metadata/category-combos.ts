import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import {
  generateCategoryOptionCombos,
  uuidv7,
  type CategoryCombo,
  type CategoryOptionCombo,
  type CocCategoryInput,
} from '@dodo/shared';
import type { Db } from '../../db/index.js';
import {
  category,
  categoryCombo,
  categoryComboCategories,
  categoryOption,
  categoryOptionCombo,
  dataElement,
} from '../../db/schema.js';
import { badRequest, notFound } from '../../lib/errors.js';

const live = isNull(categoryCombo.deletedAt);

interface ComboInput {
  name: string;
  code: string;
  categoryIds: string[];
}

async function loadCocCategories(
  db: Db,
  categoryIds: string[],
): Promise<CocCategoryInput[]> {
  const cats = await db
    .select({ id: category.id, name: category.name })
    .from(category)
    .where(and(inArray(category.id, categoryIds), isNull(category.deletedAt)));
  const byId = new Map(cats.map((c) => [c.id, c]));
  const missing = categoryIds.filter((id) => !byId.has(id));
  if (missing.length > 0) throw badRequest(`unknown categories: ${missing.join(', ')}`);

  const options = await db
    .select({
      id: categoryOption.id,
      name: categoryOption.name,
      sortOrder: categoryOption.sortOrder,
      categoryId: categoryOption.categoryId,
    })
    .from(categoryOption)
    .where(
      and(
        inArray(categoryOption.categoryId, categoryIds),
        isNull(categoryOption.deletedAt),
      ),
    );

  // keep caller's category order — it defines entry-grid column nesting
  return categoryIds.map((id) => ({
    id,
    name: byId.get(id)!.name,
    options: options.filter((o) => o.categoryId === id),
  }));
}

/**
 * Materialise the combo's category option combos (spec §4.4). Existing COCs
 * with an identical option set keep their id; obsolete ones are removed.
 */
async function materialiseCocs(db: Db, comboId: string, categoryIds: string[]) {
  const generated = generateCategoryOptionCombos(
    await loadCocCategories(db, categoryIds),
  );
  const existing = await db
    .select()
    .from(categoryOptionCombo)
    .where(eq(categoryOptionCombo.comboId, comboId));

  const key = (ids: string[]) => ids.join('|');
  const existingByKey = new Map(existing.map((c) => [key(c.optionIds), c]));
  const generatedKeys = new Set(generated.map((g) => key(g.optionIds)));

  const obsolete = existing.filter((c) => !generatedKeys.has(key(c.optionIds)));
  if (obsolete.length > 0) {
    await db.delete(categoryOptionCombo).where(
      inArray(
        categoryOptionCombo.id,
        obsolete.map((c) => c.id),
      ),
    );
  }
  for (const g of generated) {
    const found = existingByKey.get(key(g.optionIds));
    if (found) {
      if (found.name !== g.name) {
        await db
          .update(categoryOptionCombo)
          .set({ name: g.name })
          .where(eq(categoryOptionCombo.id, found.id));
      }
    } else {
      await db.insert(categoryOptionCombo).values({
        id: uuidv7(),
        comboId,
        name: g.name,
        optionIds: g.optionIds,
      });
    }
  }
}

async function comboWithCategories(db: Db, id: string): Promise<CategoryCombo> {
  const combos = await db
    .select()
    .from(categoryCombo)
    .where(and(eq(categoryCombo.id, id), live));
  if (!combos[0]) throw notFound('category combo');
  const links = await db
    .select()
    .from(categoryComboCategories)
    .where(eq(categoryComboCategories.comboId, id))
    .orderBy(asc(categoryComboCategories.sortOrder));
  return {
    ...combos[0],
    categoryIds: links.map((l) => l.categoryId),
  } as unknown as CategoryCombo;
}

export async function listCategoryCombos(db: Db): Promise<CategoryCombo[]> {
  const combos = await db.select().from(categoryCombo).where(live);
  const links = await db
    .select()
    .from(categoryComboCategories)
    .orderBy(asc(categoryComboCategories.sortOrder));
  return combos.map(
    (c) =>
      ({
        ...c,
        categoryIds: links.filter((l) => l.comboId === c.id).map((l) => l.categoryId),
      }) as unknown as CategoryCombo,
  );
}

export const getCategoryCombo = comboWithCategories;

export async function createCategoryCombo(
  db: Db,
  input: ComboInput,
  actor?: string,
  presetId?: string, // bundle import keeps ids stable across instances
): Promise<CategoryCombo> {
  const id = presetId ?? uuidv7();
  return db.transaction(async (tx) => {
    const txDb = tx as unknown as Db;
    await tx.insert(categoryCombo).values({
      id,
      name: input.name,
      code: input.code,
      createdBy: actor,
      updatedBy: actor,
    });
    await tx.insert(categoryComboCategories).values(
      input.categoryIds.map((categoryId, idx) => ({
        comboId: id,
        categoryId,
        sortOrder: idx,
      })),
    );
    await materialiseCocs(txDb, id, input.categoryIds);
    return comboWithCategories(txDb, id);
  });
}

export async function updateCategoryCombo(
  db: Db,
  id: string,
  patch: Partial<ComboInput>,
  actor?: string,
): Promise<CategoryCombo> {
  const current = await comboWithCategories(db, id);
  return db.transaction(async (tx) => {
    const txDb = tx as unknown as Db;
    await tx
      .update(categoryCombo)
      .set({
        name: patch.name ?? current.name,
        code: patch.code ?? current.code,
        updatedBy: actor,
        updatedAt: sql`now()`,
        version: sql`${categoryCombo.version} + 1`,
      })
      .where(eq(categoryCombo.id, id));

    if (
      patch.categoryIds &&
      patch.categoryIds.join(',') !== current.categoryIds.join(',')
    ) {
      // Once data values exist (M3+), combo changes on referenced data
      // elements must be blocked to protect historical comparability.
      await tx
        .delete(categoryComboCategories)
        .where(eq(categoryComboCategories.comboId, id));
      await tx.insert(categoryComboCategories).values(
        patch.categoryIds.map((categoryId, idx) => ({
          comboId: id,
          categoryId,
          sortOrder: idx,
        })),
      );
      await materialiseCocs(txDb, id, patch.categoryIds);
    }
    return comboWithCategories(txDb, id);
  });
}

export async function deleteCategoryCombo(
  db: Db,
  id: string,
  actor?: string,
): Promise<void> {
  await comboWithCategories(db, id);
  const refs = await db
    .select({ id: dataElement.id })
    .from(dataElement)
    .where(and(eq(dataElement.categoryComboId, id), isNull(dataElement.deletedAt)))
    .limit(1);
  if (refs.length > 0) {
    throw badRequest('category combo is used by data elements');
  }
  await db
    .update(categoryCombo)
    .set({
      deletedAt: sql`now()`,
      updatedBy: actor,
      updatedAt: sql`now()`,
      version: sql`${categoryCombo.version} + 1`,
    })
    .where(eq(categoryCombo.id, id));
}

export async function listOptionCombos(
  db: Db,
  comboId: string,
): Promise<CategoryOptionCombo[]> {
  await comboWithCategories(db, comboId);
  const rows = await db
    .select()
    .from(categoryOptionCombo)
    .where(eq(categoryOptionCombo.comboId, comboId))
    .orderBy(asc(categoryOptionCombo.name));
  return rows as CategoryOptionCombo[];
}

/** Re-materialise COCs of every live combo containing this category. */
export async function rematerialiseCombosForCategory(
  db: Db,
  categoryId: string,
): Promise<void> {
  const links = await db
    .select({ comboId: categoryComboCategories.comboId })
    .from(categoryComboCategories)
    .where(eq(categoryComboCategories.categoryId, categoryId));
  for (const { comboId } of links) {
    const combo = await comboWithCategories(db, comboId).catch(() => null);
    if (combo) await materialiseCocs(db, comboId, combo.categoryIds);
  }
}
