---
type: decision
title: Views host the list in a layout; lists are capped with Load more; sync invalidates narrow keys
description: 'Each view (all, unread, starred, feed, folder) has a +layout that hosts the list so it persists when an item opens (item is a nested page); lists load the 100 newest with cursor-based Load more via GET /api/articles and the open item is always merged in; sync (focus, visibility, 60s poll) invalidates app:list, app:item and app:feeds instead of invalidateAll and refetches extra pages in chunks of 100. /api/state caps bodies at 4096 bytes. New views such as search should reuse this layout pattern. Reason: scroll position and cost at scale, verified in a real browser.'
date: "2026-11-13"
scope:
  - src/routes/(app)/**
---


