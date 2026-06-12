// Cross-tier zod schemas (spec §2.3): the server validates with these and the
// client imports the exact same code. All API payload schemas live here.
import { z } from 'zod';
import { isValidPeriod } from './periods.js';

export const uuidSchema = z.string().uuid();

export const periodStringSchema = z
  .string()
  .refine(isValidPeriod, { message: 'invalid period encoding' });

export const healthResponseSchema = z.object({
  status: z.literal('ok'),
  db: z.boolean(),
  version: z.string(),
  time: z.string().datetime(),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
