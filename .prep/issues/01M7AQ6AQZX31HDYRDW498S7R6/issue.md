---
title: Mobile UX
kind: code
parent: 01M7A3SD7245XCB3PK2WNJ4KGW
priority: high
---

Make the app great to use on a phone, both in the browser and as an installed PWA (the user reads mostly on desktop and phone; read state syncs). Goal: one-handed, fast, gesture-friendly reading where every gesture also has a visible, accessible alternative. Research and the current-state gap analysis are recorded in the finding 'Mobile UX research: reader gesture and navigation patterns' (prep knowledge find mobile).

Principles (from research): gestures are shortcuts, never the only way; consistent gestures across the app; touch targets at least 44 px with spacing; respect safe areas and dvh; no accidental destructive actions (confirm bulk mark-as-read where it affects many items, or offer undo); mark-as-read-on-scroll off by default; keep the existing optimistic state, narrow invalidation and list-persistence architecture (prep knowledge find views); no new heavy dependencies unless justified.

Sub-issues (each is its own issue under this parent, sequenced by dependency): foundations (safe areas, touch targets, overscroll, iOS input zoom); swipe between articles in the reader; list row gestures and long-press menu; pull to refresh; mobile navigation structure (bottom bar, reader action bar); mobile reader polish (image viewer, tables and code, chrome that hides on scroll); transitions and perceived performance; mobile test harness (touch emulation tests, real-device checklist).

## Open questions
- Swipe semantics in the reader: horizontal swipe on the article to go to the next/previous article in list order (the user's idea), plus how it coexists with iOS edge-swipe back and with horizontally scrollable tables and code blocks.
- List row swipe defaults: right = toggle read, left = toggle star (Reeder convention) or something else; configurable in Settings?
- Navigation: bottom tab bar (Unread, All, Starred, Search, More) versus the current hamburger drawer; where do folders and feeds live.
- Whether mark-all-read asks for confirmation or offers undo.
