---
type: decision
title: 'Mobile foundations: phone-only 44 px targets, safe-area aliases, scoped overscroll, shared gesture helper'
description: 'Phone rules live in layout.css under max-width 1023px: interactive elements at least 44 px with at least 8 px spacing (switch/checkbox rows widened with ::after), 16 px inputs, tap highlight, links inside running text (p, description slots, article prose) are exempt so paragraphs are not stretched. Safe areas: viewport-fit=cover with --sat/--sar/--sab/--sal aliases used by the header, drawer, main content and sonner offsets. overscroll-behavior none only for (pointer: coarse), (display-mode: standalone) so desktop trackpad swipe-back keeps working. iOS status bar style stays default (black-translucent makes white status text unreadable on the white header). src/lib/gestures.ts is the shared pure helper for the swipe issues: GESTURE_THRESHOLDS {edgeMargin 28, deadZone 10, axisRatio 1.25, commitDistance 80, commitVelocity 0.5, minimumFlickDistance 24}, isEdgeStart, lockAxis, gestureDirection, shouldCommitGesture, articleStep (left = +1 next, right = -1 previous); non-finite inputs fall back to defaults. Verified: desktop pixel-identical to main at 1280 and 1920, 0 touch targets under 44 px on audited screens, emulated safe-area insets. Open for later issues: user-select none on list rows vs the long-press menu, velocity estimator and per-side thresholds, real-phone checks (see the issue log).'
date: "2026-11-13"
scope:
  - src/routes/layout.css
---


