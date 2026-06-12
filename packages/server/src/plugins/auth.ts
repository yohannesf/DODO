// Auth plugin (spec §9): httpOnly session cookie for refresh, short-lived
// JWT for API/sync. JWT carries permissions + org-unit scope so request
// handling needs no extra DB round-trip.
import fp from 'fastify-plugin';
import fastifyCookie from '@fastify/cookie';
import fastifyJwt from '@fastify/jwt';
import type { FastifyReply, FastifyRequest, preHandlerHookHandler } from 'fastify';
import type { AuthUser, Permission } from '@dodo/shared';
import { AppError } from '../lib/errors.js';

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
}

export const authPlugin = fp<AuthPluginOptions>(async (app, opts) => {
  await app.register(fastifyCookie);
  await app.register(fastifyJwt, {
    secret: opts.jwtSecret,
    sign: { expiresIn: ACCESS_TOKEN_TTL_SECONDS },
  });

  app.decorateRequest('authUser', null);

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
