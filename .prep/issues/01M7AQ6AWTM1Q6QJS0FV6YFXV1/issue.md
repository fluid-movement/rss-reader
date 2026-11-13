---
title: List row gestures and long-press menu
kind: code
parent: 01M7AQ6AQZX31HDYRDW498S7R6
depends_on:
  - 01M7AQ6ASHTDEANBMJPPFYBGCK
---

In the article list on a phone: swipe a row right to toggle read and left to toggle star (default Reeder-style, configurable in Settings), with an undo toast, haptic-free visual affordances, and no conflict with vertical scrolling; long-press (or a visible overflow button) opens a menu: mark read/unread, star, share, open original, mark above/below as read, copy link. Every swipe action has a non-gesture alternative (the menu). Mark all read keeps a confirmation or undo. Optimistic state, rollback and sync must keep working.
## Open questions
- Which actions on which swipe direction by default; whether to add mark-as-read-on-scroll as an opt-in setting (off by default).
- Confirmation versus undo for bulk actions.
