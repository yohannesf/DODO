// Period logic (spec §4.3). Periods are encoded as ISO-like strings:
//   2026        YEARLY
//   2026-Q1     QUARTERLY
//   2026-03     MONTHLY
//   2026-W14    WEEKLY
//   2026-03-15  DAILY
//
// M0 stub: parse / format / validate only. Generation, offsetting,
// comparison, humanisation, and fiscal-year offsets land with the data-entry
// milestones — both client and server must keep importing this module.

export const PERIOD_TYPES = [
  'DAILY',
  'WEEKLY',
  'MONTHLY',
  'QUARTERLY',
  'YEARLY',
] as const;

export type PeriodType = (typeof PERIOD_TYPES)[number];

export type Period =
  | { type: 'YEARLY'; year: number }
  | { type: 'QUARTERLY'; year: number; quarter: 1 | 2 | 3 | 4 }
  | { type: 'MONTHLY'; year: number; month: number }
  | { type: 'WEEKLY'; year: number; week: number }
  | { type: 'DAILY'; year: number; month: number; day: number };

const YEARLY_RE = /^(\d{4})$/;
const QUARTERLY_RE = /^(\d{4})-Q([1-4])$/;
const MONTHLY_RE = /^(\d{4})-(\d{2})$/;
const WEEKLY_RE = /^(\d{4})-W(\d{2})$/;
const DAILY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** ISO-8601 weeks in a year: 53 when 1 Jan or 31 Dec falls on a Thursday. */
function isoWeeksInYear(year: number): 52 | 53 {
  const dow = (y: number) => new Date(Date.UTC(y, 0, 1)).getUTCDay();
  return dow(year) === 4 || dow(year + 1) === 5 ? 53 : 52;
}

/**
 * Parse a period string into a structured Period.
 * Returns null when the string is not a valid period encoding.
 */
