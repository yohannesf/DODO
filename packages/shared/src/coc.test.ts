import { describe, expect, it } from 'vitest';
import { generateCategoryOptionCombos } from './coc.js';

const sex = {
  id: 'c-sex',
  name: 'Sex',
  options: [
    { id: 'o-f', name: 'Female', sortOrder: 0 },
    { id: 'o-m', name: 'Male', sortOrder: 1 },
  ],
};
const age = {
  id: 'c-age',
  name: 'Age',
  options: [
    { id: 'o-0', name: '0–17', sortOrder: 0 },
    { id: 'o-18', name: '18–59', sortOrder: 1 },
    { id: 'o-60', name: '60+', sortOrder: 2 },
  ],
};

describe('generateCategoryOptionCombos', () => {
  it('produces the cartesian product in stable order', () => {
    const cocs = generateCategoryOptionCombos([sex, age]);
    expect(cocs).toHaveLength(6);
    expect(cocs.map((c) => c.name)).toEqual([
      'Female, 0–17',
      'Female, 18–59',
      'Female, 60+',
      'Male, 0–17',
      'Male, 18–59',
      'Male, 60+',
    ]);
    expect(cocs[0]!.optionIds).toEqual(['o-f', 'o-0']);
    expect(cocs[5]!.optionIds).toEqual(['o-m', 'o-60']);
  });

  it('respects option sortOrder over insertion order', () => {
    const shuffled = {
      ...sex,
      options: [sex.options[1]!, sex.options[0]!],
    };
    const cocs = generateCategoryOptionCombos([shuffled]);
    expect(cocs.map((c) => c.name)).toEqual(['Female', 'Male']);
  });

  it('returns the reserved default combo for zero categories', () => {
    expect(generateCategoryOptionCombos([])).toEqual([
      { name: 'default', optionIds: [] },
    ]);
  });

  it('rejects categories without options', () => {
    expect(() =>
      generateCategoryOptionCombos([{ id: 'c', name: 'Empty', options: [] }]),
    ).toThrow(/no options/);
  });
});
