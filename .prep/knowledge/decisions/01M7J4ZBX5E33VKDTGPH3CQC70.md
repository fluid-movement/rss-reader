---
type: decision
title: Article swipe uses a strip pager with preloaded neighbour panes
description: 'Research: reader/photo apps (Photos, Mail, Reeder) page between items by dragging a strip where the neighbours already exist beside the current item, so there is no blank frame between slide-out and slide-in. Today swipe-navigation.ts slides the article out, switches the route, then slides the new one in, which flashes. Decision (user-approved 2026-11-16): render previous/current/next as sibling panes filled from the preloadData results already fetched by preloadNeighbors; the finger drags the whole strip; on commit settle with a velocity-aware animation, then goto(replace) underneath without a visible re-mount; show a skeleton pane if neighbour data is not loaded; buttons and keyboard reuse the same settle animation; honour prefers-reduced-motion and the edge-swipe guard. Rejected: stack-with-fade (simpler, less physical).'
date: "2026-11-16"
scope:
  - src/lib/swipe-navigation.ts
---


