import type { AuthResponse, User } from '@cotebook/shared';
import { ErrorCode, loginInput, registerInput } from '@cotebook/shared';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { clearSessionCookie, requireAuth, setSessionCookie } from '../auth/plugin.js';
import { hashPassword, verifyDummyPassword, verifyPassword } from '../auth/password.js';
import type { UserRow } from '../auth/sessions.js';
import type { AppContext } from '../context.js';
import { users } from '../db/schema.js';
import { HttpError } from '../lib/errors.js';
import { parse } from '../lib/validation.js';

export function toUser(u: UserRow): User {
  return {
    id: u.id,
    email: u.email,
    displayName: u.displayName,
    emailVerified: u.emailVerified,
    createdAt: u.createdAt.toISOString(),
  };
}

const authRateLimit = {
  config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
};

export async function authRoutes(app: FastifyInstance, ctx: AppContext) {
  app.post('/auth/register', authRateLimit, async (req, reply) => {
    if (!ctx.config.allowRegistration) {
      throw new HttpError(403, ErrorCode.RegistrationDisabled, 'Registration is disabled');
    }
    const input = parse(registerInput, req.body);
    const email = input.email.toLowerCase();
    const passwordHash = await hashPassword(input.password);

    const [user] = await ctx.db
      .insert(users)
      .values({ email, passwordHash, displayName: input.displayName || null })
      .onConflictDoNothing()
      .returning();
    if (!user) throw new HttpError(409, ErrorCode.EmailTaken, 'Email is already registered');

    const session = await ctx.sessions.create(user.id, req.headers['user-agent']);
    const body: AuthResponse = { user: toUser(user) };
    if (input.returnToken) body.token = session.token;
    else setSessionCookie(reply, ctx, session.token, session.expiresAt);
    return reply.code(201).send(body);
  });

  app.post('/auth/login', authRateLimit, async (req, reply) => {
    const input = parse(loginInput, req.body);
    const [user] = await ctx.db
      .select()
      .from(users)
      .where(eq(users.email, input.email.toLowerCase()))
      .limit(1);

    const ok = user?.passwordHash
      ? await verifyPassword(user.passwordHash, input.password)
      : (await verifyDummyPassword(input.password), false);
    if (!user || !ok) {
      throw new HttpError(401, ErrorCode.InvalidCredentials, 'Invalid email or password');
    }
    // Reserved: when 2FA is enabled, respond with a challenge here instead of a session.

    const session = await ctx.sessions.create(user.id, req.headers['user-agent']);
    const body: AuthResponse = { user: toUser(user) };
    if (input.returnToken) body.token = session.token;
    else setSessionCookie(reply, ctx, session.token, session.expiresAt);
    return body;
  });

  app.post('/auth/logout', async (req, reply) => {
    if (req.auth) await ctx.sessions.revoke(req.auth.sessionId);
    clearSessionCookie(reply, ctx);
    return reply.code(204).send();
  });

  app.get('/auth/me', async (req) => {
    const { user } = requireAuth(req);
    return { user: toUser(user) };
  });
}
