---
type: decision
title: Extraction parses in an eval worker thread, not a bundled worker file
description: 'dom-worker.ts creates short-lived worker threads with {eval:true} from inline CommonJS that loads linkedom and @mozilla/readability via createRequire(import.meta.url), because bundled worker file URLs are unreliable across vite dev, vitest, node build and the Docker runtime (prod node_modules, no src/). Limits: 5s terminate, 256 MB old-gen, max 2 workers with a queue, pre-scan (50k tags, depth 150), 1 MiB page cap. Verified in node build from another cwd with no src/.'
date: "2026-11-13"
scope:
  - src/lib/server/feeds/dom-worker.ts
---


