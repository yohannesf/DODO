import { describe, expect, it } from 'vitest';
import { uuidv7, uuidv7Timestamp } from './uuid.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('uuidv7', () => {
  it('produces RFC 9562 v7 ids', () => {
    for (let i = 0; i < 100; i++) {
      expect(uuidv7()).toMatch(UUID_RE);
    }
  });

  it('embeds the millisecond timestamp', () => {
    const at = 1749600000000;
    expect(uuidv7Timestamp(uuidv7(at))).toBe(at);
  });

  it('sorts by generation time', () => {
    const a = uuidv7(1000);
    const b = uuidv7(2000);
    expect(a < b).toBe(true);
  });

  it('does not collide in bulk', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 10_000; i++) seen.add(uuidv7());
    expect(seen.size).toBe(10_000);
  });
});
