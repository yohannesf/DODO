// Value validation by value type (spec §7.3) — the client validates at entry
// time and the server re-validates on push with this same code.
import type { ValueType } from './metadata.js';

export interface ValueCheckContext {
  /** option codes, required for OPTION value type */
  optionCodes?: string[];
}

const INT_RE = /^-?\d+$/;

export function validateValue(
  valueType: ValueType,
  value: string,
  ctx: ValueCheckContext = {},
): string | null {
  switch (valueType) {
    case 'INTEGER':
      return INT_RE.test(value) ? null : 'must be a whole number';
    case 'INTEGER_POSITIVE':
      return INT_RE.test(value) && Number(value) > 0
        ? null
        : 'must be a positive whole number';
    case 'INTEGER_ZERO_OR_POSITIVE':
      return INT_RE.test(value) && Number(value) >= 0
        ? null
        : 'must be zero or a positive whole number';
    case 'NUMBER':
      return value !== '' && Number.isFinite(Number(value)) ? null : 'must be a number';
    case 'PERCENTAGE': {
      const n = Number(value);
      return value !== '' && Number.isFinite(n) && n >= 0 && n <= 100
        ? null
        : 'must be between 0 and 100';
    }
    case 'BOOLEAN':
      return value === 'true' || value === 'false' ? null : 'must be true or false';
    case 'TEXT':
      return value.length <= 50_000 ? null : 'too long';
    case 'LONG_TEXT':
      return null;
    case 'DATE': {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
      if (!m) return 'must be a date (YYYY-MM-DD)';
      const d = new Date(`${value}T00:00:00Z`);
      return Number.isNaN(d.getTime()) || value !== d.toISOString().slice(0, 10)
        ? 'must be a valid calendar date'
        : null;
    }
    case 'OPTION':
      return ctx.optionCodes?.includes(value)
        ? null
        : 'must be one of the configured options';
    case 'COORDINATE': {
      try {
        const c = JSON.parse(value) as unknown;
        if (
          Array.isArray(c) &&
          c.length === 2 &&
          typeof c[0] === 'number' &&
          typeof c[1] === 'number' &&
          c[0] >= -180 &&
          c[0] <= 180 &&
          c[1] >= -90 &&
          c[1] <= 90
        ) {
          return null;
        }
      } catch {
        /* fall through */
      }
      return 'must be [longitude, latitude]';
    }
    case 'FILE':
      return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value)
        ? null
        : 'must be a file reference';
  }
}
