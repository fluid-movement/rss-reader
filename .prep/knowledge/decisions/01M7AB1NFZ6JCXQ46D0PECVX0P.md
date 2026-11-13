---
type: decision
title: Full-text extraction must not parse HTML on the main thread unbounded
description: Review measured linkedom plus Readability freezing the server for over a minute on a 49 KB page of deeply nested divs; the fetch timeout cannot interrupt synchronous parsing. Extraction therefore must parse in a terminable worker thread (or equivalent) with a hard timeout, plus cheap pre-rejection by tag count and nesting depth and a lower byte cap, and must work in vite dev, vitest, node build and the Docker runtime image.
date: "2026-11-13"
scope:
  - src/lib/server/feeds/extract*
---


