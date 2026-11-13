---
type: decision
title: safeFetch decodes compression with decompressed size cap; HTML sanitized at ingest and render
description: 'safeFetch sends Accept-Encoding gzip/deflate/br and decodes via node:zlib with the size cap enforced on decompressed bytes (rejecting compressed responses breaks real feeds that ignore identity). Content is sanitized when parsed/ingested (relative URLs resolved against item link, rel noopener) and again at render time in the reader. Fetches are pinned to the validated IP (SSRF). Reason: found in review of the feed subscribe issue.'
date: "2026-11-13"
scope:
  - src/lib/server/feeds/**
---


