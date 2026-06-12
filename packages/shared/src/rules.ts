// Validation rule evaluation (spec §3, §8.3) — runs identically at entry
// time (client, offline) and server-side.
//
// Reference semantics: `#{DE_CODE}` aggregates the element's numeric values
// across all of its category option combos; `#{DE_CODE.OPTION_CODE}` narrows
// to combos containing that category option (option codes are unique).
import { evaluateExpression, parseExpression, type ExprNode } from './expr/index.js';
import type { Severity, ValidationOp, ValidationRule } from './metadata.js';

export interface RuleValue {
  dataElementId: string;
  categoryOptionComboId: string;
  value: string;
}

export interface RuleContext {
  values: RuleValue[];
  dataElements: Array<{ id: string; code: string }>;
  categoryOptionCombos: Array<{ id: string; optionIds: string[] }>;
  categoryOptions: Array<{ id: string; code: string }>;
}

export interface RuleResult {
  ruleId: string;
  name: string;
  severity: Severity;
  instruction: string;
  /** null when the rule could not be evaluated (missing operands) */
  ok: boolean | null;
  left: number | null;
  right: number | null;
  display: string;
}

function compare(left: number, op: ValidationOp, right: number): boolean {
  const EPS = 1e-9;
  switch (op) {
    case '<':
      return left < right - EPS;
    case '<=':
      return left <= right + EPS;
    case '=':
      return Math.abs(left - right) <= EPS;
    case '!=':
      return Math.abs(left - right) > EPS;
    case '>=':
      return left >= right - EPS;
    case '>':
      return left > right + EPS;
  }
}

export function makeRuleResolver(ctx: RuleContext) {
  const deByCode = new Map(ctx.dataElements.map((d) => [d.code, d.id]));
  const optionByCode = new Map(ctx.categoryOptions.map((o) => [o.code, o.id]));
  const cocOptions = new Map(
    ctx.categoryOptionCombos.map((c) => [c.id, new Set(c.optionIds)]),
  );
  const valuesByDe = new Map<string, RuleValue[]>();
  for (const v of ctx.values) {
    const list = valuesByDe.get(v.dataElementId) ?? [];
    list.push(v);
    valuesByDe.set(v.dataElementId, list);
  }

  return (dataElementCode: string, cocCode: string | null): number | null => {
    const deId = deByCode.get(dataElementCode);
    if (!deId) return null;
    let rows = valuesByDe.get(deId) ?? [];
    if (cocCode !== null) {
      const optionId = optionByCode.get(cocCode);
      if (!optionId) return null;
      rows = rows.filter((r) => cocOptions.get(r.categoryOptionComboId)?.has(optionId));
    }
    const nums = rows.map((r) => Number(r.value)).filter((n) => Number.isFinite(n));
    if (nums.length === 0) return null;
    return nums.reduce((a, b) => a + b, 0);
  };
}

export interface ApplicableRule extends Pick<
  ValidationRule,
  'id' | 'name' | 'leftExpr' | 'op' | 'rightExpr' | 'severity' | 'instruction'
> {
  datasetIds?: string[];
}

export function rulesForDataset<T extends { datasetIds?: string[] }>(
  rules: T[],
  datasetId: string,
): T[] {
  return rules.filter(
    (r) => !r.datasetIds || r.datasetIds.length === 0 || r.datasetIds.includes(datasetId),
  );
}

export function evaluateRules(rules: ApplicableRule[], ctx: RuleContext): RuleResult[] {
  const resolve = makeRuleResolver(ctx);
  return rules.map((rule) => {
    let left: number | null = null;
    let right: number | null = null;
    let leftNode: ExprNode | null = null;
    let rightNode: ExprNode | null = null;
    try {
      leftNode = parseExpression(rule.leftExpr);
      rightNode = parseExpression(rule.rightExpr);
    } catch {
      /* unparseable rule → not evaluable */
    }
    if (leftNode && rightNode) {
      left = evaluateExpression(leftNode, resolve);
      right = evaluateExpression(rightNode, resolve);
    }
    const ok = left === null || right === null ? null : compare(left, rule.op, right);
    return {
      ruleId: rule.id,
      name: rule.name,
      severity: rule.severity,
      instruction: rule.instruction,
      ok,
      left,
      right,
      display: `${rule.leftExpr} ${rule.op} ${rule.rightExpr}`,
    };
  });
}
