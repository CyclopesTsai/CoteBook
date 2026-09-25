import { migrate } from 'drizzle-orm/node-postgres/migrator';
import type { Database } from './client.js';

export async function runMigrations(db: Database, migrationsFolder: string) {
  await migrate(db, { migrationsFolder });
}
