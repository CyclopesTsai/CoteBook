import type { InstanceConfig } from '@cotebook/shared';
import type { FastifyInstance } from 'fastify';
import { sql } from 'drizzle-orm';
import type { Config } from '../config.js';
import type { Database } from '../db/client.js';
import { ALLOWED_UPLOAD_TYPES } from './uploads.js';

/** Public endpoints that work with or without a database (`db` is null without one). */
export async function metaRoutes(app: FastifyInstance, config: Config, db: Database | null) {
  // Polled by container health checks; keep it out of the request log.
  app.get('/health', { logLevel: 'warn' }, async (_req, reply) => {
    if (!db) return { status: 'ok', database: 'disabled' };
    try {
      await db.execute(sql`SELECT 1`);
      return { status: 'ok', database: 'ok' };
    } catch {
      return reply.code(503).send({ status: 'unavailable', database: 'unreachable' });
    }
  });

  app.get('/config', async () => {
    const body: InstanceConfig = {
      databaseEnabled: config.databaseEnabled,
      registrationEnabled: config.allowRegistration,
      // Reserved: list providers whose credentials are configured (e.g. 'google', 'apple').
      authProviders: [],
      maxUploadBytes: config.maxUploadBytes,
      allowedUploadTypes: ALLOWED_UPLOAD_TYPES,
    };
    return body;
  });
}
