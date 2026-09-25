import type { InstanceConfig } from '@cotebook/shared';
import type { FastifyInstance } from 'fastify';
import { sql } from 'drizzle-orm';
import type { AppContext } from '../context.js';
import { ALLOWED_UPLOAD_TYPES } from './uploads.js';

export async function metaRoutes(app: FastifyInstance, ctx: AppContext) {
  // Polled by container health checks; keep it out of the request log.
  app.get('/health', { logLevel: 'warn' }, async (_req, reply) => {
    try {
      await ctx.db.execute(sql`SELECT 1`);
      return { status: 'ok' };
    } catch {
      return reply.code(503).send({ status: 'unavailable' });
    }
  });

  app.get('/config', async () => {
    const body: InstanceConfig = {
      registrationEnabled: ctx.config.allowRegistration,
      // Reserved: list providers whose credentials are configured (e.g. 'google', 'apple').
      authProviders: [],
      maxUploadBytes: ctx.config.maxUploadBytes,
      allowedUploadTypes: ALLOWED_UPLOAD_TYPES,
    };
    return body;
  });
}
