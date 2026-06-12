// Auth API schemas (spec §9) — shared between server routes and the client.
import { z } from 'zod';
import { permissionSchema, userOrgUnitSchema } from './metadata.js';

export const loginRequestSchema = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(1).max(256),
});

export const authUserSchema = z.object({
  id: z.string().uuid(),
  username: z.string(),
  displayName: z.string(),
  locale: z.string(),
  permissions: z.array(permissionSchema),
  orgUnits: z.array(userOrgUnitSchema),
});
export type AuthUser = z.infer<typeof authUserSchema>;

export const loginResponseSchema = z.object({
  accessToken: z.string(),
  /** seconds until the access token expires */
  expiresIn: z.number().int(),
  user: authUserSchema,
});
export type LoginResponse = z.infer<typeof loginResponseSchema>;
