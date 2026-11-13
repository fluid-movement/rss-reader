---
type: decision
title: Cap parallel opencode sessions; use Claude for adversarial security probing
description: 'Six parallel opencode GPT sessions exhausted the OpenAI 5-hour window (99-100%) in a few hours and killed a review mid-run; an opencode review of the extraction DoS fix was also blocked by OpenAI''s cyber_policy filter while probing adversarial HTML. Rule: run at most three opencode sessions at a time, check ai-usage before each launch, and use Claude sonnet reviewers for adversarial or security-probing reviews and as the fallback when OpenAI usage is exhausted; opencode GPT stays the default for implementation and ordinary reviews.'
date: "2026-11-13"
scope:
  - '**'
---


