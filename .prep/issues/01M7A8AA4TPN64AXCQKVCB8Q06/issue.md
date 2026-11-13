---
title: Dev seed script
kind: code
parent: 01M7A3SD7245XCB3PK2WNJ4KGW
---

A development seed script that fills the local database so every feature can be seen without subscribing to real feeds.

Seeds: the dev user with the same email, name and password as the `create-user` recipe in the justfile (not personal data; dev only), plus folders, feeds and items covering every feature: several folders and ungrouped feeds; feeds with many items (read, unread, starred mix, varied dates, long and short content, images, links, authors, items with and without full content); a healthy feed, a feed with errors (error_count and last_error set, shown as broken), a never-fetched feed; item state for the dev user.

Safety: the script must refuse to run when NODE_ENV is production or when ORIGIN is not a localhost URL, because a known-password account on the public deployment would be a backdoor. It must never make network requests. Running it twice is safe (it resets the dev user's data rather than duplicating it).

Entry points: `pnpm db:seed` and a `seed` recipe in the justfile. Document in the README.

## Open questions
