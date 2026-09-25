import { z } from 'zod';
import { blockSchema, type Block } from './blocks.js';

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 256;

export const registerInput = z.object({
  email: z.email().max(254),
  password: z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH),
  displayName: z.string().trim().max(100).optional(),
  /** Native clients set this to receive a bearer token instead of relying on a cookie. */
  returnToken: z.boolean().optional(),
});
export type RegisterInput = z.infer<typeof registerInput>;

export const loginInput = z.object({
  email: z.email().max(254),
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
  returnToken: z.boolean().optional(),
});
export type LoginInput = z.infer<typeof loginInput>;

export interface User {
  id: string;
  email: string;
  displayName: string | null;
  emailVerified: boolean;
  createdAt: string;
}

export interface AuthResponse {
  user: User;
  /** Only present when `returnToken` was requested. Send as `Authorization: Bearer <token>`. */
  token?: string;
}

/** Public, unauthenticated instance configuration. */
export interface InstanceConfig {
  registrationEnabled: boolean;
  /** Third-party login providers configured on this instance (none yet). */
  authProviders: string[];
  maxUploadBytes: number;
  allowedUploadTypes: string[];
}

// ---------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------

export const PAGE_TITLE_MAX_LENGTH = 500;

/** Lightweight page representation used for the sidebar tree. */
export interface PageSummary {
  id: string;
  parentId: string | null;
  title: string;
  /** Opaque sort key; siblings are ordered by comparing these strings (not locale-aware). */
  position: string;
  icon: string | null;
  updatedAt: string;
}

export interface PageDetail extends PageSummary {
  coverUrl: string | null;
  isLocked: boolean;
  createdAt: string;
  /** Incremented on every content save; used for optimistic concurrency. */
  version: number;
  blocks: Block[];
}

export const createPageInput = z.object({
  parentId: z.uuid().nullable().optional(),
  title: z.string().max(PAGE_TITLE_MAX_LENGTH).optional(),
});
export type CreatePageInput = z.infer<typeof createPageInput>;

export const updatePageInput = z.object({
  title: z.string().max(PAGE_TITLE_MAX_LENGTH).optional(),
});
export type UpdatePageInput = z.infer<typeof updatePageInput>;

export const movePageInput = z.object({
  parentId: z.uuid().nullable(),
  /** Target index among the new siblings, not counting the moved page itself. */
  index: z.number().int().min(0),
});
export type MovePageInput = z.infer<typeof movePageInput>;

export const saveContentInput = z.object({
  /** The version the client's edits are based on. */
  baseVersion: z.number().int().min(0),
  blocks: z.array(blockSchema),
  /** Skip the version check and overwrite whatever is stored. */
  force: z.boolean().optional(),
});
export type SaveContentInput = z.infer<typeof saveContentInput>;

export interface SaveContentResponse {
  version: number;
  updatedAt: string;
}

export interface VersionConflictDetails {
  currentVersion: number;
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export const searchQuery = z.object({
  q: z.string().trim().min(1).max(200),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

export interface SearchResult {
  pageId: string;
  title: string;
  /** Where the best match was found. */
  matchedIn: 'title' | 'content';
  /** A short excerpt around the match (content matches only). */
  snippet: string | null;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Uploads
// ---------------------------------------------------------------------------

export interface UploadResponse {
  id: string;
  url: string;
  mimeType: string;
  size: number;
}

// ---------------------------------------------------------------------------
// Realtime events (Server-Sent Events on GET /api/events)
// ---------------------------------------------------------------------------

export type SyncEvent =
  /** The page tree changed (create / rename / move / delete). */
  | { type: 'pages.changed'; pageIds: string[]; originClientId: string | null }
  /** A page's content was saved. */
  | { type: 'page.content'; pageId: string; version: number; originClientId: string | null };

/** Header clients send so they can ignore events caused by their own requests. */
export const CLIENT_ID_HEADER = 'x-client-id';
