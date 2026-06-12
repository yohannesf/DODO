import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  collectRefs,
  evaluate,
  evaluateExpression,
  parseExpression,
  type RefResolver,
} from './index.js';

const none: RefResolver = () => null;
const fixed =
  (values: Record<string, number>): RefResolver =>
  (de, coc) =>
    values[coc ? `${de}.${coc}` : de] ?? null;

describe('parseExpression', () => {
  it('parses arithmetic with precedence', () => {
    expect(evaluate('1 + 2 * 3', none)).toBe(7);
    expect(evaluate('(1 + 2) * 3', none)).toBe(9);
    expect(evaluate('10 / 4', none)).toBe(2.5);
    expect(evaluate('2 - 3 - 4', none)).toBe(-5); // left associative
  });

  it('parses unary minus', () => {
    expect(evaluate('-3 + 5', none)).toBe(2);
    expect(evaluate('2 * -3', none)).toBe(-6);
  });

  it('parses refs with and without coc', () => {
    const refs = collectRefs(parseExpression('#{DE-A} + #{DE-B.COC1} * 2'));
    expect(refs).toEqual([
      { kind: 'ref', dataElementCode: 'DE-A', cocCode: null },
      { kind: 'ref', dataElementCode: 'DE-B', cocCode: 'COC1' },
    ]);
  });

  it('parses functions', () => {
    expect(evaluate('min(3, 1, 2)', none)).toBe(1);
    expect(evaluate('max(3, 1)', none)).toBe(3);
    expect(evaluate('abs(0 - 5)', none)).toBe(5);
    expect(evaluate('round(3.456, 2)', none)).toBe(3.46);
    expect(evaluate('round(3.456)', none)).toBe(3);
    expect(evaluate('if(1, 10, 20)', none)).toBe(10);
    expect(evaluate('if(0, 10, 20)', none)).toBe(20);
  });

  it('rejects malformed input', () => {
    for (const bad of [
      '',
      '1 +',
      '(1',
      '1)',
      'foo(1)',
      '#{}',
      '#{a b}',
      '1..2',
      '1 2',
      'if(1,2)',
      'min(1)',
      '#x',
    ]) {
      expect(() => parseExpression(bad), bad).toThrow();
    }
  });
});

describe('evaluateExpression', () => {
  it('resolves refs and propagates missing values as null', () => {
    const resolve = fixed({ 'DE-A': 10, 'DE-B.COC1': 4 });
    expect(evaluate('#{DE-A} + #{DE-B.COC1}', resolve)).toBe(14);
    expect(evaluate('#{DE-A} + #{MISSING}', resolve)).toBeNull();
    expect(evaluate('isNull(#{MISSING})', resolve)).toBe(1);
    expect(evaluate('isNull(#{DE-A})', resolve)).toBe(0);
    expect(evaluate('if(isNull(#{MISSING}), 0, #{MISSING})', resolve)).toBe(0);
  });

  it('treats division by zero as null, never Infinity', () => {
    expect(evaluate('1 / 0', none)).toBeNull();
    expect(evaluate('1 / (2 - 2)', none)).toBeNull();
  });

  it('property: numeric expressions never throw and never return NaN/∞', () => {
    const arbExpr = fc.letrec<{ expr: string }>((tie) => ({
      expr: fc.oneof(
        { maxDepth: 6, withCrossShrink: true },
        fc.nat({ max: 9999 }).map((n) => String(n)),
        fc
          .tuple(tie('expr'), fc.constantFrom('+', '-', '*', '/'), tie('expr'))
          .map(([l, op, r]) => `(${l} ${op} ${r})`),
        fc.tuple(tie('expr'), tie('expr')).map(([a, b]) => `min(${a}, ${b})`),
        fc.tuple(tie('expr')).map(([a]) => `abs(${a})`),
      ),
    })).expr;

    fc.assert(
      fc.property(arbExpr, (src) => {
        const result = evaluate(src, none);
        return result === null || Number.isFinite(result);
      }),
      { numRuns: 300 },
    );
  });

  it('property: parse → evaluate equals direct evaluation for round trips', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -1000, max: 1000 }),
        fc.integer({ min: -1000, max: 1000 }),
        (a, b) => {
          const node = parseExpression(`${a} + ${b}`.replace('+ -', '- '));
          return evaluateExpression(node, none) === a + b;
        },
      ),
      { numRuns: 200 },
    );
  });
});
