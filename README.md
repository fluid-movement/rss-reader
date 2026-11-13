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

## Database migrations

The complete v1 reader schema is in `src/lib/server/db/schema.ts`; Better Auth's generated schema is in `src/lib/server/db/auth.schema.ts`. Reader timestamps use integer Unix milliseconds mapped to `Date`. Items belong to a user via their private feed. Queries must scope folders/feeds/settings/item state by user, and items through their feed; never accept a different user's folder/item ID from a client without an ownership check. User deletion cascades through all owned data; removing a folder only unfiles its feeds.

Defaults: refresh every 60 minutes, full-text extraction off, retention 30 days, reader font size 18px, reader width 720px. Settings consumers may use these defaults until a settings row exists (console-created users receive one).

After changing auth plugins run `pnpm auth:schema`, then `pnpm db:generate`. Check the generated SQL and metadata into source control. Do not use `db:push` for deployments. `src/hooks.server.ts` applies pending migrations once at server startup, except during builds. Deploy the `drizzle/` directory with the application and run from the application root. The console command also applies migrations, so it works against an empty database.

## Checks

```sh
pnpm check
pnpm lint
pnpm test
```

Tests use isolated in-memory SQLite databases and the actual generated migrations.

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