export function parsePeriod(input: string): Period | null {
  let m = YEARLY_RE.exec(input);
  if (m) return { type: 'YEARLY', year: Number(m[1]) };

  m = QUARTERLY_RE.exec(input);
  if (m) {
    return {
      type: 'QUARTERLY',
      year: Number(m[1]),
      quarter: Number(m[2]) as 1 | 2 | 3 | 4,
    };
  }

  m = MONTHLY_RE.exec(input);
  if (m) {
    const month = Number(m[2]);
    if (month < 1 || month > 12) return null;
    return { type: 'MONTHLY', year: Number(m[1]), month };
  }

  m = WEEKLY_RE.exec(input);
  if (m) {
    const year = Number(m[1]);
    const week = Number(m[2]);
    if (week < 1 || week > isoWeeksInYear(year)) return null;
    return { type: 'WEEKLY', year, week };
  }

  m = DAILY_RE.exec(input);
  if (m) {
    const year = Number(m[1]);
    const month = Number(m[2]);
    const day = Number(m[3]);
    if (month < 1 || month > 12) return null;
    if (day < 1 || day > daysInMonth(year, month)) return null;
    return { type: 'DAILY', year, month, day };
  }

  return null;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Format a structured Period back to its canonical string encoding. */
export function formatPeriod(period: Period): string {
  switch (period.type) {
    case 'YEARLY':
      return String(period.year);
    case 'QUARTERLY':
      return `${period.year}-Q${period.quarter}`;
    case 'MONTHLY':
      return `${period.year}-${pad(period.month)}`;
    case 'WEEKLY':
      return `${period.year}-W${pad(period.week)}`;
    case 'DAILY':
      return `${period.year}-${pad(period.month)}-${pad(period.day)}`;
  }
}

export function isValidPeriod(input: string): boolean {
  return parsePeriod(input) !== null;
}

export function periodType(input: string): PeriodType | null {
  return parsePeriod(input)?.type ?? null;
}

// --- Generation, offsetting, relative periods (M5) ---------------------------

/** The period containing the given date, for a frequency. */
export function periodContaining(type: PeriodType, date: Date): Period {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth() + 1;
  switch (type) {
    case 'YEARLY':
      return { type, year: y };
    case 'QUARTERLY':
      return { type, year: y, quarter: Math.ceil(m / 3) as 1 | 2 | 3 | 4 };
    case 'MONTHLY':
      return { type, year: y, month: m };
    case 'DAILY':
      return { type, year: y, month: m, day: date.getUTCDate() };
    case 'WEEKLY': {
      // ISO week number
      const d = new Date(Date.UTC(y, date.getUTCMonth(), date.getUTCDate()));
      const dayNum = d.getUTCDay() || 7;
      d.setUTCDate(d.getUTCDate() + 4 - dayNum);
      const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
      const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
      return { type, year: d.getUTCFullYear(), week };
    }
  }
}

/** The period n steps away (negative = into the past). */
export function offsetPeriod(period: Period, n: number): Period {
  switch (period.type) {
    case 'YEARLY':
      return { ...period, year: period.year + n };
    case 'QUARTERLY': {
      const index = period.year * 4 + (period.quarter - 1) + n;
      return {
        type: 'QUARTERLY',
        year: Math.floor(index / 4),
        quarter: ((((index % 4) + 4) % 4) + 1) as 1 | 2 | 3 | 4,
      };
    }
    case 'MONTHLY': {
      const index = period.year * 12 + (period.month - 1) + n;
      return {
        type: 'MONTHLY',
        year: Math.floor(index / 12),
        month: (((index % 12) + 12) % 12) + 1,
      };
    }
    case 'DAILY': {
      const d = new Date(Date.UTC(period.year, period.month - 1, period.day));
      d.setUTCDate(d.getUTCDate() + n);
      return {
        type: 'DAILY',
        year: d.getUTCFullYear(),
        month: d.getUTCMonth() + 1,
        day: d.getUTCDate(),
      };
    }
    case 'WEEKLY': {
      // walk via a date in the middle of the ISO week
      const jan4 = new Date(Date.UTC(period.year, 0, 4));
      const week1Monday = new Date(jan4);
      week1Monday.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() || 7) - 1));
      const monday = new Date(week1Monday);
      monday.setUTCDate(week1Monday.getUTCDate() + (period.week - 1 + n) * 7);
      return periodContaining('WEEKLY', monday);
    }
  }
}

export const RELATIVE_PERIODS = [
  'THIS_MONTH',
  'LAST_MONTH',
  'LAST_3_MONTHS',
  'LAST_6_MONTHS',
  'LAST_12_MONTHS',
  'THIS_QUARTER',
  'LAST_4_QUARTERS',
  'THIS_YEAR',
  'LAST_YEAR',
] as const;
export type RelativePeriod = (typeof RELATIVE_PERIODS)[number];

/** Resolve a relative period token to concrete period strings. */
export function resolveRelativePeriods(
  token: RelativePeriod,
  now: Date = new Date(),
): string[] {
  const span = (type: PeriodType, count: number, includeCurrent: boolean) => {
    const current = periodContaining(type, now);
    const start = includeCurrent ? 0 : 1;
    const out: string[] = [];
    for (let i = count - 1 + start; i >= start; i--) {
      out.push(formatPeriod(offsetPeriod(current, -i)));
    }
    return out;
  };
  switch (token) {
    case 'THIS_MONTH':
      return span('MONTHLY', 1, true);
    case 'LAST_MONTH':
      return span('MONTHLY', 1, false);
    case 'LAST_3_MONTHS':
      return span('MONTHLY', 3, false);
    case 'LAST_6_MONTHS':
      return span('MONTHLY', 6, false);
    case 'LAST_12_MONTHS':
      return span('MONTHLY', 12, false);
    case 'THIS_QUARTER':
      return span('QUARTERLY', 1, true);
    case 'LAST_4_QUARTERS':
      return span('QUARTERLY', 4, false);
    case 'THIS_YEAR':
      return span('YEARLY', 1, true);
    case 'LAST_YEAR':
      return span('YEARLY', 1, false);
  }
}
