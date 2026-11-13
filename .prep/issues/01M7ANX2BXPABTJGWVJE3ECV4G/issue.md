---
title: Sidebar usability with many feeds
kind: code
parent: 01M7A3SD7245XCB3PK2WNJ4KGW
depends_on:
  - 01M7ANECZ805C0R18WDBG5X07V
priority: low
---

Found by pulling 42 real feeds in 6 folders (pnpm db:seed). 1. Long folder or feed names overlap or truncate the unread count ('Daring Fireball (JSON F… 4…'): names must truncate with an ellipsis while the count stays fully visible. 2. Folders are always expanded, so 42 feeds need about 1,700 px of sidebar scrolling: make folders collapsible (shadcn Collapsible or Sidebar menu pattern), remember the collapsed state per browser, keep the folder that contains the current view open, and keep folder unread totals visible when collapsed. 3. Keyboard and screen reader behavior of the collapse controls must be correct. Keep counts exact and the failing-feed indicator from the previous issue working.

## Open questions
