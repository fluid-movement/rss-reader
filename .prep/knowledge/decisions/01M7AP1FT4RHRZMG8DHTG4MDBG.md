---
type: decision
title: Feed titles are decoded once as plain text; extraction page cap is 2 MiB; transient network errors are safe
description: 'plain() in parse.ts decodes entities exactly once and strips tags with no spaces added at tag boundaries (CO<sub>2</sub> stays CO2), strips control characters and falls back to ''Untitled'' for items. MAX_ARTICLE_BYTES is 2 MiB: Wired pages are up to 1.56 MB and a larger cap risked a worker heap OOM crash on hostile pages (3 MiB was measured fine on adversarial inputs but 2 MiB is tighter). Transient network failures (ENOTFOUND, ECONNREFUSED, ECONNRESET, ETIMEDOUT, EAI_AGAIN...) store the safe last_error ''Could not reach the server.'' and log one line without a stack. Found by pulling real feeds.'
date: "2026-11-13"
scope:
  - src/lib/server/feeds/**
---


