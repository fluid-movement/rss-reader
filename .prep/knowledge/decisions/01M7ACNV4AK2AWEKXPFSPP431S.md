---
type: decision
title: Seed uses real feeds pulled by the app, not fake data
description: 'User decision: a seed with fabricated feeds and items veils real problems. The seed creates the dev user and folders and queues real popular feeds (verified live 2026-11-13, covering RSS, Atom, RSS 1.0, JSON Feed, gzip/br, redirects, a wrong content type, large feeds and one dead URL); the running app''s scheduler pulls them. The script itself stays network-free and keeps the production guard. Supersedes the seed issue''s fake-fixture design; the guard decision still applies.'
date: "2026-11-13"
issue: 01M7ACNTPSMQ2MMR2Y30R4AJCK
---


