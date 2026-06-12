// Category option combo materialisation (spec §4.4). Shared so the server
// persists exactly what the disaggregation builder previews on the client.

export interface CocCategoryInput {
  id: string;
  name: string;
  options: Array<{ id: string; name: string; sortOrder: number }>;
}

export interface GeneratedCoc {
  /** "Female, 0–17" — option names in category order */
  name: string;
  /** option ids in category order — identity of the combo */
  optionIds: string[];
}

export const DEFAULT_COC_NAME = 'default';

/**
 * Cartesian product of the categories' options, in category order then
 * option sortOrder. Every category must have at least one option.
 */
export function generateCategoryOptionCombos(
  categories: CocCategoryInput[],
): GeneratedCoc[] {
  if (categories.length === 0) return [{ name: DEFAULT_COC_NAME, optionIds: [] }];
  for (const c of categories) {
    if (c.options.length === 0) {
      throw new Error(`category "${c.name}" has no options`);
    }
  }

  let combos: GeneratedCoc[] = [{ name: '', optionIds: [] }];
  for (const category of categories) {
    const sorted = [...category.options].sort(
      (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
    );
    combos = combos.flatMap((partial) =>
      sorted.map((opt) => ({
        name: partial.name === '' ? opt.name : `${partial.name}, ${opt.name}`,
        optionIds: [...partial.optionIds, opt.id],
      })),
    );
  }
  return combos;
}
