// Expression engine (spec §4.6) — hand-written recursive descent, no eval,
// no Function. Used by validation rules (client + server, M3) and indicator
// formulas (M4).
//
//   expr     := term (('+'|'-') term)*
//   term     := factor (('*'|'/') factor)*
//   factor   := NUMBER | ref | '(' expr ')' | func '(' args ')'
//   ref      := '#{' dataElementCode ('.' cocCode)? '}'
//   func     := if | isNull | min | max | abs | round

export interface RefNode {
  kind: 'ref';
  dataElementCode: string;
  cocCode: string | null;
}
export type ExprNode =
  | { kind: 'number'; value: number }
  | RefNode
  | { kind: 'binary'; op: '+' | '-' | '*' | '/'; left: ExprNode; right: ExprNode }
  | { kind: 'call'; fn: FuncName; args: ExprNode[] };

export const FUNC_NAMES = ['if', 'isNull', 'min', 'max', 'abs', 'round'] as const;
export type FuncName = (typeof FUNC_NAMES)[number];

const FUNC_ARITY: Record<FuncName, [number, number]> = {
  if: [3, 3],
  isNull: [1, 1],
  min: [2, Infinity],
  max: [2, Infinity],
  abs: [1, 1],
  round: [1, 2],
};

export class ExprError extends Error {
  constructor(
    message: string,
    public position: number,
  ) {
    super(`${message} (at ${position})`);
  }
}

interface Token {
  type: 'number' | 'ref' | 'ident' | 'punct';
  value: string;
  pos: number;
}

function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i]!;
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
      i++;
      continue;
    }
    if (c >= '0' && c <= '9') {
      const start = i;
      while (i < src.length && /[0-9.]/.test(src[i]!)) i++;
      const text = src.slice(start, i);
      if (!/^\d+(\.\d+)?$/.test(text)) throw new ExprError('malformed number', start);
      tokens.push({ type: 'number', value: text, pos: start });
      continue;
    }
    if (c === '#') {
      if (src[i + 1] !== '{') throw new ExprError("expected '{' after '#'", i);
      const end = src.indexOf('}', i + 2);
      if (end === -1) throw new ExprError('unterminated reference', i);
      const body = src.slice(i + 2, end);
      if (!/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(body)) {
        throw new ExprError('invalid reference', i);
      }
      tokens.push({ type: 'ref', value: body, pos: i });
      i = end + 1;
      continue;
    }
    if (/[A-Za-z]/.test(c)) {
      const start = i;
      while (i < src.length && /[A-Za-z]/.test(src[i]!)) i++;
      tokens.push({ type: 'ident', value: src.slice(start, i), pos: start });
      continue;
    }
    if ('+-*/(),'.includes(c)) {
      tokens.push({ type: 'punct', value: c, pos: i });
      i++;
      continue;
    }
    throw new ExprError(`unexpected character '${c}'`, i);
  }
  return tokens;
}

