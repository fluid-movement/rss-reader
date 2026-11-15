---
title: Use only design-system colours
kind: code
---

Replace hard-coded palette colours with theme tokens: amber stars and yellow search highlight (now primary), blue/amber swipe actions (now primary/muted with their foregrounds). Shadcn's stock black modal scrims are left as they are. The literal hex values in app.html, manifest and offline.html mirror the tokens because those cannot use CSS variables.

## Open questions
