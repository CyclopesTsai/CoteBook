import { loadConfig } from '../config.js';
import { createDb } from './client.js';
import { runMigrations } from './migrate.js';

const config = loadConfig();
const { db, pool } = createDb(config.databaseUrl);
try {
  await runMigrations(db, config.migrationsDir);
  console.log('Migrations applied.');
} finally {
  await pool.end();
}
