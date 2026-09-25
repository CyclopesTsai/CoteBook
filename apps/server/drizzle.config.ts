import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  // Only needed by drizzle-kit commands that talk to a database (not by `generate`).
  dbCredentials: { url: process.env.DATABASE_URL ?? '' },
});
