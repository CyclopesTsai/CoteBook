import { and, eq, isNull } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { pages } from '../db/schema.js';
import { HttpError } from '../lib/errors.js';

/**
 * Everything that may act on a resource. Every permission decision in the app goes
 * through this module, so that adding read-only share links later only means adding
 * a new actor kind here (e.g. `{ kind: 'shareLink'; shareLinkId; rootPageId }`)
 * instead of touching each route.
 */
export type Actor = { kind: 'user'; userId: string };

export type PageAction = 'view' | 'edit';

export type PageRow = typeof pages.$inferSelect;

export function canAccessPage(actor: Actor, page: PageRow, action: PageAction): boolean {
  if (page.deletedAt) return false;
  switch (actor.kind) {
    case 'user':
      // Single-user ownership model: owners may do everything with their own pages.
      return page.userId === actor.userId && (action === 'view' || action === 'edit');
  }
}

/**
 * Loads a page and asserts the actor may perform `action` on it. Responds 404 rather
 * than 403 for pages the actor cannot see, so page ids cannot be probed.
 */
export async function requirePage(
  db: Pick<Database, 'select'>,
  actor: Actor,
  pageId: string,
  action: PageAction,
): Promise<PageRow> {
  const rows = await db
    .select()
    .from(pages)
    .where(and(eq(pages.id, pageId), isNull(pages.deletedAt)))
    .limit(1);
  const page = rows[0];
  if (!page || !canAccessPage(actor, page, action)) {
    throw HttpError.notFound('Page not found');
  }
  return page;
}

/** Whether an actor may read an uploaded file owned by `ownerId`. */
export function canViewUpload(actor: Actor, ownerId: string): boolean {
  switch (actor.kind) {
    case 'user':
      return actor.userId === ownerId;
  }
}
