import { describe, expect, it } from 'vitest';
import { validateValue } from './values.js';

describe('validateValue', () => {
  it('integers', () => {
    expect(validateValue('INTEGER', '-3')).toBeNull();
    expect(validateValue('INTEGER', '3.5')).not.toBeNull();
    expect(validateValue('INTEGER_POSITIVE', '0')).not.toBeNull();
    expect(validateValue('INTEGER_POSITIVE', '2')).toBeNull();
    expect(validateValue('INTEGER_ZERO_OR_POSITIVE', '0')).toBeNull();
    expect(validateValue('INTEGER_ZERO_OR_POSITIVE', '-1')).not.toBeNull();
  });

  it('numbers and percentages', () => {
    expect(validateValue('NUMBER', '3.14')).toBeNull();
    expect(validateValue('NUMBER', 'abc')).not.toBeNull();
    expect(validateValue('NUMBER', '')).not.toBeNull();
    expect(validateValue('PERCENTAGE', '100')).toBeNull();
    expect(validateValue('PERCENTAGE', '101')).not.toBeNull();
  });

  it('booleans and dates', () => {
    expect(validateValue('BOOLEAN', 'true')).toBeNull();
    expect(validateValue('BOOLEAN', 'yes')).not.toBeNull();
    expect(validateValue('DATE', '2026-02-28')).toBeNull();
    expect(validateValue('DATE', '2026-02-30')).not.toBeNull();
  });

  it('options use the provided option codes', () => {
    expect(
      validateValue('OPTION', 'WPT-BH', { optionCodes: ['WPT-BH', 'WPT-DW'] }),
    ).toBeNull();
    expect(validateValue('OPTION', 'NOPE', { optionCodes: ['WPT-BH'] })).not.toBeNull();
  });

  it('coordinates', () => {
    expect(validateValue('COORDINATE', '[38.74,9.03]')).toBeNull();
    expect(validateValue('COORDINATE', '[200,9]')).not.toBeNull();
    expect(validateValue('COORDINATE', 'x')).not.toBeNull();
  });
});
