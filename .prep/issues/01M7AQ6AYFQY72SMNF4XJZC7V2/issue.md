---
title: Pull to refresh
kind: code
parent: 01M7AQ6AQZX31HDYRDW498S7R6
depends_on:
  - 01M7AQ6AWTM1Q6QJS0FV6YFXV1
---

Pull down on the article list (when scrolled to the top) to refresh the current view on phones: a feed or folder view refreshes that feed or the feeds in the folder, the All/Unread/Starred/Search views refresh all feeds (same rules as the r shortcut), using the existing refresh actions and cooldown, with a clear pull indicator, a spinner while refreshing and a toast with the result (including 'Refreshed recently' as info). It must work in the installed PWA where the browser's native pull-to-refresh is disabled by the overscroll rules from the foundations issue, must not fight vertical scrolling, the drawer or row swipe gestures, ignores edge starts via the shared helper, and keeps a visible Refresh button as the accessible alternative. Reduced motion shows a simple spinner without elastic movement.

## Open questions
