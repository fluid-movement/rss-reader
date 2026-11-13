---
title: Search and retention pruning
kind: code
parent: 01M7A3SD7245XCB3PK2WNJ4KGW
depends_on:
  - 01M7A3T06JC7AJQ3JDWV2DGVRP
---

SQLite FTS5 full-text search over item title and content, scoped to the user, with a search box in the UI. Retention job (runs on the scheduler) prunes read, unstarred items older than N days (configurable, sensible default); never prunes starred or unread items.

## Open questions
