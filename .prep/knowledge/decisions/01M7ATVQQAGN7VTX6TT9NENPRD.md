---
type: decision
title: Use agent-browser for all browser testing
description: 'User instruction (2026-11-13): use the agent-browser CLI (installed globally with pnpm, binary in ~/Library/pnpm/bin) instead of Playwright scripts for browser testing because it is more token efficient: own session per agent (agent-browser session id --scope worktree), snapshot -i with @eN refs rather than screenshots, screenshot --if-changed only for visual judgement, set device/viewport/media for emulation. Raw touch swipes (Input.dispatchTouchEvent) and safe-area insets (Emulation.setSafeAreaInsetsOverride) are not agent-browser commands: use a small CDP script against ''agent-browser get cdp-url'' (Node has a global WebSocket) or synthetic pointer events via eval. The Playwright toolkit staged in worktrees is no longer needed; the repo-level mobile test harness issue may still add Playwright as a dev dependency for committed tests.'
date: "2026-11-13"
scope:
  - '**'
---


