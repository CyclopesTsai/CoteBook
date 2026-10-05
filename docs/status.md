# Project status and handoff notes

Last updated: 2026-10-05. Work so far was done in Claude Code cloud sessions on the branch
`claude/zealous-turing-6h6glm`. **Nothing has been merged into a main branch and no pull
request exists yet.**

The product spec is [`spec.zh-TW.md`](spec.zh-TW.md) (Traditional Chinese). Its status tags
are `MVP` (first release), `後續` ("later") and `預留` ("reserved": prepare the data model
and extension points, but don't build the feature).

## 1. Where things stand

**Every `MVP` item in the spec is implemented**, and so is one feature that isn't in the spec
(the database switch / demo mode, see §3). All of it was verified with the browser scripts in
[`scripts/smoke/`](../scripts/smoke/README.md), both against the dev servers and against the
production Docker image. Lint, typecheck and `npm run build` pass.

| Spec area        | Done                                                                                                                                                                             |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3.1 Accounts     | Email/password register, login, logout                                                                                                                                           |
| 3.2 Pages        | Create, rename, soft delete (with subpages), unlimited nesting, sidebar tree with drag-and-drop (mouse and touch)                                                                |
| 3.3 Editor       | BlockNote: paragraph, H1–H3, bulleted/numbered/to-do lists, slash menu, block drag handle, bold/italic/underline/strike/inline code/link/text color, undo/redo (also as buttons) |
| 3.4 Media        | Image upload (PNG/JPEG/GIF/WebP/AVIF, checked by magic bytes)                                                                                                                    |
| 3.6 Search       | Title and content search (substring, works for CJK)                                                                                                                              |
| 3.8 Platforms    | Responsive web app; cross-device sync (live updates over SSE, version-checked saves with a conflict prompt)                                                                      |
| 5.2 Self-hosting | Docker Compose (app + PostgreSQL), `.env.example`, local storage, automatic migrations                                                                                           |
| 5.3 Docs         | README (en + zh-TW), LICENSE, `.env.example`, `docs/self-hosting.md`, `docs/development.md`, `docs/architecture.md`                                                              |
| 5.4 Code style   | ESLint + Prettier                                                                                                                                                                |

Done ahead of the spec:

- **Multi-language UI** (spec: later). English and Traditional Chinese, with every string in
  `apps/web/src/i18n/locales/*.json`.
- **S3-compatible storage driver** (spec: reserved). Implemented in
  `apps/server/src/storage/s3.ts`, **but never tested against a real S3 or MinIO**.
- **Markdown shortcuts** (spec: later). BlockNote has them built in (e.g. `# ` turns a line
  into a heading). They are enabled, but untested.

## 2. Decisions made, and why

| Decision                                                     | Reason / notes                                                                                                                                                                                                                                                                                                                        |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **License: AGPL-3.0-only** (provisional)                     | The spec left the license open. AGPL best matches "prevent closed-source SaaS wrappers". **The owner still has to confirm this before the code is made public.** Every dependency is AGPL-compatible (MIT, Apache-2.0, MPL-2.0, ISC, BSD, CC0).                                                                                       |
| TypeScript monorepo (npm workspaces)                         | `apps/server` (Fastify), `apps/web` (React + Vite), `packages/shared` (zod schemas and types shared with future native apps)                                                                                                                                                                                                          |
| PostgreSQL + Drizzle ORM                                     | SQL migrations live in `apps/server/drizzle/` and run on startup                                                                                                                                                                                                                                                                      |
| BlockNote editor (MPL-2.0)                                   | Provides the slash menu, block drag, formatting toolbar and undo out of the box. Only MVP block types are enabled in `apps/web/src/editor/schema.ts`. Don't use BlockNote's `xl-*` packages: they are GPL or commercial.                                                                                                              |
| Content stored one row per block                             | The spec requires block-based storage. A save replaces the page's whole block tree in one transaction, but unchanged rows keep their `updated_at`.                                                                                                                                                                                    |
| Optimistic concurrency with a page `version`                 | Saves send `baseVersion`; a stale one returns `409`. The client then asks "load theirs / keep mine" instead of silently overwriting.                                                                                                                                                                                                  |
| Sync via SSE + Postgres `LISTEN/NOTIFY`                      | No extra infrastructure, and it works across several server instances. Clients tag requests with `X-Client-Id` so they can ignore their own events.                                                                                                                                                                                   |
| Substring search (`ILIKE`)                                   | Postgres full-text search doesn't segment Chinese. Fine at personal scale. Revisit (e.g. `pg_trgm`) if it gets slow.                                                                                                                                                                                                                  |
| Fractional-index `position` for page order                   | Moving a page rewrites one row. Tree changes take a per-user row lock.                                                                                                                                                                                                                                                                |
| Soft delete marks the whole subtree                          | `deleted_at` is set on the page and its descendants, and `deleted_root_id` records which page the user deleted, ready for a trash/restore feature.                                                                                                                                                                                    |
| Cookie auth for web, bearer tokens for apps                  | `returnToken: true` on login returns a token. Cookie writes are also origin-checked.                                                                                                                                                                                                                                                  |
| Central authorization in `auth/authz.ts`                     | The spec asks for this so that share links can be added later. Unauthorised access returns 404.                                                                                                                                                                                                                                       |
| No SVG uploads                                               | SVG can carry scripts                                                                                                                                                                                                                                                                                                                 |
| **`DATABASE_ENABLED` switch + demo mode** (added on request) | With `false`, the server needs no PostgreSQL and the web app opens an in-memory demo (`apps/web/src/demo/`). Compose doesn't start the `db` container: its profile is `database-${DATABASE_ENABLED}`, activated by the fixed `COMPOSE_PROFILES=database-true` line in `.env`. That's why the variable accepts only `true` or `false`. |
| README stays English-first                                   | The owner considered making Chinese the default on GitHub (swap `README.md` and `README.zh-TW.md`) and decided **not** to for now.                                                                                                                                                                                                    |

## 3. Waiting on the owner

1. **Confirm the license** (currently AGPL-3.0-only) before making the repository public.
2. **Open a PR / merge** `claude/zealous-turing-6h6glm` into the main branch.
3. **Pick what to build next.** Suggested order in §5.

## 4. Not built yet

### Reserved (`預留`): data model ready, feature not built

| Feature                                  | What already exists                                                                           |
| ---------------------------------------- | --------------------------------------------------------------------------------------------- |
| Google / Apple sign-in                   | `auth_identities` table; `authProviders` in `/api/config` (empty)                             |
| Password reset, email verification, SMTP | `users.email_verified`, `user_tokens` table, commented `SMTP_*` in `.env.example`             |
| Two-factor auth                          | `users.two_factor_*` columns; a comment marks where login would return a 2FA challenge        |
| Read-only share links (whole module)     | `share_links` table, `PageView readOnly` prop, `Actor` type in `authz.ts`                     |
| Mobile apps                              | API-first design, bearer tokens. **Account deletion must be added before app store release.** |

### Later (`後續`)

- **Accounts:** dark theme. All colors are already CSS variables in `apps/web/src/styles/theme.css`.
- **Pages:** icons and covers (`icon`/`cover_url` columns exist), favorites, recently viewed,
  trash and restore (soft delete is ready), duplicate, a dedicated "move to…" action
  (drag-and-drop works today), page lock (`is_locked` exists).
- **Editor:** toggle, quote, callout, divider, code block with highlighting, simple table,
  columns, math, block type conversion, synced blocks, table of contents, breadcrumbs. Most
  are BlockNote built-ins that only need enabling in `editor/schema.ts` and the formatting
  toolbar in `editor/BlockEditor.tsx`.
- **Media:** file attachments, video, audio, link previews, embeds, PDF preview.
  `routes/uploads.ts` allows images only.
- **Search:** quick switcher (Ctrl/Cmd + K), filters, backlinks.
- **History and import/export:** page history, export to PDF/Markdown/HTML, import from
  Notion/Evernote/Markdown.
- **Platforms:** desktop app, offline editing, share extension, web clipper.
- **Other:** keyboard shortcuts, font and page width settings, documented public API.
- **Project docs:** `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, `CHANGELOG.md`.
- **Process:** automated tests, CI (lint + typecheck + tests on PRs), issue and PR templates,
  SemVer releases.

## 5. Known gaps in what exists

- **No automated tests.** `scripts/smoke/*.mjs` print observations rather than assert. They
  are the best starting point for a real Playwright suite.
- **Block drag handle not exercised by any script.** It comes from BlockNote and is visible.
  Touch dragging on phones was never checked.
- **The sidebar tree has no keyboard drag-and-drop.** dnd-kit's keyboard sensor isn't wired
  up for the tree.
- **Orphaned uploads.** Deleting a page, or an image block, never removes the stored file.
  Add cleanup together with trash/restore.
- **The S3 driver is untested.**
- **Migrations aren't guarded by a lock.** With several app replicas starting at once, two
  could try to migrate simultaneously. Fine for single-instance self-hosting.
- **The Docker build was only run inside the cloud sandbox**, with an extra CA certificate
  injected through a temporary copy of the Dockerfile. The committed `Dockerfile` itself is
  unchanged and should build normally on a regular machine.

Suggested next steps, in order:

1. Merge to main, then add CI (lint, typecheck, build) and turn `scripts/smoke` into a
   Playwright test suite.
2. Trash and restore, including orphaned upload cleanup.
3. Dark theme and the quick switcher (small, visible wins).
4. Read-only share links (the groundwork is in place).

## 6. Working locally

See [`development.md`](development.md). In short: Node 22+, PostgreSQL 14+, `npm install`,
`cp .env.example .env` (set `DATABASE_URL`), `npm run dev`. Without PostgreSQL, run
`DATABASE_ENABLED=false npm run dev` to get the demo mode.
