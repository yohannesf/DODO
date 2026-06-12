import { describe, expect, it } from 'vitest';
import { AGGREGATION_OPS, FREQUENCIES, ORG_UNIT_SCOPES, VALUE_TYPES } from '@dodo/shared';
import {
  aggregationOpEnum,
  frequencyEnum,
  orgUnitScopeEnum,
  valueTypeEnum,
} from './schema.js';

// schema.ts re-declares these literals because drizzle-kit cannot load the
// ESM-only shared package; this test pins them to the shared source of truth.
describe('db enums mirror shared enums', () => {
  it('value_type', () => {
    expect(valueTypeEnum.enumValues).toEqual([...VALUE_TYPES]);
  });
  it('aggregation_op', () => {
    expect(aggregationOpEnum.enumValues).toEqual([...AGGREGATION_OPS]);
  });
  it('frequency', () => {
    expect(frequencyEnum.enumValues).toEqual([...FREQUENCIES]);
  });
  it('org_unit_scope', () => {
    expect(orgUnitScopeEnum.enumValues).toEqual([...ORG_UNIT_SCOPES]);
  });
});
