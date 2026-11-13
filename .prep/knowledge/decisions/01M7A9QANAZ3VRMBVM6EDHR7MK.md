---
type: decision
title: Desktop layout uses fixed pane widths, not resizable panes
description: The implementer replaced the draggable resizable panes with CSS fixed widths (sidebar w-72, fixed list column) and CSS-only responsive switching, which removed the SSR layout flash. A browser review judged it acceptable for the simple clean design; it is cramped at about 1024px, tracked in the list follow-up issue. Restore resizing later only if wanted. Refines the three-pane decision.
date: "2026-11-13"
scope:
  - src/lib/components/reader-workspace.svelte
---


