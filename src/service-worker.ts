import { immutable, assets } from '$app/manifest';
import { version } from '$app/env';
import { self as worker } from '$app/service-worker';

const CACHE_PREFIX = 'rss-reader-assets-';
const CACHE = `${CACHE_PREFIX}${version}`;
// SvelteKit 3 equivalents of $service-worker's build + files (root deployment).
const ASSETS = new Set([...immutable, ...assets].map((asset) => `/${asset.path}`));

worker.addEventListener('install', (event) => {
	event.waitUntil(
		(async () => {
			const cache = await caches.open(CACHE);
			// Only public build/static files, never prerendered or authenticated pages.
			await cache.addAll([...ASSETS]);
			// Do not skipWaiting: open tabs must keep their matching build assets.
		})()
	);
});

worker.addEventListener('activate', (event) => {
	event.waitUntil(
		(async () => {
			await Promise.all(
				(await caches.keys())
					.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE)
					.map((key) => caches.delete(key))
			);
			await worker.clients.claim();
		})()
	);
});

worker.addEventListener('fetch', (event) => {
	const { request } = event;
	const url = new URL(request.url);
	// Leave mutations, APIs, auth, actions, data loads and external traffic untouched.
	if (
		request.method !== 'GET' ||
		url.origin !== worker.location.origin ||
		url.search ||
		/^\/(?:api|auth|login)(?:\/|$)/.test(url.pathname) ||
		url.pathname.endsWith('/__data.json')
	) {
		return;
	}

	if (ASSETS.has(url.pathname)) {
		event.respondWith(
			(async () => {
				const cache = await caches.open(CACHE);
				return (await cache.match(url.pathname)) ?? fetch(request);
			})()
		);
	} else if (request.mode === 'navigate') {
		// Pass HTML straight through. Never read, clone or store a user's response.
		event.respondWith(
			fetch(request).catch(async () => {
				const cache = await caches.open(CACHE);
				const fallback = await cache.match('/offline.html');
				return new Response(fallback ? await fallback.text() : 'You are offline', {
					status: 503,
					headers: {
						'Content-Type': fallback ? 'text/html; charset=utf-8' : 'text/plain; charset=utf-8',
						'Cache-Control': 'no-store'
					}
				});
			})
		);
	}
});
