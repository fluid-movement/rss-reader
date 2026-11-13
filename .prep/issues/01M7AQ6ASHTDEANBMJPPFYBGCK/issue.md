---
title: 'Mobile foundations: safe areas, touch targets, overscroll'
kind: code
parent: 01M7AQ6AQZX31HDYRDW498S7R6
priority: high
---

Foundation for the other mobile issues (decisions: see the mobile epic). 1. Add viewport-fit=cover and env(safe-area-inset-*) padding for the app header, list, reader and drawer (notch, home indicator, installed PWA); use dvh/svh correctly. 2. Audit and raise touch targets to at least 44 px with at least 8 px spacing: list row icons (size-2, size-3.5 today), toolbar buttons, menu rows, sidebar rows, tabs, dialogs, switch rows on Settings. 3. Set overscroll-behavior (x and y) so pulling down in the installed PWA does not reload the page, Chrome's in-page history swipe is off, and scroll chaining between the list, reader and drawer is controlled; keep native pull-to-refresh behavior out of the way of the later custom one. 4. Form inputs 16 px on phones so iOS does not zoom on focus; sensible tap highlight and text selection behavior on rows and buttons; hover-only affordances must have touch equivalents. 5. Our own touch gestures (built later) must ignore touches that start within about 24-28 px of either screen edge: provide one shared helper for that and for gesture thresholds (dead zone, axis lock, velocity) that the swipe issues reuse, with unit tests. 6. Check PWA display modes: status bar style and theme colors on iOS and Android (try default and black-translucent), standalone vs browser behavior of the same CSS (use display-mode media queries only where needed). Do not change the desktop layout.

## Open questions
