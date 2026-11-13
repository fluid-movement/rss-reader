---
title: 'Mobile foundations: safe areas, touch targets, overscroll'
kind: code
parent: 01M7AQ6AQZX31HDYRDW498S7R6
priority: high
---

Foundation for the other mobile issues. Add viewport-fit=cover and env(safe-area-inset-*) padding for the header, list and bottom areas (notch, home indicator, installed PWA); audit and raise touch targets to at least 44 px (list icons are size-2 and size-3.5 today, buttons, menu rows, sidebar rows) with at least 8 px spacing; set overscroll-behavior so pulling down in the installed PWA does not reload the whole page and scroll chaining between the list, reader and drawer is controlled; make sure form inputs are 16 px so iOS does not zoom on focus; fix tap highlight and text selection behavior on rows; check the PWA status bar style and theme colors on iOS and Android. Verify with touch-emulated Chromium and on a real phone.
## Open questions
- None yet; confirm iOS status bar style (default vs black-translucent) after trying both on a real device.
