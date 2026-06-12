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
