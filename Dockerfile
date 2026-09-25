# syntax=docker/dockerfile:1

# ---- Install all dependencies (for building) ----
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN npm ci

# ---- Build the web client and the server bundle ----
FROM deps AS build
COPY . .
RUN npm run build

# ---- Production dependencies of the server only ----
FROM node:22-alpine AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN npm ci --omit=dev --workspace @cotebook/server --include-workspace-root=false \
  && mkdir -p apps/server/node_modules \
  && npm cache clean --force

# ---- Runtime image ----
FROM node:22-alpine
ENV NODE_ENV=production \
    PORT=3000 \
    STORAGE_LOCAL_DIR=/app/data/uploads
WORKDIR /app

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=prod-deps /app/apps/server/node_modules ./apps/server/node_modules
COPY --from=build /app/apps/server/package.json ./apps/server/package.json
COPY --from=build /app/apps/server/dist ./apps/server/dist
COPY --from=build /app/apps/server/drizzle ./apps/server/drizzle
COPY --from=build /app/apps/web/dist ./apps/web/dist

RUN mkdir -p /app/data/uploads && chown -R node:node /app/data
USER node

EXPOSE 3000
VOLUME ["/app/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD wget -qO- http://127.0.0.1:3000/api/health >/dev/null || exit 1

CMD ["node", "--enable-source-maps", "apps/server/dist/index.js"]
