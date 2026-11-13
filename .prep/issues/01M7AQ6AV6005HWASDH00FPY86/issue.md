---
title: Swipe between articles in the reader
kind: code
parent: 01M7AQ6AQZX31HDYRDW498S7R6
depends_on:
  - 01M7AQ6ASHTDEANBMJPPFYBGCK
priority: high
---

In the article view on a phone, swipe horizontally to go to the next or previous article in the current list order (the list the user came from, including Load more at the end), with visual feedback (the article follows the finger, a peek of the neighbor), a threshold and velocity rule, and no conflict with vertical scrolling, horizontally scrollable tables and code blocks, image zoom, or the iOS/Android edge-swipe back gesture. Provide visible alternatives: prev/next buttons and a position indicator ('12 of 100'); keep the keyboard j/k behavior in sync. Preload the neighbor article data, respect reduced-motion, mark-read-on-open semantics stay as they are.
## Open questions
- Swipe left = next (like paging) or the reverse; whether the swipe animates the list row selection.
- Behavior at the first and last article and when a view shrinks (Unread view).
