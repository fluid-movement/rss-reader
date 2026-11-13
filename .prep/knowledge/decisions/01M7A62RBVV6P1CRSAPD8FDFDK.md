---
type: decision
title: Deploy as single Node container, ORIGIN env only
description: Image is node:24-bookworm-slim multi-stage, non-root, SQLite on /data volume, single replica, CMD node build. Behind Coolify's proxy ORIGIN set to the public https URL is sufficient (no PROTOCOL_HEADER/HOST_HEADER). Retention is a per-user DB setting, not an env var. Image build is still unverified (Docker daemon was down).
date: "2026-11-13"
scope:
  - Dockerfile
---


