---
title: Strip pager for swiping between articles
kind: code
---

Rework swipe paging in the article reader so it has no flash: previous/current/next articles are sibling panes, the finger drags the whole strip, and the next article is visible as you swipe. See the decision on the strip pager (knowledge find 'strip pager'). Neighbour data comes from preloadData (preloadNeighbors in shortcut-handler.svelte.ts); the route still switches via goto replace after the settle animation, without a visible re-mount. Buttons and keyboard next/previous reuse the settle animation. Keep: edge-swipe guard, horizontal-owner exclusion, rubber band at the ends, selection/pinch cancel, scroll position per article, reduced motion.

## Open questions
