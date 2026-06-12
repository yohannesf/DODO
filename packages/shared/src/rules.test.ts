import { describe, expect, it } from 'vitest';
import { evaluateRules, rulesForDataset, type RuleContext } from './rules.js';

const ctx: RuleContext = {
  dataElements: [
    { id: 'de-people', code: 'DE-PEOPLE' },
    { id: 'de-total', code: 'DE-TOTAL' },
  ],
  categoryOptions: [
    { id: 'opt-f', code: 'SEX-F' },
    { id: 'opt-m', code: 'SEX-M' },
  ],
  categoryOptionCombos: [
    { id: 'coc-f', optionIds: ['opt-f'] },
    { id: 'coc-m', optionIds: ['opt-m'] },
    { id: 'coc-default', optionIds: [] },
  ],
  values: [
    { dataElementId: 'de-people', categoryOptionComboId: 'coc-f', value: '30' },
    { dataElementId: 'de-people', categoryOptionComboId: 'coc-m', value: '25' },
    { dataElementId: 'de-total', categoryOptionComboId: 'coc-default', value: '50' },
  ],
};

const rule = (overrides: Record<string, unknown>) => ({
  id: 'r1',
  name: 'consistency',
  leftExpr: '#{DE-PEOPLE}',
  op: '<=' as const,
  rightExpr: '#{DE-TOTAL}',
  severity: 'warning' as const,
  instruction: 'check totals',
  ...overrides,
});

describe('evaluateRules', () => {
  it('sums across combos for bare refs', () => {
    const [r] = evaluateRules([rule({})], ctx);
    expect(r!.left).toBe(55);
    expect(r!.right).toBe(50);
    expect(r!.ok).toBe(false); // 55 <= 50 fails
  });

  it('narrows to combos containing an option code', () => {
    const [r] = evaluateRules(
      [rule({ leftExpr: '#{DE-PEOPLE.SEX-F}', op: '=', rightExpr: '30' })],
      ctx,
    );
    expect(r!.left).toBe(30);
    expect(r!.ok).toBe(true);
  });

  it('returns ok=null when operands are missing', () => {
    const [r] = evaluateRules([rule({ leftExpr: '#{DE-MISSING}' })], ctx);
    expect(r!.ok).toBeNull();
  });

  it('supports arithmetic across refs', () => {
    const [r] = evaluateRules(
      [
        rule({
          leftExpr: '#{DE-PEOPLE.SEX-F} + #{DE-PEOPLE.SEX-M}',
          op: '=',
          rightExpr: '#{DE-PEOPLE}',
        }),
      ],
      ctx,
    );
    expect(r!.ok).toBe(true);
  });

  it('filters rules by dataset', () => {
    const rules = [
      { datasetIds: [] as string[], id: 'a' },
      { datasetIds: ['ds-1'], id: 'b' },
      { datasetIds: ['ds-2'], id: 'c' },
    ];
    expect(rulesForDataset(rules, 'ds-1').map((r) => r.id)).toEqual(['a', 'b']);
  });
});
