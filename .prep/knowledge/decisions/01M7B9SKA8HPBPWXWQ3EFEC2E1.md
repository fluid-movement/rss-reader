---
type: decision
title: First user in the container is created with node --import tsx, not pnpm
description: 'The documented first-user command inside the production image is docker exec <container> node --import tsx scripts/create-user.ts --email ... --name ... --password ... (same for docker compose exec). Reason: the image runs as non-root node and pnpm via corepack cannot download or write its cache at runtime (EACCES, needs network). tsx is a production dependency and the script is already in the image. Local dev still uses pnpm user:create.'
date: "2026-11-13"
issue: 01M7A3T0F3KG6KGGHEHE95NS44
---


