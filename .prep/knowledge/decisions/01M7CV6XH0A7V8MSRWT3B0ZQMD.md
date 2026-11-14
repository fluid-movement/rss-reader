---
type: decision
title: Username login via Better Auth username plugin; internal generated email
description: Login uses username + password; the required Better Auth email column stays but holds a generated internal value never shown to users.
date: "2026-11-14"
issue: 01M7CV6RTG9MWDEW0RETZXNJYB
---

Decision (user, 2026-11-14): the app never sends mail, so sign-in is username + password. Better Auth's core user table requires a unique non-null email, so we keep the column with a generated value (<id>@users.invalid) instead of forking the schema.

Why: the supported username plugin avoids patching Better Auth and re-checking on upgrades. Supersedes the "email+password" wording in the no-public-sign-up decision for sign-in only; no sign-up and passkeys are unchanged.

How to apply: never ask for, display or log the email; create users only through the console command with --username.
