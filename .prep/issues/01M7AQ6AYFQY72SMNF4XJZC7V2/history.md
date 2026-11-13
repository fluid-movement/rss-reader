- 2026-11-13T15:12:29Z edited by claude-code: depends_on, requirement

- 2026-11-13T19:39:57Z claude-code: Implemented, ready for check: pull-to-refresh on the list via touch tracker + indicator, visible Refresh button, shared refresh() with info/warning toasts and folder support

- 2026-11-13T19:45:28Z claude-code: Check failed (criterion 3): in the All/Unread/Starred/Search views a refresh inside the 30s cooldown returns 'Refreshed: 0. Skipped: 42. Failed: 0. Refreshed recently, try again in a moment.' and src/lib/shortcut-handler.svelte.ts post() only maps the exact string 'Refreshed recently, try again in a moment.' to info, so the toast is type success (observed data-type=success via pull, button and r). The requirement wants 'Refreshed recently' as info. Fix: treat refreshAll results with Refreshed: 0 and Skipped > 0 (or message containing 'Refreshed recently' and no refreshed feeds) as info, add a unit test. Everything else checked passed (pull, cancel, mid-list/edge/horizontal ignored, native PTR prevented, reduced motion, dark, Refresh button, failure toast, folder per-feed refresh accepted, scroll and open article preserved, pnpm check and pnpm test green).

- 2026-11-13T19:46:57Z claude-code: Implemented, ready for check: all-skipped refreshAll results (Refreshed: 0, Skipped > 0) now show an info toast via refreshMessageKind, with unit test
