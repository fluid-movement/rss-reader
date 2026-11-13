---
type: decision
title: Prefer opencode with OpenAI GPT for implementation and review when usage allows
description: 'User instruction: hand off as much work as possible to opencode agents while OpenAI usage is plentiful. Implementation and review both run through opencode-handoff in separate sessions (reviewer different from implementer), in worktrees with .env and the Playwright toolkit pre-staged inside (opencode denies external directories). Claude sonnet subagents are the fallback when OpenAI usage is exhausted. Check ai-usage before launching.'
date: "2026-11-13"
scope:
  - '**'
---


