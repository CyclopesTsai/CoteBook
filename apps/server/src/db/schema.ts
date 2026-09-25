import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
};

// ---------------------------------------------------------------------------
// Users & authentication
// ---------------------------------------------------------------------------

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Stored lower-cased. */
    email: text('email').notNull(),
    /** Reserved: email verification. */
    emailVerified: boolean('email_verified').notNull().default(false),
    /** Null for accounts that only sign in through a third-party provider (reserved). */
    passwordHash: text('password_hash'),
    displayName: text('display_name'),
    /** Reserved: two-factor authentication (TOTP). */
    twoFactorEnabled: boolean('two_factor_enabled').notNull().default(false),
    twoFactorSecret: text('two_factor_secret'),
    twoFactorRecoveryCodes: jsonb('two_factor_recovery_codes').$type<string[]>(),
    ...timestamps,
  },
  (t) => [uniqueIndex('users_email_unique').on(t.email)],
);

/**
 * Reserved: third-party sign-in (Google, Apple, ...). One user may have several
 * identities; `provider` + `providerAccountId` is globally unique.
 */
export const authIdentities = pgTable(
  'auth_identities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    providerAccountId: text('provider_account_id').notNull(),
    email: text('email'),
    createdAt: timestamps.createdAt,
  },
  (t) => [
    uniqueIndex('auth_identities_provider_account_unique').on(t.provider, t.providerAccountId),
    index('auth_identities_user_idx').on(t.userId),
  ],
);

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** SHA-256 of the session token; the token itself is never stored. */
    tokenHash: text('token_hash').notNull(),
    userAgent: text('user_agent'),
    createdAt: timestamps.createdAt,
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    uniqueIndex('sessions_token_hash_unique').on(t.tokenHash),
    index('sessions_user_idx').on(t.userId),
  ],
);

/**
 * Reserved: single-use tokens for password reset and email verification.
 * `purpose` is one of 'password_reset' | 'email_verification'.
 */
export const userTokens = pgTable(
  'user_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    purpose: text('purpose').notNull(),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamps.createdAt,
  },
  (t) => [
    uniqueIndex('user_tokens_token_hash_unique').on(t.tokenHash),
    index('user_tokens_user_purpose_idx').on(t.userId, t.purpose),
  ],
);

// ---------------------------------------------------------------------------
// Pages & blocks
// ---------------------------------------------------------------------------

export const pages = pgTable(
  'pages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    parentId: uuid('parent_id').references((): AnyPgColumn => pages.id, { onDelete: 'cascade' }),
    title: text('title').notNull().default(''),
    /** Fractional-index sort key among siblings (compare with "C" collation). */
    position: text('position').notNull(),
    /** Later: emoji icon and cover image. */
    icon: text('icon'),
    coverUrl: text('cover_url'),
    /** Later: page lock. */
    isLocked: boolean('is_locked').notNull().default(false),
    /** Content version, incremented on every content save. */
    version: integer('version').notNull().default(0),
    /**
     * Soft delete. Deleting a page stamps it and all of its descendants with the same
     * timestamp; `deletedRootId` records which page the user actually deleted, so a
     * future trash view can restore the whole subtree at once.
     */
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    deletedRootId: uuid('deleted_root_id'),
    ...timestamps,
  },
  (t) => [
    index('pages_user_parent_idx').on(t.userId, t.parentId),
    index('pages_user_active_idx')
      .on(t.userId)
      .where(sql`${t.deletedAt} IS NULL`),
  ],
);

/**
 * Page content, one row per block. `id` is the client-generated block id, unique
 * within its page. Order among siblings is given by `sortIndex`.
 */
export const blocks = pgTable(
  'blocks',
  {
    pageId: uuid('page_id')
      .notNull()
      .references(() => pages.id, { onDelete: 'cascade' }),
    id: text('id').notNull(),
    parentBlockId: text('parent_block_id'),
    sortIndex: integer('sort_index').notNull(),
    type: text('type').notNull(),
    props: jsonb('props').$type<Record<string, unknown>>().notNull().default({}),
    content: jsonb('content'),
    /** Plain text of the block's inline content, for search. */
    plainText: text('plain_text').notNull().default(''),
    ...timestamps,
  },
  (t) => [
    primaryKey({ columns: [t.pageId, t.id] }),
    index('blocks_page_parent_idx').on(t.pageId, t.parentBlockId, t.sortIndex),
  ],
);

// ---------------------------------------------------------------------------
// Uploads
// ---------------------------------------------------------------------------

export const uploads = pgTable(
  'uploads',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** The page the file was first uploaded to, if known. */
    pageId: uuid('page_id').references(() => pages.id, { onDelete: 'set null' }),
    storageKey: text('storage_key').notNull(),
    mimeType: text('mime_type').notNull(),
    size: integer('size').notNull(),
    originalName: text('original_name'),
    createdAt: timestamps.createdAt,
  },
  (t) => [index('uploads_user_idx').on(t.userId)],
);

// ---------------------------------------------------------------------------
// Reserved: read-only share links
// ---------------------------------------------------------------------------

export const shareLinks = pgTable(
  'share_links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    pageId: uuid('page_id')
      .notNull()
      .references(() => pages.id, { onDelete: 'cascade' }),
    /** SHA-256 of the public link token. */
    tokenHash: text('token_hash').notNull(),
    enabled: boolean('enabled').notNull().default(true),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    passwordHash: text('password_hash'),
    allowIndexing: boolean('allow_indexing').notNull().default(false),
    includeSubpages: boolean('include_subpages').notNull().default(false),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('share_links_token_hash_unique').on(t.tokenHash),
    index('share_links_page_idx').on(t.pageId),
  ],
);
