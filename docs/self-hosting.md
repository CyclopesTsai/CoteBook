# Self-hosting CoteBook

CoteBook runs as two containers: the app, which serves both the web client and the API,
and PostgreSQL. It needs no external cloud services.

## Requirements

- Docker Engine 24+ with the Compose plugin 2.20 or newer (`docker compose version`)
- About 512 MB of RAM and 1 GB of disk space, plus space for your images

## 1. Install

```bash
git clone https://github.com/CyclopesTsai/CoteBook.git
cd CoteBook
cp .env.example .env
```

Edit `.env`. At minimum, set:

| Variable            | What to set                                                                 |
| ------------------- | --------------------------------------------------------------------------- |
| `POSTGRES_PASSWORD` | A long random password, for example from `openssl rand -base64 32`.         |
| `APP_URL`           | The address you will open in the browser, e.g. `https://notes.example.com`. |
| `PUBLISH_PORT`      | The host port to expose (default `3000`).                                   |

Every variable is documented in [`.env.example`](../.env.example).

## 2. Start

```bash
docker compose up -d
docker compose ps        # both services should become "healthy"
docker compose logs -f app
```

On every start, the app applies any pending database migrations before it accepts
requests.

Open `APP_URL` and create your account. Then close registration:

```bash
# in .env
ALLOW_REGISTRATION=false
```

```bash
docker compose up -d
```

## 3. HTTPS with a reverse proxy

Put CoteBook behind a TLS-terminating reverse proxy and set:

```bash
APP_URL=https://notes.example.com
TRUST_PROXY=true
```

When `APP_URL` starts with `https`, session cookies are marked `Secure` automatically.

**Caddy** (obtains certificates automatically):

```caddyfile
notes.example.com {
    reverse_proxy localhost:3000
}
```

**nginx**:

```nginx
server {
    listen 443 ssl http2;
    server_name notes.example.com;
    # ssl_certificate / ssl_certificate_key ...

    client_max_body_size 20m;   # at least MAX_UPLOAD_SIZE_MB

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
    }

    # Live sync uses Server-Sent Events: disable buffering and allow long-lived responses.
    location /api/events {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffering off;
        proxy_read_timeout 1h;
    }
}
```

## 4. File storage

By default, uploaded images are stored in the `uploads` Docker volume
(`STORAGE_DRIVER=local`).

To use an S3-compatible service such as MinIO, Garage, AWS S3 or Cloudflare R2:

```bash
STORAGE_DRIVER=s3
S3_ENDPOINT=https://s3.example.com     # omit for AWS S3
S3_REGION=us-east-1
S3_BUCKET=cotebook
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
S3_FORCE_PATH_STYLE=true               # needed by MinIO and most self-hosted stores
```

The bucket must already exist and can stay private. The app streams files to the browser
itself and only serves them to signed-in owners.

Switching drivers does not move existing files. Copy the contents of the old storage to
the new one, keeping the same keys (`u/<userId>/<uploadId>`).

## 5. Backups

CoteBook doesn't back itself up yet. Back up two things:

```bash
# Database
docker compose exec -T db pg_dump -U cotebook -d cotebook -Fc > cotebook-$(date +%F).dump

# Uploaded images (local storage)
docker run --rm -v cotebook_uploads:/data -v "$PWD":/backup alpine \
  tar czf /backup/uploads-$(date +%F).tgz -C /data .
```

Volume names are prefixed with the Compose project name, which defaults to the directory
name. Run `docker volume ls` to check them.

To restore:

```bash
docker compose exec -T db pg_restore -U cotebook -d cotebook --clean --if-exists < cotebook-YYYY-MM-DD.dump
```

## 6. Upgrading

```bash
git pull
docker compose build
docker compose up -d
```

Migrations run automatically on startup. Back up the database before upgrading.

## Using an external PostgreSQL

To run only the app container against an existing PostgreSQL 14+ database, start the
image directly and pass `DATABASE_URL`:

```bash
docker build -t cotebook .
docker run -d --name cotebook -p 3000:3000 \
  -e DATABASE_URL=postgres://user:pass@db-host:5432/cotebook \
  -e APP_URL=https://notes.example.com \
  -v cotebook-uploads:/app/data/uploads \
  cotebook
```

The database user needs permission to create tables in its schema. No extensions are
required.

## Running without a database (demo mode)

To show CoteBook without keeping any data, for example as a public demo or to try the
interface, switch the database off in `.env`:

```bash
DATABASE_ENABLED=false
```

```bash
docker compose up -d
```

What happens:

- Docker Compose doesn't start the PostgreSQL container. The `db` service's profile is
  derived from `DATABASE_ENABLED`, and `COMPOSE_PROFILES=database-true` in `.env` only
  activates it while the switch is `true`. `POSTGRES_PASSWORD` may stay empty.
- The web app opens in demo mode with a few sample pages. The editor, slash menu,
  formatting, page tree (including drag and drop) and image insertion all work, but
  everything stays in the browser tab and disappears on reload. Images are never uploaded.
- Accounts, saving, search and cross-device sync are unavailable. Every API endpoint
  except `/api/health` and `/api/config` answers `503` with the error code
  `database_disabled`.

`DATABASE_ENABLED` accepts only `true` or `false`. To go back, set it to `true` and run
`docker compose up -d` again. Data from before the switch is still in the `db-data` volume.

Without Docker, start the server with `DATABASE_ENABLED=false`. `DATABASE_URL` isn't needed
then.

## Troubleshooting

- **Can't log in; the browser keeps returning to the login page.** `APP_URL` probably
  uses `https` while you are opening the site over plain `http`, so the browser drops the
  secure cookie. Fix `APP_URL`, or set `COOKIE_SECURE=false` for local testing only.
- **"Cross-origin request rejected".** The browser's origin doesn't match `APP_URL` or the
  `Host` header. Make sure your proxy forwards `Host`, or add the origin to `CORS_ORIGINS`.
- **Live sync doesn't update other devices.** Your proxy is buffering `/api/events`. See
  the nginx example above.
- **The app exits with "Could not prepare the database" and the `db` container isn't
  running.** Your `.env` is missing `COMPOSE_PROFILES=database-true` (for example, it was
  created from an older `.env.example`). Add the line and run `docker compose up -d`.
