---
type: decision
title: Use better-sqlite3 with Drizzle, not node:sqlite
description: 'Installed drizzle-orm 0.45.2 has no node-sqlite driver (only in 1.0 betas), so the DB uses drizzle-orm/better-sqlite3. Stable, FTS5 built in. Reason: scaffold imported a non-existent driver and caused 500s.'
date: "2026-11-13"
scope:
  - src/lib/server/db/**
---


