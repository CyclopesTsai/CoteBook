import type { FastifyInstance } from 'fastify';
import { buildApp } from './app.js';
import { SessionService } from './auth/sessions.js';
import { loadConfig, type Config } from './config.js';
import { createDb } from './db/client.js';
import { runMigrations } from './db/migrate.js';
import { EventBus } from './events/bus.js';
import { PageService } from './services/pages.js';
import { createStorage } from './storage/index.js';

const config = loadConfig();

const { app, close } = config.databaseEnabled
  ? await startWithDatabase(config)
  : await startWithoutDatabase(config);

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  app.log.info(`${signal} received, shutting down`);
  try {
    await app.close();
    await close();
    process.exit(0);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

await app.listen({ host: config.host, port: config.port });

async function startWithDatabase(
  config: Config,
): Promise<{ app: FastifyInstance; close: () => Promise<void> }> {
  const { db, pool } = createDb(config.databaseUrl);
  try {
    if (config.runMigrations) await runMigrations(db, config.migrationsDir);
  } catch (err) {
    console.error(
      'Could not prepare the database. Check DATABASE_URL (with docker compose, also check ' +
        'that .env contains COMPOSE_PROFILES=database-true), or set DATABASE_ENABLED=false ' +
        'to run in demo mode without a database.',
    );
    throw err;
  }

  const storage = await createStorage(config);
  const sessions = new SessionService(db, config.sessionTtlMs);
  const bus = new EventBus(pool, { error: (obj, msg) => console.error(msg, obj) });
  await bus.start();

  const app = await buildApp(config, {
    config,
    db,
    sessions,
    pages: new PageService(db),
    storage,
    bus,
  });

  const purgeTimer = setInterval(
    () => sessions.purgeExpired().catch((err) => app.log.error(err, 'Session purge failed')),
    6 * 60 * 60 * 1000,
  );
  purgeTimer.unref();

  app.log.info(
    `Storage driver: ${storage.name}; registration ${config.allowRegistration ? 'open' : 'closed'}`,
  );
  return {
    app,
    close: async () => {
      await bus.close();
      await pool.end();
    },
  };
}

async function startWithoutDatabase(
  config: Config,
): Promise<{ app: FastifyInstance; close: () => Promise<void> }> {
  const app = await buildApp(config, null);
  app.log.warn(
    'DATABASE_ENABLED=false: running without a database. The web client opens in demo mode ' +
      'and nothing is saved.',
  );
  return { app, close: async () => {} };
}
