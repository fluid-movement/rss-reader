---
type: decision
title: Seed script may hold the dev credentials but must refuse non-local runs
description: 'The user allowed committing the throwaway dev account (same as the justfile create-user recipe) in the seed script. It must exit before touching the DB when NODE_ENV is production or ORIGIN is not localhost, because the public Coolify deployment has no sign-up and a known-password account there would be a backdoor. Reason: user stated it is not personal data; guard makes it safe to publish.'
date: "2026-11-13"
issue: 01M7A8AA4TPN64AXCQKVCB8Q06
---


