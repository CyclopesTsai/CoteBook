import type { Block, PageDetail, PageSummary } from '@cotebook/shared';
import { ErrorCode, blockPlainText, MAX_BLOCK_DEPTH, MAX_BLOCKS_PER_PAGE } from '@cotebook/shared';
import { and, asc, eq, isNull, notInArray, sql } from 'drizzle-orm';
import type { Actor, PageRow } from '../auth/authz.js';
import { requirePage } from '../auth/authz.js';
import type { Database } from '../db/client.js';
import { blocks, pages, users } from '../db/schema.js';
import { HttpError } from '../lib/errors.js';
import { planPosition } from './positions.js';

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];

export function toSummary(p: PageRow): PageSummary {
  return {
    id: p.id,
    parentId: p.parentId,
    title: p.title,
    position: p.position,
    icon: p.icon,
    updatedAt: p.updatedAt.toISOString(),
  };
}

/**
 * Serialises page-tree mutations for one user. A personal notes app has a single
 * writer most of the time, so a coarse per-user lock keeps sibling ordering and cycle
 * checks trivially correct.
 */
async function lockUserTree(tx: Tx, userId: string) {
  await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for('update');
}

function activeChildrenOf(tx: Tx, userId: string, parentId: string | null) {
  return tx
    .select({ id: pages.id, position: pages.position })
    .from(pages)
    .where(
      and(
        eq(pages.userId, userId),
        parentId === null ? isNull(pages.parentId) : eq(pages.parentId, parentId),
        isNull(pages.deletedAt),
      ),
    );
}

async function applyRebalance(tx: Tx, rebalanced: { id: string; position: string }[]) {
  for (const r of rebalanced) {
    await tx.update(pages).set({ position: r.position }).where(eq(pages.id, r.id));
  }
}

export class PageService {
  constructor(private readonly db: Database) {}

  async list(actor: Actor): Promise<PageSummary[]> {
    const rows = await this.db
      .select()
      .from(pages)
      .where(and(eq(pages.userId, actor.userId), isNull(pages.deletedAt)));
    return rows.map(toSummary);
  }

  async create(actor: Actor, input: { parentId?: string | null; title?: string }) {
    const parentId = input.parentId ?? null;
    return this.db.transaction(async (tx) => {
      await lockUserTree(tx, actor.userId);
      if (parentId) await requirePage(tx, actor, parentId, 'edit');
      const siblings = await activeChildrenOf(tx, actor.userId, parentId);
      const plan = planPosition(siblings, siblings.length);
      await applyRebalance(tx, plan.rebalanced);
      const [row] = await tx
        .insert(pages)
        .values({
          userId: actor.userId,
          parentId,
          title: input.title ?? '',
          position: plan.position,
        })
        .returning();
      return row!;
    });
  }

  async get(actor: Actor, pageId: string): Promise<PageDetail> {
    const page = await requirePage(this.db, actor, pageId, 'view');
    const rows = await this.db
      .select()
      .from(blocks)
      .where(eq(blocks.pageId, pageId))
      .orderBy(asc(blocks.sortIndex));
    return {
      ...toSummary(page),
      coverUrl: page.coverUrl,
      isLocked: page.isLocked,
      createdAt: page.createdAt.toISOString(),
      version: page.version,
      blocks: buildBlockTree(rows),
    };
  }

  async update(actor: Actor, pageId: string, input: { title?: string }) {
    const page = await requirePage(this.db, actor, pageId, 'edit');
    if (input.title === undefined) return page;
    const [row] = await this.db
      .update(pages)
      .set({ title: input.title, updatedAt: new Date() })
      .where(eq(pages.id, pageId))
      .returning();
    return row!;
  }

  async move(actor: Actor, pageId: string, input: { parentId: string | null; index: number }) {
    return this.db.transaction(async (tx) => {
      await lockUserTree(tx, actor.userId);
      const page = await requirePage(tx, actor, pageId, 'edit');
      const parentId = input.parentId;

      if (parentId) {
        if (parentId === pageId) {
          throw new HttpError(400, ErrorCode.InvalidMove, 'A page cannot contain itself');
        }
        await requirePage(tx, actor, parentId, 'edit');
        // Walk up from the new parent: if we meet the moved page, the move creates a cycle.
        const ancestors = await tx.execute<{ id: string }>(sql`
          WITH RECURSIVE chain AS (
            SELECT id, parent_id FROM pages WHERE id = ${parentId}
            UNION ALL
            SELECT p.id, p.parent_id FROM pages p JOIN chain c ON p.id = c.parent_id
          )
          SELECT id FROM chain
        `);
        if (ancestors.rows.some((r) => r.id === pageId)) {
          throw new HttpError(
            400,
            ErrorCode.InvalidMove,
            'A page cannot be moved into one of its own subpages',
          );
        }
      }

      const siblings = (await activeChildrenOf(tx, actor.userId, parentId)).filter(
        (s) => s.id !== page.id,
      );
      const plan = planPosition(siblings, input.index);
      await applyRebalance(tx, plan.rebalanced);
      const [row] = await tx
        .update(pages)
        .set({ parentId, position: plan.position, updatedAt: new Date() })
        .where(eq(pages.id, pageId))
        .returning();
      return { page: row!, affectedIds: [pageId, ...plan.rebalanced.map((r) => r.id)] };
    });
  }

