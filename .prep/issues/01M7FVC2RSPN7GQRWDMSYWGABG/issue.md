---
title: Softer warm light and dark themes
kind: code
---

Make both themes less stark. The shadcn neutral palette is pure white / near-black with zero-chroma greys.

User decisions (2026-11-14): warm tint; light background a papery off-white; dark background a warm dark (not near-black); text softer than pure white/black but very readable; no accent colour for now (the dark sidebar's saturated blue becomes a warm neutral); leave the article reading area as it is.

Scope: colour tokens in src/routes/layout.css (:root and .dark), plus the hard-coded theme-color values that mirror the background (src/app.html, static/manifest.webmanifest, static/offline.html, tests that assert them). Keep text/background contrast at WCAG AA or better.

## Open questions
