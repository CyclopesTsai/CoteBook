import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const here = path.dirname(fileURLToPath(import.meta.url));
/** apps/server — works both from src/ (tsx) and dist/ (bundled). */
const serverRoot = path.resolve(here, '..');

const bool = z
  .enum(['true', 'false', '1', '0', 'yes', 'no'])
  .transform((v) => v === 'true' || v === '1' || v === 'yes');

const csv = z.string().transform((v) =>
  v
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
);

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  /** Public URL the instance is reached at, e.g. https://notes.example.com */
  APP_URL: z.url().default('http://localhost:3000'),
  /** Extra origins allowed to call the API with credentials (comma separated). */
  CORS_ORIGINS: csv.default([]),
  /** Set when running behind a reverse proxy so client IPs and protocol are read correctly. */
  TRUST_PROXY: bool.default(false),

  /**
   * Set to false to run without PostgreSQL: the web client then opens in demo mode and
   * every API that needs the database answers 503 `database_disabled`. Only the literal
   * values true / false are accepted, because docker compose derives the database
   * container's profile from this same value.
   */
  DATABASE_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  DATABASE_URL: z.string().optional(),
  RUN_MIGRATIONS: bool.default(true),

  ALLOW_REGISTRATION: bool.default(true),
  SESSION_TTL_DAYS: z.coerce.number().int().positive().default(30),
  /** Defaults to true when APP_URL is https. */
  COOKIE_SECURE: bool.optional(),

  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  STORAGE_LOCAL_DIR: z.string().default(path.resolve(serverRoot, '../../data/uploads')),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default('us-east-1'),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_FORCE_PATH_STYLE: bool.default(true),
  MAX_UPLOAD_SIZE_MB: z.coerce.number().positive().default(10),

  /** Directory with the built web client. Served as a SPA when present. */
  WEB_DIST_DIR: z.string().default(path.resolve(serverRoot, '../web/dist')),
});

export type Config = ReturnType<typeof loadConfig>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Invalid environment configuration:\n${issues.join('\n')}`);
  }
  const e = parsed.data;

  if (e.DATABASE_ENABLED && !e.DATABASE_URL) {
    throw new Error(
      'Invalid environment configuration:\n  DATABASE_URL is required when DATABASE_ENABLED=true',
    );
  }
  if (e.STORAGE_DRIVER === 's3' && !e.S3_BUCKET) {
    throw new Error(
      'Invalid environment configuration:\n  S3_BUCKET is required when STORAGE_DRIVER=s3',
    );
  }

  const appUrl = new URL(e.APP_URL);
  return {
    env: e.NODE_ENV,
    isProduction: e.NODE_ENV === 'production',
    host: e.HOST,
    port: e.PORT,
    logLevel: e.LOG_LEVEL,
    appUrl,
    corsOrigins: e.CORS_ORIGINS,
    trustProxy: e.TRUST_PROXY,
    databaseEnabled: e.DATABASE_ENABLED,
    databaseUrl: e.DATABASE_URL ?? '',
    runMigrations: e.RUN_MIGRATIONS,
    migrationsDir: path.resolve(serverRoot, 'drizzle'),
    // Nobody can sign up (or sign in) without a database.
    allowRegistration: e.DATABASE_ENABLED && e.ALLOW_REGISTRATION,
    sessionTtlMs: e.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000,
    cookieSecure: e.COOKIE_SECURE ?? appUrl.protocol === 'https:',
    storage: {
      driver: e.STORAGE_DRIVER,
      localDir: path.resolve(e.STORAGE_LOCAL_DIR),
      s3: {
        endpoint: e.S3_ENDPOINT,
        region: e.S3_REGION,
        bucket: e.S3_BUCKET ?? '',
        accessKeyId: e.S3_ACCESS_KEY_ID,
        secretAccessKey: e.S3_SECRET_ACCESS_KEY,
        forcePathStyle: e.S3_FORCE_PATH_STYLE,
      },
    },
    maxUploadBytes: Math.floor(e.MAX_UPLOAD_SIZE_MB * 1024 * 1024),
    webDistDir: path.resolve(e.WEB_DIST_DIR),
  };
}
