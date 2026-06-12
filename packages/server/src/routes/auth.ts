import type { FastifyInstance } from 'fastify';
import { loginRequestSchema, loginResponseSchema } from '@dodo/shared';
import type { Db } from '../db/index.js';
import {
  login,
  resolveSession,
  revokeSession,
  SESSION_TTL_DAYS,
} from '../services/auth.js';
import { ACCESS_TOKEN_TTL_SECONDS, SESSION_COOKIE } from '../plugins/auth.js';
import { AppError } from '../lib/errors.js';

const cookieOpts = {
  path: '/',
  httpOnly: true,
  sameSite: 'lax',
  secure: 'auto',
  maxAge: SESSION_TTL_DAYS * 24 * 3600,
} as const;

export function registerAuthRoutes(app: FastifyInstance, db: Db) {
  app.post(
    '/api/auth/login',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const { username, password } = loginRequestSchema.parse(req.body);
      const { sessionToken, authUser } = await login(db, username, password, {
        ip: req.ip,
        userAgent: req.headers['user-agent'],
      });
      reply.setCookie(SESSION_COOKIE, sessionToken, cookieOpts);
      return loginResponseSchema.parse({
        accessToken: app.signAccessToken(authUser),
        expiresIn: ACCESS_TOKEN_TTL_SECONDS,
        user: authUser,
      });
    },
  );

  app.post('/api/auth/refresh', async (req) => {
    const token = req.cookies[SESSION_COOKIE];
    if (!token) throw new AppError(401, 'no session');
    const authUser = await resolveSession(db, token);
    return loginResponseSchema.parse({
      accessToken: app.signAccessToken(authUser),
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
      user: authUser,
    });
  });

  app.post('/api/auth/logout', async (req, reply) => {
    const token = req.cookies[SESSION_COOKIE];
    if (token) await revokeSession(db, token);
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  });

  app.get('/api/auth/me', { preHandler: app.requirePermission() }, async (req) => {
    return req.authUser;
  });
}
