import { describe, expect, it } from 'vitest';
import { parseCsv } from './csv.js';

describe('parseCsv', () => {
  it('parses headered rows', () => {
    expect(parseCsv('a,b\n1,2\n3,4')).toEqual([
      { a: '1', b: '2' },
      { a: '3', b: '4' },
    ]);
  });

  it('handles quotes, commas, escaped quotes, newlines in fields', () => {
    const csv = 'name,note\n"Doe, Jane","said ""hi""\nand left"';
    expect(parseCsv(csv)).toEqual([{ name: 'Doe, Jane', note: 'said "hi"\nand left' }]);
  });

  it('handles CRLF and trailing newline', () => {
    expect(parseCsv('a,b\r\n1,2\r\n')).toEqual([{ a: '1', b: '2' }]);
  });

  it('fills missing trailing cells with empty strings', () => {
    expect(parseCsv('a,b,c\n1,2')).toEqual([{ a: '1', b: '2', c: '' }]);
  });

  it('returns empty for empty input', () => {
    expect(parseCsv('')).toEqual([]);
  });
});
