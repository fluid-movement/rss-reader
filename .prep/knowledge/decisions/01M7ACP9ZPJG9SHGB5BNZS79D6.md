---
type: decision
title: Retention prunes only read, unstarred items and leaves tombstones
description: Daily job (2 min after start, then every 24 h) deletes items the owner has read, not starred, older than user_settings.retention_days (default 30, <=0 keeps all), in transactions of 200 with yields. A pruned_items(feed_id, guid) tombstone written in the same transaction makes ingestItemIds treat them as already seen so pruned items still present in their feed never return as unread or get re-extracted. Items without an item_state row (never opened) are unread and are never deleted. Lowering retention later cannot restore pruned items; tombstones are tiny and cascade with their feed.
date: "2026-11-13"
scope:
  - src/lib/server/retention.ts
---


