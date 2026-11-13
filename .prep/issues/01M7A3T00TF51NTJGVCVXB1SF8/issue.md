---
title: Schema and auth wiring
kind: code
parent: 01M7A3SD7245XCB3PK2WNJ4KGW
priority: high
---

Drizzle SQLite schema and Better Auth setup.

Schema: folders (per user, single level), feeds (user, url, site url, title, folder, refresh interval, full-text flag, etag, last-modified, last fetched, error state), items (feed, guid, link, title, content, summary, author, published, unique per feed+guid), item state (per user: read, starred). Every row is scoped to a user; each user has their own feeds.

Auth: Better Auth with email+password and passkey (WebAuthn) sign-in. There is NO sign-up page and sign-up endpoints are disabled; users are created only via a console command (e.g. pnpm user:create). Login page, session handling in hooks, route protection for the whole app. Passkey registration available from a settings page once logged in.
Also: adapter-node swap is handled in the deployment issue.

## Open questions
