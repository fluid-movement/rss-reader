---
type: decision
title: Components use only design-system colour tokens
description: App code uses theme tokens only (background, foreground, primary, muted, ...); no palette colours like amber, yellow, blue or white.
date: "2026-11-15"
issue: 01M7FVNA2XZERBQCDV2S1EX1WA
---

Decision (user, 2026-11-15): only use colours from the design system.

Why: the warm themes carry the whole look, and there is no accent yet; palette colours bypass the tokens and ignore light/dark.

How to apply: use token classes (bg-primary, text-muted-foreground, ...). Exceptions: shadcn's stock black modal scrims, and the literal hex theme-color values in app.html, manifest and offline.html, which mirror the background tokens and must change with them. When an accent is added, make it a token first.
