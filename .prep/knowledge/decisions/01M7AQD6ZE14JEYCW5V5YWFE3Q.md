---
type: decision
title: Edge-swipe navigation cannot be disabled; design around it
description: 'Research: iOS has no official way to disable the standalone PWA swipe-back gesture (CSS overscroll-behavior-x:none stops history redirect but not the animation; a touchstart preventDefault edge guard is partial and fails while the page is scrolling); on Android the system back gesture is OS-level and cannot be disabled by a web app, while Chrome''s own in-page history swipe is controlled by overscroll-behavior-x. Decision: do not try to disable them. Gestures of our own must ignore touches that start within about 24-28 px of either screen edge; set overscroll-behavior (x and y) so Chrome history swipes and pull-to-refresh reloads are off inside the app; make Back (system gesture, edge swipe or button) always return from the article to the list with scroll preserved (already history-aware); optionally try a touchstart edge guard on iOS but verify on a real device and do not depend on it.'
date: "2026-11-13"
issue: 01M7AQ6AQZX31HDYRDW498S7R6
---


