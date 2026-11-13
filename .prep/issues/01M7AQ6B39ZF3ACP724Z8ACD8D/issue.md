---
title: Mobile transitions and perceived performance
kind: code
parent: 01M7AQ6AQZX31HDYRDW498S7R6
depends_on:
  - 01M7AQ6B02JZ7415M15WCVFTSW
priority: low
---

Make navigation feel native on phones: view transitions between the list and the article (View Transitions API with a graceful fallback and reduced-motion respect), instant tap feedback (no 300 ms delay, pressed states), skeleton states while article data loads, preloading on touch start (data-sveltekit-preload-data) so tapping an article feels instant, no layout shift, correct scroll restoration, and the swipe/pull gestures staying smooth (transform-only, no jank). Measure with a throttled mobile profile (4x CPU slowdown, Fast 3G) before and after, and keep a small performance budget in the README.

## Open questions
