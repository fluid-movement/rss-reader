---
type: decision
title: Committed drizzle migrations applied at boot; per-worktree SQLite
description: Schema changes use drizzle-kit generate with migrations committed under drizzle/ and applied at server start (init() in hooks), never db:push. Parallel worktrees each use their own relative DATABASE_URL (local.db) and dev port so SQLite files never collide. The /feeds management page belongs to the feed-subscribe issue; the sidebar only links to it.
date: "2026-11-13"
scope:
  - '**'
---


