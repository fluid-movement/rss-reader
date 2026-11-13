# RSS Reader

## Configuration and users

Install dependencies with `pnpm install`. Copy `.env.example` to `.env` and configure:

- `DATABASE_URL`: SQLite filename, relative to the application root (for example `local.db`).
- `ORIGIN`: the exact public origin, including port in development. Passkey RP ID and allowed origin are derived from this value. Use HTTPS in production (localhost is supported for development).
- `BETTER_AUTH_SECRET`: a high-entropy secret of at least 32 characters.

There is no public sign-up. Create users from the application root, without running the web server:

```sh
pnpm user:create --email reader@example.com --name 'Reader' --password 'a-long-unique-password'
```

The command loads `.env`, applies migrations to `DATABASE_URL`, hashes the password with Better Auth, and atomically creates the user, credential and default settings. Passwords must contain 8–128 characters. Duplicate emails fail without changing the existing user. Command-line passwords can appear in shell history/process listings; run this only from a trusted administrator console and handle history accordingly.

Start the app with `pnpm dev --port 5301 --strictPort` (set `ORIGIN=http://localhost:5301` for this example), then sign in at `/login`. All app routes require a session except `/login`, `/health`, static assets and Better Auth's `/api/auth/*` routes. Public email sign-up is disabled. The login page supports email/password and passkey sign-in; authenticated passkey enrollment/management UI is handled separately. Passkey registration endpoints require an existing session. Sign out using the root page's logout form (`POST /?/logout`).

## Development seed data

`pnpm db:seed` (or `just seed`) recreates the dev user (login in `scripts/seed-data.ts`), creates topic folders (Tech, Dev blogs, News, Science, Security, Culture) and queues about 40 REAL, popular feeds (RSS, Atom, RSS 1.0, JSON Feed, gzip/brotli, redirects, large feeds, three with full-text extraction on, one with a 15 minute interval, plus one intentionally dead URL so a broken feed exists). There is no fake data: no items and no read/starred state are created, and the script itself makes no network requests. The feeds are due immediately, so **the dev server (or the production server) must be running**: its in-process scheduler starts with the server and pulls the queued feeds within about a minute. To fill the database without a running server, run `pnpm db:seed --refresh`, which does one refresh pass in the script (needs network access), waits for extraction to finish and lists any feeds that failed (the intentionally dead kottke.org URL is expected to).

The seed resets that user's data on every run (safe to rerun), refuses to run when `NODE_ENV=production` or when `ORIGIN` is not a localhost/127.0.0.1 URL (it creates a known-password account), and refuses a `DATABASE_URL` outside the project directory. Edit the feed list in `scripts/seed-data.ts`.

## Install as app (PWA)

On your deployed **HTTPS** site, use Chrome's **Install app** menu (Android/desktop),
or Safari's **Share → Add to Home Screen → Open as Web App** (iPhone/iPad).
Sign in normally; there is no public sign-up. HTTPS is required except on localhost.

Version 1 is **online-only**: the service worker precaches public JS, CSS, fonts and
icons, not pages, articles, API responses, auth requests or form submissions. Opening
a page offline shows “You are offline”; feed/data requests still require a connection.
The manifest uses the light background token (`#ffffff`); page theme-color metadata
also supplies the dark token (`#0a0a0a`) according to the system color preference.

SvelteKit registers `src/service-worker.ts` automatically in **production builds only**.
After deployment, a full-page visit checks for an update. Close all app tabs/windows
and reopen to activate a waiting version; existing tabs retain their matching assets.
Activation deletes only old `rss-reader-assets-*` caches. No forced reload interrupts reading.

To test locally: `pnpm build`, then `pnpm preview --port 5310 --strictPort`.
In browser DevTools → Application, inspect the manifest, service worker and Cache Storage;
only build/static URLs should be cached. Test offline with a full-page navigation (not
just an in-app data load). Auth/API/action requests must never come from Cache Storage.
The manifest, icons and worker are public static assets served before the auth hook.

Icons are generated from `static/icons/rss.svg` with ImageMagick, for example:
`magick -background none static/icons/rss.svg -resize 192x192 static/icons/icon-192.png`.
The 512px maskable icon has an opaque background and a centered glyph inside the safe zone.

## Database migrations

The complete v1 reader schema is in `src/lib/server/db/schema.ts`; Better Auth's generated schema is in `src/lib/server/db/auth.schema.ts`. Reader timestamps use integer Unix milliseconds mapped to `Date`. Items belong to a user via their private feed. Queries must scope folders/feeds/settings/item state by user, and items through their feed; never accept a different user's folder/item ID from a client without an ownership check. User deletion cascades through all owned data; removing a folder only unfiles its feeds.

Defaults: refresh every 60 minutes, full-text extraction off, retention 30 days, reader font size 18px, reader width 720px. Settings consumers may use these defaults until a settings row exists (console-created users receive one).

After changing auth plugins run `pnpm auth:schema`, then `pnpm db:generate`. Check the generated SQL and metadata into source control. Do not use `db:push` for deployments. `src/hooks.server.ts` applies pending migrations once at server startup, except during builds. Deploy the `drizzle/` directory with the application and run from the application root. The console command also applies migrations, so it works against an empty database.

## Database tooling

