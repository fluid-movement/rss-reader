---
type: decision
title: 'Coolify: Dockerfile build pack, Coolify-run healthcheck with curl in image'
description: Deploy on Coolify with the Dockerfile build pack (not compose or Railpack); Coolify's rolling-update healthcheck gates cutover, so the runtime image installs curl.
date: "2026-11-14"
---

Decision: Coolify uses the Dockerfile build pack. docker-compose.yml stays local-smoke-test only. Coolify's own healthcheck (GET /health, port 3000) gates the rolling update, and Coolify owns the /data volume.

Why: Dockerfile pins Node/libc for native better-sqlite3, runs as non-root, ships the create-user script. Railpack is Beta and would need those translated; compose adds nothing for one container. The slim image had no curl/wget, so Coolify's healthcheck failed and rolled back an otherwise healthy deploy; curl was added to the runtime stage (commit 3962e89).

How to apply: keep curl in the runtime stage; keep the Dockerfile HEALTHCHECK (compose --wait uses it); require a persistent volume at /data and DATABASE_URL=/data/app.db.
