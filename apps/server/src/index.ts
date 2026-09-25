import { buildApp } from './app.js';
import { SessionService } from './auth/sessions.js';
import { loadConfig } from './config.js';
import { createDb } from './db/client.js';
import { runMigrations } from './db/migrate.js';
import { EventBus } from './events/bus.js';
import { PageService } from './services/pages.js';
import { createStorage } from './storage/index.js';

const config = loadConfig();
const { db, pool } = createDb(config.databaseUrl);

if (config.runMigrations) {
  await runMigrations(db, config.migrationsDir);
}

const storage = await createStorage(config);
const sessions = new SessionService(db, config.sessionTtlMs);
const bus = new EventBus(pool, { error: (obj, msg) => console.error(msg, obj) });
await bus.start();

const app = await buildApp({
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

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  app.log.info(`${signal} received, shutting down`);
  try {
    await app.close();
    await bus.close();
    await pool.end();
    process.exit(0);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

await app.listen({ host: config.host, port: config.port });
app.log.info(
  `Storage driver: ${storage.name}; registration ${config.allowRegistration ? 'open' : 'closed'}`,
);
