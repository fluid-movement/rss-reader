---
type: decision
title: Never delete the developer's local.db while their dev server runs
description: 'Deleting local.db under a running dev server leaves it holding handles to the deleted file: its in-process scheduler (a globalThis singleton) and the manual Refresh write into a database nobody reads, so the user sees no articles (happened 2026-11-13). Agents verify against a throwaway DATABASE_URL (for example verify.db inside the project, deleted afterwards) or in their own worktree, never the main checkout''s local.db; if a schema or seed change needs a reset, tell the developer to restart the dev server. The dev server also keeps the scheduler across hot reloads, so changes to fetch/parse/extract code need a restart.'
date: "2026-11-13"
scope:
  - '**'
---


