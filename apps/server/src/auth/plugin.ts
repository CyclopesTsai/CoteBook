import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { AppContext } from '../context.js';
import { HttpError } from '../lib/errors.js';
import type { Actor } from './authz.js';
import type { UserRow } from './sessions.js';

export const SESSION_COOKIE = 'cotebook_session';

export interface RequestAuth {
  user: UserRow;
  sessionId: string;
  actor: Actor;
  /** How the credential was presented; cookie-authenticated writes get an origin check. */
  via: 'cookie' | 'bearer';
}

declare module 'fastify' {
  interface FastifyRequest {
    auth: RequestAuth | null;
  }
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function bearerToken(req: FastifyRequest): string | undefined {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return undefined;
  return header.slice('Bearer '.length).trim() || undefined;
}

/**
 * Resolves the session on every request (cookie for the web app, bearer token for
 * native clients) and guards cookie-authenticated writes against cross-site requests.
 */
export function registerAuth(app: FastifyInstance, ctx: AppContext) {
  const allowedOrigins = new Set([ctx.config.appUrl.origin, ...ctx.config.corsOrigins]);

  app.decorateRequest('auth', null);

  app.addHook('onRequest', async (req) => {
    const bearer = bearerToken(req);
    const token = bearer ?? req.cookies[SESSION_COOKIE];
    if (!token) return;
    const resolved = await ctx.sessions.resolve(token);
    if (!resolved) return;
    req.auth = {
      ...resolved,
      actor: { kind: 'user', userId: resolved.user.id },
      via: bearer ? 'bearer' : 'cookie',
    };
  });

  // Defence in depth on top of SameSite=Lax cookies: reject cookie-authenticated
  // state-changing requests coming from a foreign origin.
  app.addHook('onRequest', async (req) => {
    if (SAFE_METHODS.has(req.method) || req.auth?.via === 'bearer') return;
    const origin = req.headers.origin;
    if (!origin) return;
    if (allowedOrigins.has(origin)) return;
    try {
      if (new URL(origin).host === req.host) return;
    } catch {
      // fall through
    }
    throw HttpError.forbidden('Cross-origin request rejected');
  });
}

export function requireAuth(req: FastifyRequest): RequestAuth {
  if (!req.auth) throw HttpError.unauthorized();
  return req.auth;
}

export function setSessionCookie(
  reply: FastifyReply,
  ctx: AppContext,
  token: string,
  expiresAt: Date,
) {
  reply.setCookie(SESSION_COOKIE, token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: ctx.config.cookieSecure,
    expires: expiresAt,
  });
}

export function clearSessionCookie(reply: FastifyReply, ctx: AppContext) {
  reply.clearCookie(SESSION_COOKIE, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: ctx.config.cookieSecure,
  });
}

/** The per-tab id a client attached to its request, echoed back in sync events. */
export function originClientId(req: FastifyRequest): string | null {
  const v = req.headers['x-client-id'];
  return typeof v === 'string' && v.length > 0 && v.length <= 64 ? v : null;
}
