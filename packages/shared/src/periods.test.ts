import { describe, expect, it } from 'vitest';
import {
  formatPeriod,
  isValidPeriod,
  offsetPeriod,
  parsePeriod,
  periodContaining,
  periodType,
  resolveRelativePeriods,
} from './periods.js';

describe('parsePeriod', () => {
  it('parses yearly periods', () => {
    expect(parsePeriod('2026')).toEqual({ type: 'YEARLY', year: 2026 });
  });

  it('parses quarterly periods', () => {
    expect(parsePeriod('2026-Q1')).toEqual({ type: 'QUARTERLY', year: 2026, quarter: 1 });
    expect(parsePeriod('2026-Q4')).toEqual({ type: 'QUARTERLY', year: 2026, quarter: 4 });
  });

  it('parses monthly periods', () => {
    expect(parsePeriod('2026-03')).toEqual({ type: 'MONTHLY', year: 2026, month: 3 });
    expect(parsePeriod('2026-12')).toEqual({ type: 'MONTHLY', year: 2026, month: 12 });
  });

  it('parses weekly periods', () => {
    expect(parsePeriod('2026-W14')).toEqual({ type: 'WEEKLY', year: 2026, week: 14 });
    expect(parsePeriod('2026-W01')).toEqual({ type: 'WEEKLY', year: 2026, week: 1 });
  });

  it('accepts week 53 only in long ISO years', () => {
    // 2026 has 53 ISO weeks (1 Jan 2026 falls on a Thursday); 2025 has 52.
    expect(parsePeriod('2026-W53')).toEqual({ type: 'WEEKLY', year: 2026, week: 53 });
    expect(parsePeriod('2025-W53')).toBeNull();
  });

  it('parses daily periods', () => {
    expect(parsePeriod('2026-03-15')).toEqual({
      type: 'DAILY',
      year: 2026,
      month: 3,
      day: 15,
    });
  });

  it('respects calendar lengths including leap years', () => {
    expect(parsePeriod('2024-02-29')).not.toBeNull();
    expect(parsePeriod('2026-02-29')).toBeNull();
    expect(parsePeriod('2026-04-31')).toBeNull();
  });

  it('rejects malformed strings', () => {
    for (const bad of [
      '',
      '26',
      '20261',
      '2026-13',
      '2026-00',
      '2026-Q5',
      '2026-Q0',
      '2026-W00',
      '2026-W54',
      '2026-3',
      '2026-03-00',
      '2026-03-32',
      '2026/03',
      'March 2026',
    ]) {
      expect(parsePeriod(bad), bad).toBeNull();
    }
  });
});

describe('formatPeriod', () => {
  it('round-trips every period type', () => {
    for (const s of ['2026', '2026-Q2', '2026-03', '2026-W04', '2026-03-15']) {
      const parsed = parsePeriod(s);
      expect(parsed).not.toBeNull();
      expect(formatPeriod(parsed!)).toBe(s);
    }
  });

  it('zero-pads months, weeks, and days', () => {
    expect(formatPeriod({ type: 'MONTHLY', year: 2026, month: 3 })).toBe('2026-03');
    expect(formatPeriod({ type: 'WEEKLY', year: 2026, week: 4 })).toBe('2026-W04');
    expect(formatPeriod({ type: 'DAILY', year: 2026, month: 3, day: 5 })).toBe(
      '2026-03-05',
    );
  });
});

describe('helpers', () => {
  it('isValidPeriod mirrors parsePeriod', () => {
    expect(isValidPeriod('2026-Q1')).toBe(true);
    expect(isValidPeriod('2026-Q9')).toBe(false);
  });

  it('periodType reports the type', () => {
    expect(periodType('2026-W14')).toBe('WEEKLY');
    expect(periodType('nope')).toBeNull();
  });
});

describe('offsetPeriod / periodContaining / relative periods', () => {
  const now = new Date('2026-06-12T10:00:00Z');

  it('offsets months across year boundaries', () => {
    expect(formatPeriod(offsetPeriod(parsePeriod('2026-01')!, -1))).toBe('2025-12');
    expect(formatPeriod(offsetPeriod(parsePeriod('2026-11')!, 3))).toBe('2027-02');
  });

  it('offsets quarters and years', () => {
    expect(formatPeriod(offsetPeriod(parsePeriod('2026-Q1')!, -2))).toBe('2025-Q3');
    expect(formatPeriod(offsetPeriod(parsePeriod('2026')!, 1))).toBe('2027');
  });

  it('offsets days and weeks', () => {
    expect(formatPeriod(offsetPeriod(parsePeriod('2026-03-01')!, -1))).toBe('2026-02-28');
    expect(formatPeriod(offsetPeriod(parsePeriod('2026-W01')!, -1))).toBe('2025-W52');
  });

  it('finds containing periods', () => {
    expect(formatPeriod(periodContaining('MONTHLY', now))).toBe('2026-06');
    expect(formatPeriod(periodContaining('QUARTERLY', now))).toBe('2026-Q2');
    expect(formatPeriod(periodContaining('WEEKLY', now))).toBe('2026-W24');
  });

  it('resolves relative tokens', () => {
    expect(resolveRelativePeriods('THIS_MONTH', now)).toEqual(['2026-06']);
    expect(resolveRelativePeriods('LAST_3_MONTHS', now)).toEqual([
      '2026-03',
      '2026-04',
      '2026-05',
    ]);
    expect(resolveRelativePeriods('LAST_12_MONTHS', now)).toHaveLength(12);
    expect(resolveRelativePeriods('LAST_12_MONTHS', now)[0]).toBe('2025-06');
    expect(resolveRelativePeriods('THIS_QUARTER', now)).toEqual(['2026-Q2']);
    expect(resolveRelativePeriods('LAST_4_QUARTERS', now)).toEqual([
      '2025-Q2',
      '2025-Q3',
      '2025-Q4',
      '2026-Q1',
    ]);
  });
});