class Parser {
  private pos = 0;
  constructor(private tokens: Token[]) {}

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }
  private next(): Token {
    const t = this.tokens[this.pos++];
    if (!t) throw new ExprError('unexpected end of expression', -1);
    return t;
  }
  private expectPunct(value: string) {
    const t = this.next();
    if (t.type !== 'punct' || t.value !== value) {
      throw new ExprError(`expected '${value}'`, t.pos);
    }
  }

  parse(): ExprNode {
    const node = this.expr();
    const trailing = this.peek();
    if (trailing) throw new ExprError('unexpected trailing input', trailing.pos);
    return node;
  }

  private expr(): ExprNode {
    let left = this.term();
    for (;;) {
      const t = this.peek();
      if (t?.type === 'punct' && (t.value === '+' || t.value === '-')) {
        this.next();
        left = { kind: 'binary', op: t.value, left, right: this.term() };
      } else {
        return left;
      }
    }
  }

  private term(): ExprNode {
    let left = this.factor();
    for (;;) {
      const t = this.peek();
      if (t?.type === 'punct' && (t.value === '*' || t.value === '/')) {
        this.next();
        left = { kind: 'binary', op: t.value, left, right: this.factor() };
      } else {
        return left;
      }
    }
  }

  private factor(): ExprNode {
    const t = this.next();
    if (t.type === 'number') {
      return { kind: 'number', value: Number(t.value) };
    }
    if (t.type === 'ref') {
      const dot = t.value.indexOf('.');
      return dot === -1
        ? { kind: 'ref', dataElementCode: t.value, cocCode: null }
        : {
            kind: 'ref',
            dataElementCode: t.value.slice(0, dot),
            cocCode: t.value.slice(dot + 1),
          };
    }
    if (t.type === 'punct' && t.value === '(') {
      const inner = this.expr();
      this.expectPunct(')');
      return inner;
    }
    if (t.type === 'punct' && t.value === '-') {
      // unary minus as 0 - factor
      return {
        kind: 'binary',
        op: '-',
        left: { kind: 'number', value: 0 },
        right: this.factor(),
      };
    }
    if (t.type === 'ident') {
      if (!(FUNC_NAMES as readonly string[]).includes(t.value)) {
        throw new ExprError(`unknown function '${t.value}'`, t.pos);
      }
      const fn = t.value as FuncName;
      this.expectPunct('(');
      const args: ExprNode[] = [];
      if (!(this.peek()?.type === 'punct' && this.peek()?.value === ')')) {
        args.push(this.expr());
        while (this.peek()?.type === 'punct' && this.peek()?.value === ',') {
          this.next();
          args.push(this.expr());
        }
      }
      this.expectPunct(')');
      const [min, max] = FUNC_ARITY[fn];
      if (args.length < min || args.length > max) {
        throw new ExprError(`${fn} expects ${min === max ? min : `${min}+`} args`, t.pos);
      }
      return { kind: 'call', fn, args };
    }
    throw new ExprError(`unexpected '${t.value}'`, t.pos);
  }
}

export function parseExpression(src: string): ExprNode {
  if (src.trim() === '') throw new ExprError('empty expression', 0);
  return new Parser(tokenize(src)).parse();
}

/** All #{…} references in an expression — used for autocomplete + analytics. */
export function collectRefs(node: ExprNode, into: RefNode[] = []): RefNode[] {
  switch (node.kind) {
    case 'ref':
      into.push(node);
      break;
    case 'binary':
      collectRefs(node.left, into);
      collectRefs(node.right, into);
      break;
    case 'call':
      for (const a of node.args) collectRefs(a, into);
      break;
    case 'number':
      break;
  }
  return into;
}

/**
 * Value lookup: `code` or `code.cocCode` → number, or null when missing.
 * Missing refs make arithmetic evaluate to null (skip), except inside
 * isNull()/if() which observe them.
 */
export type RefResolver = (
  dataElementCode: string,
  cocCode: string | null,
) => number | null;

export function evaluateExpression(node: ExprNode, resolve: RefResolver): number | null {
  switch (node.kind) {
    case 'number':
      return node.value;
    case 'ref':
      return resolve(node.dataElementCode, node.cocCode);
    case 'binary': {
      const l = evaluateExpression(node.left, resolve);
      const r = evaluateExpression(node.right, resolve);
      if (l === null || r === null) return null;
      switch (node.op) {
        case '+':
          return l + r;
        case '-':
          return l - r;
        case '*':
          return l * r;
        case '/':
          return r === 0 ? null : l / r;
      }
      break;
    }
    case 'call': {
      const fn = node.fn;
      if (fn === 'isNull') {
        return evaluateExpression(node.args[0]!, resolve) === null ? 1 : 0;
      }
      if (fn === 'if') {
        const cond = evaluateExpression(node.args[0]!, resolve);
        if (cond === null) return null;
        return evaluateExpression(node.args[cond !== 0 ? 1 : 2]!, resolve);
      }
      const args = node.args.map((a) => evaluateExpression(a, resolve));
      if (args.some((a) => a === null)) return null;
      const nums = args as number[];
      switch (fn) {
        case 'min':
          return Math.min(...nums);
        case 'max':
          return Math.max(...nums);
        case 'abs':
          return Math.abs(nums[0]!);
        case 'round': {
          const places = nums[1] ?? 0;
          const f = 10 ** places;
          return Math.round(nums[0]! * f) / f;
        }
      }
    }
  }
  return null;
}

export function evaluate(src: string, resolve: RefResolver): number | null {
  return evaluateExpression(parseExpression(src), resolve);
}
