import { searchQuery } from '@cotebook/shared';
import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../auth/plugin.js';
import type { AppContext } from '../context.js';
import { parse } from '../lib/validation.js';
import { searchPages } from '../services/search.js';

export async function searchRoutes(app: FastifyInstance, ctx: AppContext) {
  app.get('/search', async (req) => {
    const { actor } = requireAuth(req);
    const { q, limit } = parse(searchQuery, req.query);
    return { results: await searchPages(ctx.db, actor, q, limit ?? 20) };
  });
}
