---
type: decision
title: Warm low-chroma themes, no accent for now
description: Light is a papery off-white, dark a warm charcoal, both tinted at hue 65-85; the saturated sidebar blue became a warm neutral.
date: "2026-11-15"
issue: 01M7FVC2RSPN7GQRWDMSYWGABG
---

User decisions (2026-11-14): warm tint, papery off-white light, warm dark, softer-than-pure text, no accent colour yet, leave the article reading area alone.
Values: light bg oklch(0.975 0.008 85) = #f9f6f1, text oklch(0.25 0.012 70); dark bg oklch(0.22 0.008 65) = #1d1a17, text oklch(0.92 0.01 80). Contrast: body text 13-15:1, muted text 5-7:1 (all AA).
How to apply: when an accent is added later, introduce it as one token (--primary or a new one) and re-check contrast; theme-color metas, manifest and offline.html mirror the backgrounds and must change with them.
