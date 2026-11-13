---
title: Extraction hardening and article quality
kind: code
parent: 01M7A3SD7245XCB3PK2WNJ4KGW
---

Follow-ups from the extraction reviews and from pulling real feeds.

1. The pre-scan in the extraction worker (src/lib/server/feeds/dom-worker.ts) treats thead and tbody as implied-end tags, but linkedom nests them for real, so a page repeating <thead>x about 25,000 times (about 380 KB, under the caps) occupies a parse worker for the full 5 s timeout. Remove thead/tbody from the implied-end list or add a per-tag nesting cap, with a regression test.
2. In dom-worker acquire(), an aborted queued waiter is not removed from the queue: it only settles when a slot frees and the wake it consumed is not passed on. Remove the waiter on abort and pass the wake to the next waiter; test it.
3. A 1 MB page of '&' yields a 5 MB worker result that is sanitized on the main thread (about 314 ms) before being sliced. Slice or cap the worker output before sanitizing.
4. Real articles extract untidily: BBC output starts with 'Figure caption,' and a video caption, and the byline reads 'ByHelen DavidsonJessica Lamb and Helen Sullivan' with no spaces between inline spans; Wired output has some empty <figure> elements. Improve the post-processing (whitespace between inline spans, drop empty figures, drop caption/byline boilerplate where safe) using trimmed real fixtures, without weakening the sanitizer.

## Open questions
