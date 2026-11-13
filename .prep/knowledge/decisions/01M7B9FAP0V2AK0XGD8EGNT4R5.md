---
type: decision
title: View transitions animate only the outgoing snapshot; skipped for swipes
description: 'List<->article navigation uses document.startViewTransition (feature-detected, skipped under reduced motion). Only the outgoing snapshot animates so the live article receives gestures immediately, and article-to-article swipe navigation never starts a view transition (it keeps its own slide). Rows keep touch-pan-y (no pinch-zoom). List links preload on tap. Reason: a full cross-fade blocked touches for ~100-150 ms after navigation and broke the mobile e2e swipe test. Cost: first full article paint is ~35 ms slower than before on 4x CPU / Fast 3G, accepted for the earlier skeleton.'
date: "2026-11-13"
issue: 01M7AQ6B39ZF3ACP724Z8ACD8D
---


