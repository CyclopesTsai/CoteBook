# Architecture

## Overview

```
 Browser (React SPA)  ─┐
 Future native apps   ─┼─ HTTPS ─▶  Fastify server  ──▶  PostgreSQL
                       │            │    │
                       │            │    └─ file storage (local disk | S3)
                       └─ SSE ◀─────┘  (sync events via Postgres LISTEN/NOTIFY)
```

The server exposes a JSON API under `/api`. In production it also serves the built web
client. The web client uses only this public API, so native apps can use exactly the same
endpoints.

## Data model

| Table             | Purpose                                                                                                                          |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `users`           | Account. Includes reserved columns for `email_verified` and 2FA (`two_factor_*`).                                                |
| `auth_identities` | Reserved: third-party sign-in (`provider`, `provider_account_id`), for example Google and Apple.                                 |
| `sessions`        | Login sessions. Only a SHA-256 hash of the token is stored.                                                                      |
| `user_tokens`     | Reserved: single-use password-reset and email-verification tokens (hashed).                                                      |
| `pages`           | Page tree (`parent_id`, fractional-index `position`), title, content `version`, soft-delete columns.                             |
| `blocks`          | Page content, one row per block: `(page_id, id)` key, `parent_block_id`, `sort_index`, `type`, `props`, `content`, `plain_text`. |
| `uploads`         | Uploaded files and their storage keys.                                                                                           |
| `share_links`     | Reserved: read-only share links (hashed token, enabled flag, expiry, password hash, indexing, subpages).                         |

### Pages

- **Ordering**: siblings are ordered by `position`, a
  [fractional index](https://github.com/rocicorp/fractional-indexing) string compared
  byte by byte. Moving a page only rewrites that page's key.
- **Soft delete**: deleting a page sets `deleted_at` on the page and all of its
  descendants, and records the page the user actually deleted in `deleted_root_id`. A
  future trash can restore the whole subtree using that value.
- **Tree changes**: create, move and delete take a per-user row lock, so cycle checks and
  sibling ordering stay consistent.

### Blocks

The document format matches the BlockNote document model (`id`, `type`, `props`,
`content`, `children`) and is defined without browser-specific types in
`packages/shared/src/blocks.ts`. The server stores any block type it receives. New block
types therefore need changes to clients only.

A save replaces the page's whole block tree in one transaction. Rows are upserted by id,
and only blocks that actually changed get a new `updated_at`.

## Sync and conflicts

1. Each page has an integer `version`. The client sends the version its edits are based on
   (`baseVersion`). If another device saved first, the server answers `409 version_conflict`.
2. Every change is published with `pg_notify`. Each server instance forwards events for a
   user to that user's open `GET /api/events` Server-Sent Events streams, so several
   instances can run behind a load balancer.
3. Each browser tab sends a random `X-Client-Id` header, which lets it ignore events it
   caused itself. When another device changes the open page, the client loads the new
   version if it has no unsaved edits. If it does, it asks the user whether to load the
   other version or keep their own (a forced save).
4. After a reconnect the client refetches everything, since events may have been missed.

## Running without a database

With `DATABASE_ENABLED=false`, the server connects to no database, runs no migrations and
starts no event bus. It registers only `/api/health` and `/api/config`. Every other
`/api` route answers `503 database_disabled`, and registration is reported as closed.

The web client reads `databaseEnabled` from `/api/config` before anything else. When it
is `false`, the client renders `DemoApp` (`apps/web/src/demo/`) instead of the signed-in
app. The demo reuses the same editor schema, page tree and layout components, but backs
them with an in-memory store. Images become `blob:` URLs, and nothing is sent to the
server.

## Authorization

All permission decisions live in `apps/server/src/auth/authz.ts`. A request acts as an
`Actor`, which is currently always `{ kind: 'user' }`. Read-only sharing will add an actor
kind for share links and a branch in `canAccessPage`. Routes won't need to change.
Resources the actor may not see return `404`, so ids can't be probed.

The page view component (`PageView`) takes a `readOnly` prop. With it, the page renders
without any editing affordances, ready for public share pages.

## Authentication

- Passwords are hashed with argon2id.
- The web client uses an `HttpOnly`, `SameSite=Lax` cookie. Cookie-authenticated writes
  are also rejected when their `Origin` doesn't belong to the instance.
- Native clients send `"returnToken": true` when logging in and then authenticate with
  `Authorization: Bearer <token>`.
- Login and registration are rate-limited.

## HTTP API

All endpoints are prefixed with `/api`. Request and response types are defined in
`packages/shared/src/api.ts`. Errors are returned as
`{ "error": { "code": "...", "message": "...", "details"?: ... } }`, and clients should
branch on `code`.

| Method   | Path                 | Description                                                                              |
| -------- | -------------------- | ---------------------------------------------------------------------------------------- |
| `GET`    | `/health`            | Liveness and database check                                                              |
| `GET`    | `/config`            | Public settings: database enabled, registration open, auth providers, upload limits      |
| `POST`   | `/auth/register`     | `{ email, password, displayName?, returnToken? }`                                        |
| `POST`   | `/auth/login`        | `{ email, password, returnToken? }`                                                      |
| `POST`   | `/auth/logout`       | Revoke the current session                                                               |
| `GET`    | `/auth/me`           | Current user                                                                             |
| `GET`    | `/pages`             | Flat list of all pages (for building the tree)                                           |
| `POST`   | `/pages`             | `{ parentId?, title? }`. Appends the page as the last child.                             |
| `GET`    | `/pages/:id`         | Page with `version` and its `blocks` tree                                                |
| `PATCH`  | `/pages/:id`         | `{ title? }`                                                                             |
| `POST`   | `/pages/:id/move`    | `{ parentId, index }`. `index` counts the new siblings, excluding the moved page.        |
| `DELETE` | `/pages/:id`         | Soft-delete the page and its subpages                                                    |
| `PUT`    | `/pages/:id/content` | `{ baseVersion, blocks, force? }` → `{ version }`, or `409 version_conflict`             |
| `GET`    | `/search?q=&limit=`  | Title and content search                                                                 |
| `POST`   | `/uploads?pageId=`   | `multipart/form-data` with a `file` field (PNG, JPEG, GIF, WebP or AVIF) → `{ id, url }` |
| `GET`    | `/files/:id`         | Download an uploaded file (owner only)                                                   |
| `GET`    | `/events`            | Server-Sent Events: `pages.changed`, `page.content`                                      |

Uploads are identified by their content (magic bytes), not the declared type. SVG is
rejected because it can carry scripts.
