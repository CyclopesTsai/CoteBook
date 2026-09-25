import { and, eq, gt, lt } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { sessions, users } from '../db/schema.js';
import { generateToken, hashToken } from '../lib/tokens.js';

export type UserRow = typeof users.$inferSelect;

/** Refresh the expiry at most this often, to avoid a write on every request. */
const TOUCH_INTERVAL_MS = 60 * 60 * 1000;

export class SessionService {
  constructor(
    private readonly db: Database,
    private readonly ttlMs: number,
  ) {}

  async create(userId: string, userAgent: string | undefined) {
    const token = generateToken();
    const expiresAt = new Date(Date.now() + this.ttlMs);
    await this.db.insert(sessions).values({
      userId,
      tokenHash: hashToken(token),
      userAgent: userAgent?.slice(0, 500),
      expiresAt,
    });
    return { token, expiresAt };
  }

  /** Resolves a token to its user, sliding the expiry forward. Returns null if invalid. */
  async resolve(token: string): Promise<{ user: UserRow; sessionId: string } | null> {
    const now = new Date();
    const rows = await this.db
      .select({ session: sessions, user: users })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(and(eq(sessions.tokenHash, hashToken(token)), gt(sessions.expiresAt, now)))
      .limit(1);
    const row = rows[0];
    if (!row) return null;

    if (now.getTime() - row.session.lastUsedAt.getTime() > TOUCH_INTERVAL_MS) {
      await this.db
        .update(sessions)
        .set({ lastUsedAt: now, expiresAt: new Date(now.getTime() + this.ttlMs) })
        .where(eq(sessions.id, row.session.id));
    }
    return { user: row.user, sessionId: row.session.id };
  }

  async revoke(sessionId: string) {
    await this.db.delete(sessions).where(eq(sessions.id, sessionId));
  }

  async purgeExpired() {
    await this.db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
  }
}
