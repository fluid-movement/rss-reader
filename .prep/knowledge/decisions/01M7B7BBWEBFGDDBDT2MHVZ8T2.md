---
type: decision
title: Folder refresh runs refreshFeed per feed
description: 'There is no folder refresh action, so in a folder view refresh() (pull, Refresh button and the r shortcut) calls refreshFeed once per feed in that folder and shows the worst outcome (error, warning, success, info). Previously r on a folder refreshed everything. Reason: the issue says a folder view refreshes the feeds in the folder and the pull must follow the same rules as r. Toast kind is derived by refreshMessageKind in src/lib/shortcuts.ts.'
date: "2026-11-13"
issue: 01M7AQ6AYFQY72SMNF4XJZC7V2
---


