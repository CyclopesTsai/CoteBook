import type { SyncEvent } from '@cotebook/shared';
import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../auth/plugin.js';
import type { AppContext } from '../context.js';

const HEARTBEAT_MS = 25_000;

/**
 * Server-Sent Events stream of changes to the signed-in user's data. Clients use it to
 * refresh the page tree and open pages when another device edits them.
 */
export async function eventRoutes(app: FastifyInstance, ctx: AppContext) {
  app.get('/events', async (req, reply) => {
    const { user } = requireAuth(req);

    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // Disable response buffering in nginx so events are delivered immediately.
      'X-Accel-Buffering': 'no',
    });
    res.write('retry: 3000\n\n');

    const send = (event: SyncEvent) => {
      res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
    };
    const unsubscribe = ctx.bus.subscribe(user.id, send);
    const heartbeat = setInterval(() => res.write(': ping\n\n'), HEARTBEAT_MS);

    const cleanup = () => {
      clearInterval(heartbeat);
      unsubscribe();
    };
    req.raw.on('close', cleanup);
    res.on('error', cleanup);
  });
}
