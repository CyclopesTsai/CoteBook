import type { SaveContentResponse } from '@cotebook/shared';
import {
  createPageInput,
  movePageInput,
  saveContentInput,
  updatePageInput,
} from '@cotebook/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { originClientId, requireAuth } from '../auth/plugin.js';
import type { AppContext } from '../context.js';
import { toSummary } from '../services/pages.js';
import { parse } from '../lib/validation.js';

const idParams = z.object({ id: z.uuid() });

/** pg_notify payloads are capped at 8 KB; beyond this, send "everything changed". */
const MAX_IDS_PER_EVENT = 100;

export async function pageRoutes(app: FastifyInstance, ctx: AppContext) {
  const notifyTree = (req: FastifyRequest, userId: string, pageIds: string[]) =>
    ctx.bus.publish(userId, {
      type: 'pages.changed',
      pageIds: pageIds.length > MAX_IDS_PER_EVENT ? [] : pageIds,
      originClientId: originClientId(req),
    });

  app.get('/pages', async (req) => {
    const { actor } = requireAuth(req);
    return { pages: await ctx.pages.list(actor) };
  });

  app.post('/pages', async (req, reply) => {
    const { actor } = requireAuth(req);
    const input = parse(createPageInput, req.body ?? {});
    const page = await ctx.pages.create(actor, input);
    await notifyTree(req, actor.userId, [page.id]);
    return reply.code(201).send({ page: toSummary(page) });
  });

  app.get('/pages/:id', async (req) => {
    const { actor } = requireAuth(req);
    const { id } = parse(idParams, req.params);
    return { page: await ctx.pages.get(actor, id) };
  });

  app.patch('/pages/:id', async (req) => {
    const { actor } = requireAuth(req);
    const { id } = parse(idParams, req.params);
    const input = parse(updatePageInput, req.body);
    const page = await ctx.pages.update(actor, id, input);
    await notifyTree(req, actor.userId, [id]);
    return { page: toSummary(page) };
  });

  app.post('/pages/:id/move', async (req) => {
    const { actor } = requireAuth(req);
    const { id } = parse(idParams, req.params);
    const input = parse(movePageInput, req.body);
    const { page, affectedIds } = await ctx.pages.move(actor, id, input);
    await notifyTree(req, actor.userId, affectedIds);
    return { page: toSummary(page) };
  });

  app.delete('/pages/:id', async (req, reply) => {
    const { actor } = requireAuth(req);
    const { id } = parse(idParams, req.params);
    const deleted = await ctx.pages.softDelete(actor, id);
    await notifyTree(req, actor.userId, deleted);
    return reply.code(204).send();
  });

  app.put('/pages/:id/content', { bodyLimit: 20 * 1024 * 1024 }, async (req) => {
    const { actor } = requireAuth(req);
    const { id } = parse(idParams, req.params);
    const input = parse(saveContentInput, req.body);
    const saved = await ctx.pages.saveContent(actor, id, input);
    await ctx.bus.publish(actor.userId, {
      type: 'page.content',
      pageId: id,
      version: saved.version,
      originClientId: originClientId(req),
    });
    const body: SaveContentResponse = {
      version: saved.version,
      updatedAt: saved.updatedAt.toISOString(),
    };
    return body;
  });
}
