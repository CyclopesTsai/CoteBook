# Browser smoke scripts

Playwright scripts used to verify features by hand while building the MVP. They are **not**
an automated test suite yet: they drive a real browser through a flow and print what they
observe, so a person (or Claude) can compare the output with the expected behaviour noted
below. Turning them into real tests with assertions is part of the "automated tests / CI"
item in [`docs/status.md`](../../docs/status.md).

## Setup

```bash
npm install                      # installs the `playwright` dev dependency
npx playwright install chromium  # once, downloads the browser
npm run dev                      # API on :3000, web on :5173 (needs PostgreSQL)
```

Each script talks to `BASE` (default `http://127.0.0.1:5173`) and registers a fresh random
account, so it can run against a database that already holds data.

| Variable        | Default                 | Purpose                                           |
| --------------- | ----------------------- | ------------------------------------------------- |
| `BASE`          | `http://127.0.0.1:5173` | URL of the web app (dev server or a Docker build) |
| `CHROMIUM_PATH` | Playwright's Chromium   | Use another Chromium binary                       |
| `SHOTS_DIR`     | the OS temp directory   | Where debug screenshots are written               |

## Scripts

| Script                 | Needs                    | What it checks (expected output)                                                                                                                                                                       |
| ---------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `editing.mjs`          | database on              | Register, create a page, slash menu (H2, to-do), Ctrl+B, autosave ("Saved"), content survives reload, search finds it, add a subpage, delete a page with its subpages (→ "doesn't exist" view)         |
| `sync-drag-upload.mjs` | database on              | Sidebar drag to reorder and to nest (server tree `Three<root>, One<root>, Two<One>`), a second "device" sees typing and renames live, conflict banner + "Keep mine", image upload (`/api/files/…` src) |
| `conflict.mjs`         | database on              | Offline edit on device B while A saves → conflict banner; "Load their version" and "Keep mine" both end with banner gone and both devices showing the same text                                        |
| `demo-mode.mjs`        | `DATABASE_ENABLED=false` | Demo opens on `/p/demo-welcome`, edits survive page switches but not reloads, new page / drag / delete work, images become `blob:` URLs, the only API call is `GET /api/config`                        |
| `screenshots.mjs`      | database on              | Regenerates `docs/images/*.png` for the README with a sample "Trip planning" page                                                                                                                      |

Run one with, for example:

```bash
node scripts/smoke/editing.mjs
BASE=http://localhost:3000 node scripts/smoke/conflict.mjs   # against `npm start` / Docker
```
