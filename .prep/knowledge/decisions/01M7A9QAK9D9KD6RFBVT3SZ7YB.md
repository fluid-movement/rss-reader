---
type: decision
title: Reader state mutations use a JSON endpoint with optimistic client state
description: 'Read/star/mark-read mutations go through POST /api/state (session required, same-origin check, JSON content type, validation, 404 on unowned ids) with optimistic overrides in reader-state.svelte.ts, rollback plus toast on failure, and refetch on focus/visibility plus a 60s poll. Reason: simplest way to get instant optimistic updates and cross-device sync; reviewed in a real browser.'
date: "2026-11-13"
scope:
  - src/routes/(app)/api/**
---


