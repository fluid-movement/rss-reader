---
title: Feed subscribe, discovery and parsing
kind: code
parent: 01M7A3SD7245XCB3PK2WNJ4KGW
depends_on:
  - 01M7A3T00TF51NTJGVCVXB1SF8
priority: high
---

Subscribe to a feed by URL. Given a site URL, auto-discover the feed via link rel=alternate; accept direct feed URLs. Parse RSS, Atom and JSON Feed, normalize into items, dedupe by guid/link. Add/remove feed, assign to a folder, create/rename/delete folders. Fetch server-side with timeout, size limit and SSRF-safe handling of private addresses. Sanitize item HTML on ingest or render (XSS).

## Open questions