  /** Soft-deletes a page and all of its descendants. Returns the affected page ids. */
  async softDelete(actor: Actor, pageId: string): Promise<string[]> {
    return this.db.transaction(async (tx) => {
      await lockUserTree(tx, actor.userId);
      await requirePage(tx, actor, pageId, 'edit');
      const result = await tx.execute<{ id: string }>(sql`
        WITH RECURSIVE subtree AS (
          SELECT id FROM pages WHERE id = ${pageId}
          UNION ALL
          SELECT p.id FROM pages p JOIN subtree s ON p.parent_id = s.id
          WHERE p.deleted_at IS NULL
        )
        UPDATE pages SET deleted_at = now(), deleted_root_id = ${pageId}
        WHERE id IN (SELECT id FROM subtree)
        RETURNING id
      `);
      return result.rows.map((r) => r.id);
    });
  }

  /**
   * Replaces a page's content with `tree`. Uses optimistic concurrency: the save is
   * rejected with 409 when `baseVersion` is stale, unless `force` is set.
   */
  async saveContent(
    actor: Actor,
    pageId: string,
    input: { baseVersion: number; blocks: Block[]; force?: boolean },
  ) {
    const rows = flattenBlocks(input.blocks);
    return this.db.transaction(async (tx) => {
      await requirePage(tx, actor, pageId, 'edit');
      const [locked] = await tx
        .select({ version: pages.version })
        .from(pages)
        .where(eq(pages.id, pageId))
        .for('update');
      const current = locked!.version;
      if (!input.force && current !== input.baseVersion) {
        throw new HttpError(409, ErrorCode.VersionConflict, 'The page was changed elsewhere', {
          currentVersion: current,
        });
      }

      const ids = rows.map((r) => r.id);
      await tx
        .delete(blocks)
        .where(
          ids.length
            ? and(eq(blocks.pageId, pageId), notInArray(blocks.id, ids))
            : eq(blocks.pageId, pageId),
        );

      const now = new Date();
      for (let i = 0; i < rows.length; i += 500) {
        const chunk = rows.slice(i, i + 500).map((r) => ({ ...r, pageId, updatedAt: now }));
        await tx
          .insert(blocks)
          .values(chunk)
          .onConflictDoUpdate({
            target: [blocks.pageId, blocks.id],
            set: {
              parentBlockId: sql`excluded.parent_block_id`,
              sortIndex: sql`excluded.sort_index`,
              type: sql`excluded.type`,
              props: sql`excluded.props`,
              content: sql`excluded.content`,
              plainText: sql`excluded.plain_text`,
              updatedAt: sql`excluded.updated_at`,
            },
            // Leave untouched blocks alone so their updated_at stays meaningful.
            setWhere: sql`(${blocks.parentBlockId}, ${blocks.sortIndex}, ${blocks.type}, ${blocks.props}, ${blocks.content})
              IS DISTINCT FROM (excluded.parent_block_id, excluded.sort_index, excluded.type, excluded.props, excluded.content)`,
          });
      }

      const [updated] = await tx
        .update(pages)
        .set({ version: current + 1, updatedAt: now })
        .where(eq(pages.id, pageId))
        .returning({ version: pages.version, updatedAt: pages.updatedAt });
      return updated!;
    });
  }
}

type BlockRow = typeof blocks.$inferSelect;
type NewBlockRow = Omit<typeof blocks.$inferInsert, 'pageId'>;

export function flattenBlocks(tree: Block[]): NewBlockRow[] {
  const out: NewBlockRow[] = [];
  const seen = new Set<string>();
  const walk = (list: Block[], parentBlockId: string | null, depth: number) => {
    if (depth > MAX_BLOCK_DEPTH) {
      throw HttpError.badRequest(`Blocks may be nested at most ${MAX_BLOCK_DEPTH} levels deep`);
    }
    list.forEach((b, sortIndex) => {
      if (seen.has(b.id)) throw HttpError.badRequest(`Duplicate block id: ${b.id}`);
      seen.add(b.id);
      if (out.length >= MAX_BLOCKS_PER_PAGE) {
        throw HttpError.badRequest(`A page may contain at most ${MAX_BLOCKS_PER_PAGE} blocks`);
      }
      out.push({
        id: b.id,
        parentBlockId,
        sortIndex,
        type: b.type,
        props: b.props ?? {},
        content: b.content ?? null,
        plainText: blockPlainText(b),
      });
      if (b.children?.length) walk(b.children, b.id, depth + 1);
    });
  };
  walk(tree, null, 0);
  return out;
}

export function buildBlockTree(rows: BlockRow[]): Block[] {
  const byParent = new Map<string | null, BlockRow[]>();
  for (const r of rows) {
    const list = byParent.get(r.parentBlockId) ?? [];
    list.push(r);
    byParent.set(r.parentBlockId, list);
  }
  const build = (parentId: string | null): Block[] =>
    (byParent.get(parentId) ?? [])
      .sort((a, b) => a.sortIndex - b.sortIndex)
      .map((r) => {
        const block: Block = { id: r.id, type: r.type, props: r.props, children: build(r.id) };
        if (r.content !== null) block.content = r.content;
        return block;
      });
  return build(null);
}
