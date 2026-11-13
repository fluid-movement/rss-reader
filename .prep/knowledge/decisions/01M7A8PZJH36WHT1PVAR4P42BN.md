---
type: decision
title: 'Scheduler: safe last_error, manual refresh cooldown with feedback, 30 min default'
description: 'last_error stores messages only from FeedFetchError/FeedParseError (truncated), anything else becomes a generic message and is logged server-side. Manual refresh has a 30s per-feed cooldown that reports ''skipped'' instead of pretending success. Default refresh interval is a shared DEFAULT_REFRESH_MINUTES=30 used by both subscribe and OPML queueing. Reason: review findings on the refresh scheduler issue.'
date: "2026-11-13"
scope:
  - src/lib/server/scheduler*
---


