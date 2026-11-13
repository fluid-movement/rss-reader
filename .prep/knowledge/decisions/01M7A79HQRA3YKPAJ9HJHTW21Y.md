---
type: decision
title: OPML import inserts feeds without fetching; UI lives on /feeds until settings exists
description: 'OPML import creates feeds with next_fetch_at=now and lets the scheduler fetch them, so large imports are instant. The import/export panel is mounted on the /feeds page; the later settings issue may move it. Reason: avoid blocking requests and avoid parallel-issue conflicts on a not-yet-built settings page.'
date: "2026-11-13"
scope:
  - src/routes/feeds/**
---


