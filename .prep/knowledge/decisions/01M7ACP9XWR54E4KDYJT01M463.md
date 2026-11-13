---
type: decision
title: Search index is trigger-synced FTS5 using an app-defined SQL function; only app connections may write items
description: 'items_fts is kept in sync by triggers that call item_search_text/item_clean_title, SQL functions registered in connectDatabase(). Every writer must use connectDatabase (app boot, seed, create-user, scheduler). drizzle-kit migrate, push and studio cannot write items (no such function) so db:migrate and db:push refuse with a message; app-boot migration is the supported path, db:generate stays fine. search-text.ts lives in src/lib/server/db/ so the Docker runtime image (which copies that folder) can run user:create. Reason: automatic re-index of any items UPDATE including extraction''s full_content.'
date: "2026-11-13"
scope:
  - src/lib/server/db/**
---


