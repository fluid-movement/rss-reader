---
title: Mobile navigation structure and reader action bar
kind: code
parent: 01M7AQ6AQZX31HDYRDW498S7R6
depends_on:
  - 01M7AQ6ASHTDEANBMJPPFYBGCK
priority: high
---

Rework phone navigation for one-handed use. Evaluate a bottom tab bar (Unread, All, Starred, Search, More/Feeds) against the current hamburger drawer, keep folders and feeds reachable (drawer from the tab bar's Feeds), and add a reader action bar at the bottom of the article view (star, read/unread, share, open original, previous/next) in the thumb zone. Keep safe areas, 44 px targets, keyboard and screen reader behavior, and the list-persistence/back behavior. Desktop layout unchanged.
## Open questions
- Bottom tab bar versus keeping the hamburger; which destinations; whether the reader action bar hides on scroll.
