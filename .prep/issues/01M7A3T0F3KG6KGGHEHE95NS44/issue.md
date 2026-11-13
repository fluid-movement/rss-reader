---
title: Coolify deployment
kind: code
parent: 01M7A3SD7245XCB3PK2WNJ4KGW
depends_on:
  - 01M7A3T00TF51NTJGVCVXB1SF8
---

Switch to adapter-node. Dockerfile (multi-stage), SQLite on a mounted volume, migrations run on start, env config documented (BETTER_AUTH_SECRET, BASE URL, DB path, retention), healthcheck endpoint, instructions for creating the first user with the console command inside the container.

## Open questions
