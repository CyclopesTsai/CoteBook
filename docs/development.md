# Development

## Prerequisites

- Node.js 22+ and npm 10+
- PostgreSQL 14+ running locally, or started with Docker:

  ```bash
  docker run -d --name cotebook-db -p 5432:5432 \
    -e POSTGRES_USER=cotebook -e POSTGRES_PASSWORD=cotebook -e POSTGRES_DB=cotebook \
    postgres:16-alpine
  ```

## Setup

```bash
npm install
cp .env.example .env
# set DATABASE_URL, e.g. postgres://cotebook:cotebook@localhost:5432/cotebook
npm run dev
```

`npm run dev` starts two processes:

- the API server on <http://localhost:3000> (`tsx watch`, reloads on change). It applies
  migrations on startup.
- the Vite dev server on <http://localhost:5173>, which proxies `/api` to the API server.

Open <http://localhost:5173>.

### Working on the UI without PostgreSQL

Set `DATABASE_ENABLED=false` in `.env`, or run
`DATABASE_ENABLED=false npm run dev`. The server then needs no database, and the web client
opens in demo mode (`apps/web/src/demo/`). The demo uses the real editor, page tree and
layout with in-memory sample pages, which makes it handy for editor and styling work.
Features that talk to the API (sign-in, saving, search, sync) are only available with a
database.

## Project layout

```
apps/
  server/            Fastify API (TypeScript, bundled with tsup)
    src/
      auth/          sessions, password hashing, central authorization (authz.ts)
      db/            Drizzle schema, client and migration runner
      events/        cross-device sync over Postgres LISTEN/NOTIFY
      routes/        HTTP routes, mounted under /api
      services/      page tree, content storage and search logic
      storage/       file storage drivers (local disk, S3)
    drizzle/         generated SQL migrations (committed)
  web/               React single-page app (Vite)
    src/
      api/           fetch client, TanStack Query hooks, sync event stream
      editor/        BlockNote schema, editor view and autosave
      sidebar/       page tree with drag and drop
      i18n/          i18next setup and translations (locales/*.json)
      styles/        theme tokens (CSS variables) and styles
packages/
  shared/            API types and zod schemas shared by server and clients
docs/                documentation and the product spec
```

## Common tasks

| Command                                   | What it does                                           |
| ----------------------------------------- | ------------------------------------------------------ |
| `npm run dev`                             | Run the API and the web client with reload             |
| `npm run build`                           | Production build of both apps                          |
| `npm start`                               | Run the built server (serves the built web client too) |
| `npm run typecheck`                       | Type-check every workspace                             |
| `npm run lint` / `npm run lint:fix`       | ESLint                                                 |
| `npm run format` / `npm run format:check` | Prettier                                               |
| `npm run db:generate -- --name <change>`  | Generate a migration from `schema.ts` changes          |
| `npm run db:migrate`                      | Apply migrations without starting the server           |

## Changing the database schema

1. Edit `apps/server/src/db/schema.ts`.
2. Run `npm run db:generate -- --name short_description`. This writes a new SQL file to
   `apps/server/drizzle/`.
3. Review the SQL and commit it together with the schema change.

Never edit a migration that has already been released. Add a new one instead.

## Conventions

- **Language**: code, comments, commit messages and docs are in English. The UI is
  translated.
- **UI text**: never hard-code user-facing strings. Add a key to
  `apps/web/src/i18n/locales/en.json` and `zh-TW.json`. The keys are type-checked.
- **API contract**: request schemas and response types live in `packages/shared`. Update
  them first, then the server and the client.
- **Permissions**: every access check goes through `apps/server/src/auth/authz.ts`.
  Routes must not compare user ids themselves.
- **Styling**: use the CSS variables in `apps/web/src/styles/theme.css` instead of literal
  colors, so themes keep working.
- **Configuration**: all configuration comes from environment variables, validated in
  `apps/server/src/config.ts`. Document new variables in `.env.example`. Never commit
  secrets, keys or hostnames.
- **Dependencies**: they must use licenses compatible with AGPL-3.0 (MIT, BSD, ISC,
  Apache-2.0, MPL-2.0, CC0, …). Don't add closed-source or paid packages.
- Run `npm run lint`, `npm run typecheck` and `npm run format:check` before pushing.
