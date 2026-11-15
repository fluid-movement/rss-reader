- 2026-11-13T09:28:57Z edited by claude-code: depends_on

- 2026-11-13T10:41:19Z claude-code: Implemented by opencode, reviewed PASS by sonnet (SW never caches data/auth; static review). UNVERIFIED: Lighthouse installability and real phone/iOS install (no browser available to reviewer). Left in progress until verified.

- 2026-11-13T20:26:29Z claude-code: x

- 2026-11-13T20:30:51Z claude-code: Checker (main 7475b9d, prod build, DB copy): pnpm check/test(501)/test:mobile(26) pass. Manifest+icons (180/192/512/maskable) valid and linked; SW controls page, caches only build/static assets, API/__data.json/auth/navigations network-only; read-state toggle via /api/state reflected immediately in /unread data+HTML with SW active; logout/login fine; offline nav shows offline.html 503. Chrome CDP Page.getInstallabilityErrors = [] on localhost; criterion 2 checked on that basis (Lighthouse 13.6 has no PWA category, so the CDP check it wraps was used). NOT verified, criterion 1 left unchecked: install on a real iOS device and real Chrome/Android over HTTPS (add to home screen, apple-touch-icon appearance, standalone launch). Manual step remains; then check criterion 1 and complete.

- 2026-11-15T14:52:27Z claude-code: Verified by the user (2026-11-15): installed as a PWA from https://rss.fluid-movement.de and works.
