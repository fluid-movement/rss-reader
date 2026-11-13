---
type: decision
title: Reader article enhancements only move nodes; image viewer rules
description: 'Post-render enhancements (src/lib/reader-enhancements.ts, article-image-viewer.svelte) never use innerHTML or insertAdjacentHTML with article content: they wrap tables and pre blocks in their own horizontal scroll regions, set attributes, and add links via textContent. External http(s) links open with target=_blank and rel noopener noreferrer; other schemes stay under the sanitizer''s policy. Images open an accessible viewer on a plain tap (pinch and double-tap zoom, swipe-down or button close); images under about 48 px or with 0/1 size attributes (tracking pixels, emoji) are ignored; an image inside a link opens the viewer on a plain tap while ctrl/meta/shift/alt/non-primary clicks pass through to the link. The action toolbar collapses on scroll down and always returns at the top, at the end of the article and for non-scrolling articles. The article scroller [data-reader-scroller] and horizontally scrollable regions [data-reader-horizontal-scroll] are the hooks for the later swipe-between-articles gesture, which must ignore touches starting in those regions or in the viewer.'
date: "2026-11-13"
scope:
  - src/lib/reader-enhancements.ts
---


