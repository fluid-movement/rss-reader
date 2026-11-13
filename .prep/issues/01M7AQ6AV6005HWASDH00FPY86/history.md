- 2026-11-13T15:12:28Z edited by claude-code: requirement

- 2026-11-13T18:41:57Z claude-code: Implemented, ready for check: swipe paging (pointer events, axis lock, edge guard, horizontal-owner guard, rubber band, reduced motion) via src/lib/swipe-navigation.ts, prev/next buttons plus "N of M" in the reader toolbar, moveArticle/preloadNeighbors in the shortcut handler with replaceState; pnpm check and pnpm test pass; not verified in a real browser or on a real device

- 2026-11-13T18:48:54Z claude-code: Check: browser-verified via CDP touch at 390x844; pnpm check/test pass. Note: goto replaceState option deprecated warning in dev console (use replace). Real-device not verified.
