---
title: Mobile test harness and device checklist
kind: code
parent: 01M7AQ6AQZX31HDYRDW498S7R6
depends_on:
  - 01M7AQ6ASHTDEANBMJPPFYBGCK
---

Add touch-emulated Playwright tests (iPhone and Pixel device profiles) for the mobile flows (drawer, list to article, back, swipe between articles, row gestures, pull to refresh, safe-area layout screenshots) and a written real-device checklist (iOS Safari, installed PWA on iOS, Android Chrome) in the README or docs. Tests must run without network using the dev seed or fixtures.
## Open questions
- Whether Playwright becomes a dev dependency of the repo (today reviews install it outside the repo).
