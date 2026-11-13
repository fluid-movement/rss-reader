---
type: decision
title: Mobile e2e uses Playwright with a seeded private DB
description: 'Mobile tests run with @playwright/test (pnpm test:mobile) on iPhone 14 and Pixel 7 chromium projects, using CDP touch events, against a production build and a private seeded DB at .e2e/mobile.db (gitignored, never network). Reason: the issue needs automated touch tests with a device checklist for what emulation cannot cover; a private DB keeps the developer''s local.db safe. agent-browser stays the tool for ad hoc agent checks.'
date: "2026-11-13"
issue: 01M7AQ6B4X8WD70PZ22F668DX1
---


