---
type: decision
title: Sidebar collapse state lives in an SSR-readable cookie
description: Collapsed folder ids are stored in a cookie (sidebar collapsed set, max 80 ids, about 3.8 KB, pruned to the current user's folders, SameSite=Lax, one year) read in the (app) layout load so the first server render is already correct. localStorage persistence was rejected because it caused a visible expanded-then-collapsed flash (layout shift 0.074) after hydration; the cookie version measured about 0.00015 under 4x CPU and delayed JS. Folder ids are per-user UUIDs so a shared browser cannot leak state; the active view's folder always stays expanded.
date: "2026-11-13"
scope:
  - src/lib/sidebar-preferences.ts
---