Full-text search (`items_fts`, an FTS5 virtual table) is kept in sync by triggers that call SQL functions registered by `connectDatabase()` (`src/lib/server/db/connect.ts`). Consequences:

- Supported ways to migrate: app boot (`src/hooks.server.ts`), `pnpm user:create` and `pnpm db:seed`. All use `connectDatabase`.
- `pnpm db:migrate` (drizzle-kit) and `pnpm db:push` are disabled and print a refusal. drizzle-kit does not register those functions, so migrating a database that already has items fails, and `push` would try to drop the FTS shadow tables. Drizzle Studio and the raw `sqlite3` shell cannot write items for the same reason (`no such function`). `pnpm db:generate` remains fine; use `pnpm drizzle-kit generate --custom` for hand-written SQL.
- Retention pruning (daily, per `user_settings.retention_days`) deletes only read, unstarred items. Lowering the setting later cannot restore items that were already pruned. Each pruned item leaves a tiny tombstone (feed id and guid in `pruned_items`, removed with its feed) so it is not re-ingested as a new unread item.

## Checks

```sh
pnpm check
pnpm lint
pnpm test
```

Tests use isolated in-memory SQLite databases and the actual generated migrations.

## Coolify deployment

Deploy this repository with Coolify's **Dockerfile** build pack, using the root `Dockerfile` and container port **3000**. Set the public domain to an HTTPS URL and configure these **runtime** environment variables (no build secrets are needed):

| Variable             | Value                                                                                                                                                     |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ORIGIN`             | Exact public HTTPS origin, e.g. `https://reader.example.com`, without a path. Must match the Coolify URL for passkeys, auth cookies and form submissions. |
| `BETTER_AUTH_SECRET` | Stable high-entropy secret of at least 32 characters; generate with `openssl rand -hex 32`.                                                               |
| `DATABASE_URL`       | `/data/app.db`                                                                                                                                            |

Add **persistent storage mounted at `/data`** before starting. The image runs as the non-root `node` user (UID/GID 1000); a host bind mount must be writable by that user. A fresh Docker named volume inherits the image directory's ownership. Keep the entire directory persistent, including SQLite's WAL/SHM files; do not mount only the database file. Back up SQLite consistently before upgrades (stop the container before copying the directory, or use SQLite's backup tooling). Never run `db:push` in production.

The Debian slim multi-stage image contains only production dependencies, including the native `better-sqlite3` driver and tools needed by the console command. It starts with `node build`; existing `init()` hooks apply the shipped `drizzle/` migrations before serving. Keep **one replica / one Node process**, without clustering, scale-to-zero or an external cron, so the in-process refresh scheduler can run continuously. The unauthenticated `/health` endpoint is used by the Docker healthcheck; configure Coolify's healthcheck to use `/health` on port 3000 too.

Create the first user from a trusted administrator console after deployment (replace `<container>` with the running container's name or ID):

```sh
docker exec <container> pnpm user:create --email reader@example.com --name 'Reader' --password 'a-long-unique-password'
```

The command inherits the container environment; no `.env` file is included in the image. It applies migrations and writes to the same mounted database. Public sign-up remains disabled. Command-line passwords may be visible in shell history/process listings. Retention is a per-user database setting, defaulting to **30 days**, not an environment variable.

### Local container smoke test

Copy `.env.example` to `.env`, set `BETTER_AUTH_SECRET`, and set `ORIGIN=http://localhost:5311`. Compose always uses `/data/app.db`, regardless of the local `.env` database filename:

```sh
docker compose up --build -d --wait
curl --fail http://localhost:5311/health
docker compose exec app pnpm user:create --email reader@example.com --name 'Reader' --password 'a-long-unique-password'
docker compose down
```

`docker compose down` preserves the named `rss-data` volume across rebuilds/restarts; `down -v` destroys it. Sign in at `http://localhost:5311/login` while the container is running.

Without Docker, build with `pnpm build`, then run `PORT=5311 node --env-file=.env build` from the application root (set `ORIGIN=http://localhost:5311`). Production does not automatically load `.env`; Coolify supplies the environment directly.

---

## Original scaffold reference

Everything you need to build a Svelte project, powered by [`sv`](https://github.com/sveltejs/cli).

## Creating a project

If you're seeing this, you've probably already done this step. Congrats!

```sh
# create a new project
npx sv create my-app
```

To recreate this project with the same configuration:

```sh
# recreate this project
pnpm dlx sv@1.3.0 create --template minimal --types ts --add prettier eslint tailwindcss="plugins:none" drizzle="database:sqlite+sqlite:node-sqlite" better-auth="demo:password" --install pnpm rss-reader
```

## Adding features

Add features to your project with `sv add`:

```sh
npx sv add
```

For example, to add Tailwind CSS:

```sh
npx sv add tailwindcss
```

## Developing

Once you've created a project and installed dependencies with `npm install` (or `pnpm install` or `yarn`), start a development server:

```sh
npm run dev

# or start the server and open the app in a new browser tab
npm run dev -- --open
```

## Building

To create a production version of your app:

```sh
npm run build
```

You can preview the production build with `npm run preview`.

> To deploy your app, you may need to install an [adapter](https://svelte.dev/docs/kit/adapters) for your target environment.
