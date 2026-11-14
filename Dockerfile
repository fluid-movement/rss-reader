# Keep native modules on the same Node ABI and Debian libc in every stage.
FROM node:24-bookworm-slim AS base
ENV COREPACK_HOME=/opt/corepack
RUN corepack enable && corepack prepare pnpm@12.18.0 --activate
WORKDIR /app

FROM base AS toolchain
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

FROM toolchain AS build
RUN pnpm install --frozen-lockfile
COPY . .
# Build analysis imports the DB/auth modules. These are disposable build-only values;
# production configuration is read from the environment when the server starts.
RUN DATABASE_URL=:memory: ORIGIN=http://localhost:3000 \
    BETTER_AUTH_SECRET=build-only-placeholder-not-a-production-secret pnpm build

FROM toolchain AS production-deps
RUN pnpm install --prod --frozen-lockfile
# Fail the build if the native module cannot actually open a database.
RUN node --input-type=module -e "import Database from 'better-sqlite3'; const db = new Database(':memory:'); db.close();"

FROM base AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 DATABASE_URL=/data/app.db
# curl is needed by Coolify's rolling-update healthcheck, which runs inside the container.
RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /data && chown node:node /data
COPY --from=production-deps /app/node_modules ./node_modules
COPY package.json ./
COPY --from=build /app/build ./build
COPY drizzle ./drizzle
# Only the console command's server-independent sources are needed at runtime.
COPY scripts/create-user.ts ./scripts/create-user.ts
COPY src/lib/server/create-user.ts ./src/lib/server/create-user.ts
COPY src/lib/server/db ./src/lib/server/db
USER node
EXPOSE 3000
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:' + process.env.PORT + '/health', { signal: AbortSignal.timeout(4000) }).then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
# One long-running process: boot hooks run migrations and can host the refresh timer.
CMD ["node", "build"]
