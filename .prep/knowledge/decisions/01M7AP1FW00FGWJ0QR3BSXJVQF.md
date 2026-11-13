---
type: decision
title: Per-feed settings live in Settings; user-supplied names go through cleanSingleLine
description: Settings page (Reader, Feeds, Retention, Security tabs) owns per-feed title, refresh interval presets and the full-text toggle; /feeds keeps subscribe, remove, folders, refresh and OPML. Reader prefs (font 14-24, width 480-1000) are validated integers applied as CSS variables in the server-rendered layout. Custom feed titles and folder names go through cleanSingleLine (src/lib/server/clean-text.ts) which strips control and bidi override characters and collapses whitespace. Passkey add/rename/delete use Better Auth's passkey client; passkey sign-in was verified end to end with a WebAuthn virtual authenticator.
date: "2026-11-13"
scope:
  - src/routes/(app)/settings/**
---


