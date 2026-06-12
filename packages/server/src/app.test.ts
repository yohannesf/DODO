import { describe, expect, it } from 'vitest';
import { healthResponseSchema } from '@dodo/shared';
import { buildApp } from './app.js';

describe('GET /api/health', () => {
  it('reports ok with db reachable', async () => {
    const app = await buildApp({
      health: { dbPing: async () => true, version: '0.0.0' },
      logger: false,
    });
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    const body = healthResponseSchema.parse(res.json());
    expect(body.db).toBe(true);
  });

  it('reports db unreachable without failing', async () => {
    const app = await buildApp({
      health: { dbPing: async () => false, version: '0.0.0' },
      logger: false,
    });
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json().db).toBe(false);
  });
});
