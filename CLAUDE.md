# CoteBook: notes for Claude Code

Open-source, self-hostable, single-user notes app with a Notion-style block editor.

- **Read [`docs/status.md`](docs/status.md) first.** It covers what's done, the decisions
  made and why, what's still open, and what's waiting on the owner.
- The product spec is [`docs/spec.zh-TW.md`](docs/spec.zh-TW.md) (Traditional Chinese). Its
  tags are `MVP` (first release), `後續` (later) and `預留` (reserve the data model and
  extension points only, don't build the feature).

The owner writes in Traditional Chinese. Reply in Traditional Chinese, but keep code,
comments, commit messages and docs in English, as the spec recommends.

## Layout

- `apps/server`: Fastify API under `/api`, PostgreSQL via Drizzle. Bundled with tsup and
  also serves the built web client.
- `apps/web`: React + Vite SPA, BlockNote editor, TanStack Query, dnd-kit, i18next.
- `packages/shared`: zod request schemas and response types. This is the API contract,
  also meant for future native apps.
- `docs/`: self-hosting, development, architecture (data model and HTTP API), status.
- `scripts/smoke/`: Playwright scripts that drive real flows and print what they see.

## Commands

```bash
npm install
cp .env.example .env              # set DATABASE_URL for a local PostgreSQL
npm run dev                       # API :3000 + web :5173 (proxies /api)
DATABASE_ENABLED=false npm run dev  # no PostgreSQL needed: web opens in demo mode
npm run lint && npm run typecheck && npm run format:check
npm run build                     # web + server production build
npm run db:generate -- --name <change>   # after editing apps/server/src/db/schema.ts
node scripts/smoke/editing.mjs    # see scripts/smoke/README.md (needs `npx playwright install chromium`)
docker compose up -d              # full stack; needs Compose >= 2.20
```

## Rules of the codebase

- **UI text:** never hard-code it. Add keys to both `apps/web/src/i18n/locales/en.json`
  and `zh-TW.json`; the keys are type-checked.
- **API shapes:** change `packages/shared/src/api.ts` first, then the server, then the
  client. Errors are `{ error: { code, message } }`, and the codes live in
  `packages/shared/src/errors.ts`.
- **Permissions:** every access check goes through `apps/server/src/auth/authz.ts`.
  Missing or foreign resources return 404.
- **Configuration:** env vars only, validated in `apps/server/src/config.ts`. Document new
  ones in `.env.example`. Never commit secrets, keys or hostnames.
- **Styling:** use the CSS variables in `apps/web/src/styles/theme.css`, never literal colors.
- **Schema changes:** generate a new migration. Never edit a released one.
- **Dependencies:** licenses must be compatible with AGPL-3.0. Don't add BlockNote `xl-*`
  packages (GPL or commercial).
- **Editor blocks:** the allowed block types are listed in `apps/web/src/editor/schema.ts`.
  The server stores any block type it receives.
- **Demo mode:** `apps/web/src/demo/` reuses `PageTree`, `LayoutShell`, `BlockEditor`,
  `TitleField` and `UndoRedoButtons`. Keep those components free of API calls; pass
  callbacks in instead.

## Gotchas

- `DATABASE_ENABLED` accepts only `true` or `false`. Docker Compose builds the `db`
  service's profile name from it, and `.env` must keep `COMPOSE_PROFILES=database-true`.
- Page order uses fractional-index strings. Compare them byte by byte (`<`), never with
  `localeCompare` or SQL collation ordering.
- `PageView` (`apps/web/src/editor/PageView.tsx`) loads a page's content into the editor
  only once. Later remote versions arrive through query refetches, and autosave
  (`useAutosave.ts`) decides whether to apply them or show the conflict banner. Don't key
  the editor by version.
