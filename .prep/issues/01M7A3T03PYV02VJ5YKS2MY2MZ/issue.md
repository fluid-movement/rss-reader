---
title: Refresh scheduler
kind: code
parent: 01M7A3SD7245XCB3PK2WNJ4KGW
depends_on:
  - 01M7A3T028WRWJVKG5S0QC1Z88
priority: high
---

In-process interval timer that refreshes feeds that are due, started with the server. Uses conditional GET (ETag/Last-Modified), per-feed backoff on errors, stores last error and last fetched. Also manually triggerable: refresh one feed and refresh all (button in UI + endpoint). No external cron.

## Open questions
