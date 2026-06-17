// Auth plugin (spec §9): httpOnly session cookie for refresh, short-lived
// JWT for API/sync. JWT carries permissions + org-unit scope so request
// handling needs no extra DB round-trip.
import fp from 'fastify-plugin';
import fastifyCookie from '@fastify/cookie';
import fastifyJwt from '@fastify/jwt';
import { eq, sql } from 'drizzle-orm';
import type { FastifyReply, FastifyRequest, preHandlerHookHandler } from 'fastify';
import type { AuthUser, Permission } from '@dodo/shared';
import type { Db } from '../db/index.js';
import { apiKey } from '../db/schema.js';
import { isApiKey, lookupApiKey, rateLimitOk } from '../services/api-keys.js';
import { AppError } from '../lib/errors.js';

export interface ApiKeyContext {
  id: string;
  programId: string | null;
  accessLevel: string;
}

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const SESSION_COOKIE = 'dodo_session';

export interface JwtClaims {
  sub: string;
  username: string;
  displayName: string;
  locale: string;
  perms: Permission[];
  ous: AuthUser['orgUnits'];
}

declare module 'fastify' {
  interface FastifyRequest {
    authUser: AuthUser | null;
    apiKey: ApiKeyContext | null;
  }
  interface FastifyInstance {
    signAccessToken(user: AuthUser): string;
    authenticate: preHandlerHookHandler;
    requirePermission(...perms: Permission[]): preHandlerHookHandler;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: Omit<JwtClaims, 'sub'> & { sub: string };
    user: JwtClaims;
  }
}

export interface AuthPluginOptions {
  jwtSecret: string;
  db: Db;
}

// access_level → the permissions an API key grants (spec §16.5)
function apiKeyPermissions(accessLevel: string): Permission[] {
  return accessLevel === 'read_write'
    ? ['data:read', 'data:write', 'metadata:read', 'metadata:write']
    : ['data:read', 'metadata:read'];
}

export const authPlugin = fp<AuthPluginOptions>(async (app, opts) => {
  await app.register(fastifyCookie);
  await app.register(fastifyJwt, {
    secret: opts.jwtSecret,
    sign: { expiresIn: ACCESS_TOKEN_TTL_SECONDS },
  });

  app.decorateRequest('authUser', null);
  app.decorateRequest('apiKey', null);

  app.decorate('signAccessToken', (user: AuthUser): string => {
    return app.jwt.sign({
      sub: user.id,
      username: user.username,
      displayName: user.displayName,
      locale: user.locale,
      perms: user.permissions,
      ous: user.orgUnits,
    });
  });

  app.decorate(
    'authenticate',
    async function (req: FastifyRequest, _reply: FastifyReply) {
      // API-key auth (spec §16.5): a `dodo_`-prefixed bearer is an API key, not
      // a JWT. Validates hash + active + expiry, checks the allowed-endpoints
      // scope, and applies the per-key rate limit before granting access.
      const header = req.headers.authorization;
      const bearer = header?.startsWith('Bearer ') ? header.slice(7) : null;
      if (bearer && isApiKey(bearer)) {
        const key = await lookupApiKey(opts.db, bearer);
        if (!key || !key.isActive) throw new AppError(401, 'invalid api key');
        if (key.expiresAt && new Date(key.expiresAt).getTime() < Date.now()) {
          throw new AppError(401, 'api key expired');
        }
        const allowed = key.allowedEndpoints as string[] | null;
        if (allowed && !allowed.some((e) => req.url.includes(e))) {
          throw new AppError(403, 'api key not permitted for this endpoint');
        }
        if (!rateLimitOk(key.id, key.rateLimitRph)) {
          throw new AppError(429, 'api key rate limit exceeded');
        }
        req.authUser = {
          id: `apikey:${key.id}`,
          username: key.name,
          displayName: key.name,
          locale: 'en',
          permissions: apiKeyPermissions(key.accessLevel),
          orgUnits: [],
        };
        req.apiKey = {
          id: key.id,
          programId: key.programId,
          accessLevel: key.accessLevel,
        };
        void opts.db
          .update(apiKey)
          .set({ lastUsedAt: sql`now()` })
          .where(eq(apiKey.id, key.id));
        return;
      }
      try {
        const claims = await req.jwtVerify<JwtClaims>();
        req.authUser = {
          id: claims.sub,
          username: claims.username,
          displayName: claims.displayName,
          locale: claims.locale,
          permissions: claims.perms,
          orgUnits: claims.ous,
        };
      } catch {
        throw new AppError(401, 'missing or expired access token');
      }
    },
  );

  app.decorate('requirePermission', (...perms: Permission[]) => {
    const handler: preHandlerHookHandler = async (req, reply) => {
      await app.authenticate.call(app, req, reply, () => {});
      if (perms.length === 0) return; // authentication only
      const have = new Set(req.authUser?.permissions ?? []);
      if (have.has('system:admin')) return;
      if (!perms.some((p) => have.has(p))) {
        throw new AppError(403, `requires ${perms.join(' or ')}`);
      }
    };
    return handler;
  });
});
