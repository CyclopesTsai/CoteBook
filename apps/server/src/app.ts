import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import type { ApiErrorBody } from '@cotebook/shared';
import { ErrorCode } from '@cotebook/shared';
import Fastify, { type FastifyError } from 'fastify';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { registerAuth } from './auth/plugin.js';
import type { Config } from './config.js';
import type { AppContext } from './context.js';
import { HttpError } from './lib/errors.js';
import { authRoutes } from './routes/auth.js';
import { eventRoutes } from './routes/events.js';
import { metaRoutes } from './routes/meta.js';
import { pageRoutes } from './routes/pages.js';
import { searchRoutes } from './routes/search.js';
import { uploadRoutes } from './routes/uploads.js';

function errorBody(code: ErrorCode, message: string, details?: unknown): ApiErrorBody {
  return { error: details === undefined ? { code, message } : { code, message, details } };
}

/**
 * Builds the HTTP server. `ctx` is null when the instance runs without a database
 * (DATABASE_ENABLED=false): only the public metadata endpoints and the web client are
 * served then, and the client switches to its demo mode.
 */
export async function buildApp(config: Config, ctx: AppContext | null) {
  const app = Fastify({
    logger: {
      level: config.logLevel,
      redact: ['req.headers.authorization', 'req.headers.cookie'],
    },
    trustProxy: config.trustProxy,
  });

  app.setErrorHandler((err: FastifyError | HttpError, req, reply) => {
    if (err instanceof HttpError) {
      return reply.code(err.statusCode).send(errorBody(err.code, err.message, err.details));
    }
    const status = err.statusCode ?? 500;
    if (status === 429) {
      return reply.code(429).send(errorBody(ErrorCode.RateLimited, 'Too many requests'));
    }
    if (status === 413 || err.code === 'FST_REQ_FILE_TOO_LARGE') {
      return reply.code(413).send(errorBody(ErrorCode.PayloadTooLarge, 'Payload too large'));
    }
    if (status === 415) {
      return reply.code(415).send(errorBody(ErrorCode.UnsupportedMediaType, err.message));
    }
    if (status >= 400 && status < 500) {
      return reply.code(status).send(errorBody(ErrorCode.BadRequest, err.message));
    }
    req.log.error(err);
    return reply.code(500).send(errorBody(ErrorCode.Internal, 'Internal server error'));
  });

  await app.register(cookie);
  if (config.corsOrigins.length) {
    await app.register(cors, { origin: config.corsOrigins, credentials: true });
  }
  await app.register(rateLimit, { global: false });
  await app.register(multipart, { limits: { fileSize: config.maxUploadBytes, files: 1 } });

  if (ctx) registerAuth(app, ctx);

  await app.register(
    async (api) => {
      await metaRoutes(api, config, ctx?.db ?? null);
      if (!ctx) return;
      await authRoutes(api, ctx);
      await pageRoutes(api, ctx);
      await searchRoutes(api, ctx);
      await uploadRoutes(api, ctx);
      await eventRoutes(api, ctx);
    },
    { prefix: '/api' },
  );

  const hasWeb = existsSync(path.join(config.webDistDir, 'index.html'));
  if (hasWeb) {
    await app.register(fastifyStatic, {
      root: config.webDistDir,
      wildcard: false,
      setHeaders(res, filePath) {
        const hashedAsset = filePath.includes(`${path.sep}assets${path.sep}`);
        res.header(
          'Cache-Control',
          hashedAsset ? 'public, max-age=31536000, immutable' : 'no-cache',
        );
      },
    });
  } else {
    app.log.warn(`Web client not found at ${config.webDistDir}; serving the API only`);
  }

  app.setNotFoundHandler((req, reply) => {
    const isApi = req.url === '/api' || req.url.startsWith('/api/');
    if (hasWeb && !isApi && (req.method === 'GET' || req.method === 'HEAD')) {
      // Client-side routing: unknown paths get the SPA shell.
      return reply.header('Cache-Control', 'no-cache').sendFile('index.html');
    }
    if (isApi && !ctx) {
      return reply
        .code(503)
        .send(errorBody(ErrorCode.DatabaseDisabled, 'This instance runs without a database'));
    }
    return reply.code(404).send(errorBody(ErrorCode.NotFound, 'Route not found'));
  });

  return app;
}
