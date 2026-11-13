---
title: Reader action bar on mobile
kind: code
parent: 01M7AQ6AQZX31HDYRDW498S7R6
depends_on:
  - 01M7AQ6AV6005HWASDH00FPY86
priority: high
---

Re-scoped by user decision: the hamburger drawer stays for navigation now; a bottom tab bar or other mobile navigation redesign is deferred. This issue adds a bottom action bar to the article view on phones, in the thumb zone: star/unstar, read/unread, share, open original, previous/next with the position indicator from the swipe issue. It respects safe areas and 44 px targets, uses the existing optimistic state helpers, has accessible names and a visible focus order, and may hide on scroll down and reappear on scroll up (but never hide while the user is at the end of the article or interacting with it). Desktop layout unchanged; on phones the existing top toolbar keeps only what does not move to the bar (back, title context).

## Open questions
